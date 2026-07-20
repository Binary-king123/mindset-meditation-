'use server';

// Auth server actions. Sign-in runs here rather than in the browser so that a
// username can be resolved to its email without ever sending that email to the
// client (which would turn the login form into an email-harvesting endpoint).
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, codeMatches, issueToken, verificationCode } from '@/lib/admin-verify';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  /** True when Supabase requires email confirmation before the account works. */
  needsConfirmation?: boolean;
  /** True when the account is an admin and still owes the verification code. */
  needsAdminCode?: boolean;
}

export async function signUpAction(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const { password } = input;

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, full_name: username } },
  });

  if (error) return { error: error.message };

  // Belt and braces: Supabase returns a user with no identities when the email
  // is already registered, instead of an error.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      error: 'An account with that email already exists. Sign in instead.',
      field: 'email',
    };
  }

  return { ok: true, needsConfirmation: !data.session };
}

export async function signInAction(input: {
  identifier: string;
  password: string;
}): Promise<AuthResult> {
  const identifier = input.identifier.trim();
  const { password } = input;

  if (!identifier) return { error: 'Enter your username or email.', field: 'identifier' };
  if (!password) return { error: 'Enter your password.', field: 'password' };

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

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

  const code = input.code.trim();
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

/** Clears admin verification — called on sign-out. */
export async function clearAdminVerification(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
