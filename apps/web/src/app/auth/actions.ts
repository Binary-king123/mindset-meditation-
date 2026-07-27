'use server';

// Auth server actions. Sign-in runs here rather than in the browser so that a
// username can be resolved to its email without ever sending that email to the
// client (which would turn the login form into an email-harvesting endpoint).
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, codeMatches, issueToken, verificationCode } from '@/lib/admin-verify';
import { SESSION_ONLY_COOKIE } from '@/lib/supabase/cookie-options';
import { sendMail, smtpConfigured, passwordResetEmail, explainSmtpError } from '@/lib/mailer';
import { SITE_URL } from '@/lib/seo';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server actions are ordinary HTTP endpoints — anything can POST arbitrary
 * JSON at them, and these particular ones are reachable without a session. So
 * every field is coerced rather than trusted: reading `.trim()` off a missing
 * property throws an unhandled TypeError and 500s the endpoint.
 */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Verification-code throttling, keyed by user id. In-process: it resets on
// deploy and is per-instance, which is fine for a single-server deployment.
// Behind several instances, move this to a table for a shared counter.
const MAX_CODE_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; at: number }>();

export interface AuthResult {
  error?: string;
  field?: 'username' | 'email' | 'password' | 'identifier' | 'code';
  ok?: boolean;
  /** Signup only: false when the account was created but auto sign-in failed. */
  signedIn?: boolean;
  /** True when the account is an admin and still owes the verification code. */
  needsAdminCode?: boolean;
}

export async function signUpAction(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const username = text(input?.username).toLowerCase();
  const email = text(input?.email).toLowerCase();
  const password = typeof input?.password === 'string' ? input.password : '';

  if (!USERNAME_RE.test(username)) {
    return {
      error: 'Username must be 3–20 characters, using only letters, numbers, or underscores.',
      field: 'username',
    };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: 'Enter a valid email address.', field: 'email' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.', field: 'password' };
  }

  const admin = createAdminClient();

  // Pre-check both fields so the user gets a precise message. Supabase itself
  // stays silent about existing emails to prevent enumeration, so without this
  // a duplicate signup looks like a success and goes nowhere.
  // eq, not ilike: "_" and "%" are LIKE wildcards, and usernames may contain
  // underscores — "sub_ash" would otherwise collide with "subhash". Both
  // columns are stored lowercased, so exact match is already case-insensitive.
  const [{ data: byUsername }, { data: byEmail }] = await Promise.all([
    admin.from('profiles').select('id').eq('username', username).maybeSingle(),
    admin.from('profiles').select('id').eq('email', email).maybeSingle(),
  ]);

  if (byUsername) {
    return { error: 'That username is already taken. Try another one.', field: 'username' };
  }
  if (byEmail) {
    return {
      error: 'An account with that email already exists. Sign in instead.',
      field: 'email',
    };
  }

  // Created with the service role and `email_confirm: true`, which marks the
  // address as already verified. No confirmation email, no waiting — the user
  // signs up and is straight in. This also makes signup independent of the
  // Supabase dashboard's "Confirm email" toggle, so the behaviour is the same
  // on every environment.
  //
  // The on_auth_user_created_podcast trigger reads user_metadata.username to
  // build the profile row.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: username },
  });

  if (createError) {
    const message = createError.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) {
      return {
        error: 'An account with that email already exists. Sign in instead.',
        field: 'email',
      };
    }
    return { error: createError.message };
  }

  // Sign the new account in immediately so they land on the site, not a form.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  // The account was created either way, so never report this as a failed
  // signup — just route them to the login form instead of a signed-out home.
  return { ok: true, signedIn: !signInError };
}

export async function signInAction(input: {
  identifier: string;
  password: string;
  /** Unticked "Remember me" ends the session when the browser closes. */
  remember?: boolean;
}): Promise<AuthResult> {
  const identifier = text(input?.identifier);
  const password = typeof input?.password === 'string' ? input.password : '';

  if (!identifier) return { error: 'Enter your username or email.', field: 'identifier' };
  if (!password) return { error: 'Enter your password.', field: 'password' };

  // Written before signInWithPassword so the auth cookies it is about to set
  // are already subject to it — see lib/supabase/cookie-options.ts.
  const store = await cookies();
  if (input?.remember === false) {
    store.set(SESSION_ONLY_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  } else {
    store.delete(SESSION_ONLY_COOKIE);
  }

  let email = identifier.toLowerCase();

  // Not an email? Then it's a username — look up the address it belongs to.
  if (!identifier.includes('@')) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('username', identifier.toLowerCase())
      .maybeSingle();

    // Deliberately the same message as a bad password, so this can't be used to
    // discover which usernames exist.
    if (!profile?.email) {
      return { error: 'Incorrect username/email or password.', field: 'identifier' };
    }
    email = profile.email;
  }

  const supabase = await createClient();
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Retry without surrounding whitespace.
  //
  // The identifier is trimmed above but the password deliberately is not —
  // a password may legitimately contain spaces. In practice, though, leading
  // or trailing whitespace comes from a paste that grabbed one character too
  // many, or a phone keyboard adding a space after autofill, and the result is
  // an "incorrect password" the user cannot see the cause of.
  //
  // Trying the exact string first keeps genuine space-bearing passwords
  // working; the retry only happens when trimming would actually change the
  // string, so it costs nothing in the normal case.
  const trimmed = password.trim();
  if (error && trimmed && trimmed !== password) {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password: trimmed }));
  }

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('not confirmed')) {
      return {
        error: 'Confirm your email first — check your inbox for the verification link.',
        field: 'identifier',
      };
    }
    if (message.includes('invalid login credentials')) {
      return { error: 'Incorrect username/email or password.', field: 'password' };
    }
    return { error: error.message };
  }

  // Admins owe a second factor. The password alone must not reach /admin.
  const userId = data.user?.id;
  if (userId) {
    const { data: role } = await supabase.rpc('get_user_role', { p_user_id: userId });
    if (role === 'admin' || role === 'super_admin') {
      return { ok: true, needsAdminCode: true };
    }
  }

  return { ok: true };
}

/**
 * Second step of admin sign-in. Compares the entered code against
 * ADMIN_VERIFICATION_CODE server-side and, on success, sets a signed HttpOnly
 * cookie that middleware checks before serving anything under /admin.
 */
export async function verifyAdminCodeAction(input: { code: string }): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Session expired — sign in again.', field: 'code' };

  const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });
  if (role !== 'admin' && role !== 'super_admin') {
    return { error: 'This account is not an administrator.', field: 'code' };
  }

  // Fail closed: with no code configured, admin access stays shut rather than
  // silently falling back to password-only.
  if (!verificationCode()) {
    return {
      error: 'Admin verification is not configured. Set ADMIN_VERIFICATION_CODE in .env.',
      field: 'code',
    };
  }

  // Lock the account out after repeated wrong codes. Without this a short
  // numeric code is trivially brute-forced by anyone holding the password.
  const attempt = failedAttempts.get(user.id);
  if (attempt && attempt.count >= MAX_CODE_ATTEMPTS) {
    const waited = Date.now() - attempt.at;
    if (waited < LOCKOUT_MS) {
      const minutes = Math.ceil((LOCKOUT_MS - waited) / 60_000);
      return {
        error: `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        field: 'code',
      };
    }
    failedAttempts.delete(user.id);
  }

  const code = text(input?.code);
  if (!code || !(await codeMatches(code))) {
    const prev = failedAttempts.get(user.id);
    failedAttempts.set(user.id, { count: (prev?.count ?? 0) + 1, at: Date.now() });
    // Also slow each individual guess.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { error: 'Incorrect verification code.', field: 'code' };
  }

  failedAttempts.delete(user.id);

  const token = await issueToken(user.id);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: token.maxAge,
  });

  return { ok: true };
}

/**
 * Step one of password recovery.
 *
 * The link is minted here with the service role and emailed over our own SMTP
 * rather than going through Supabase's built-in sender, which only delivers to
 * members of the project team and caps out at a couple of messages an hour —
 * for a real user it simply never arrives.
 *
 * generateLink also hands back the raw `hashed_token`, so the email can point
 * straight at our own /auth/reset-password instead of bouncing through
 * Supabase's verify endpoint. That removes the PKCE code verifier from the
 * picture entirely, which is what otherwise forces the link to be opened in
 * the exact browser that requested it.
 */
export async function requestPasswordResetAction(input: {
  email: string;
}): Promise<AuthResult & { deliveryFailed?: boolean }> {
  const email = text(input?.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.', field: 'email' };

  if (!smtpConfigured()) {
    return {
      error:
        'Email delivery is not configured on the server yet, so the reset link cannot be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM in .env, then run `pnpm smtp:test -- --to you@example.com` to check them — see SETUP.md.',
      deliveryFailed: true,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  });

  // No such account. Reported as success on purpose: a distinct response here
  // would turn this form into a way to test which addresses are registered.
  if (error || !data?.properties?.hashed_token) return { ok: true };

  const link = `${SITE_URL}/auth/reset-password?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=recovery`;

  try {
    await sendMail({ to: email, ...passwordResetEmail(link) });
  } catch (err) {
    // A send failure is a server misconfiguration, not a fact about this
    // address, so surfacing the real reason leaks nothing and saves a lot of
    // guesswork. explainSmtpError maps the provider's own response to the
    // setting that needs changing.
    console.error('[auth] password reset email failed to send:', err);
    return { error: explainSmtpError(err), deliveryFailed: true };
  }

  return { ok: true };
}

/**
 * Clears the admin second factor and the "remember me" marker — called on
 * sign-out, so the next sign-in starts from a clean slate and the code is
 * required again.
 */
export async function clearAdminVerification(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  store.delete(SESSION_ONLY_COOKIE);
}
