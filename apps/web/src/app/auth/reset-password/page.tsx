'use client';

// Step two of password recovery: the page the emailed link lands on.
//
// Four arrival shapes, all of which have to work:
//   ?token_hash=…&type=recovery     what our own SMTP email sends (see
//                                   requestPasswordResetAction) — verifyOtp
//                                   turns it into a session. No PKCE verifier
//                                   involved, so it works in any browser, on
//                                   any device.
//   ?code=…                         PKCE, if Supabase's own sender is ever
//                                   enabled — exchange it for a session
//   #access_token=…&type=recovery   implicit — the browser client picks it up
//                                   itself via detectSessionInUrl
//   ?error=…&error_code=otp_expired the link died before it was opened
// Anything else means there is no recovery session, which is what an
// already-used link looks like.
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Lock, Loader2, CheckCircle2, TriangleAlert } from 'lucide-react';
import { AuthShell, AuthField, AuthSubmit, AuthError } from '@/components/auth/auth-shell';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Phase = 'verifying' | 'ready' | 'expired' | 'invalid' | 'done';

const MIN_PASSWORD = 8;

function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function establish() {
      const url = new URL(window.location.href);
      // Supabase puts the failure in the query string on some flows and in the
      // fragment on others.
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const errorCode = url.searchParams.get('error_code') ?? hash.get('error_code');
      const errorParam = url.searchParams.get('error') ?? hash.get('error');

      if (errorCode || errorParam) {
        if (!cancelled) setPhase(/expired/i.test(errorCode ?? '') ? 'expired' : 'invalid');
        return;
      }

      // Our own emailed link. verifyOtp exchanges the one-time hash for a
      // recovery session directly.
      const tokenHash = url.searchParams.get('token_hash');
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (cancelled) return;
        // Supabase says "expired" for a consumed token too, which is the right
        // thing to tell the user either way: request a fresh link.
        setPhase(otpError ? (/expired|invalid/i.test(otpError.message) ? 'expired' : 'invalid') : 'ready');
        return;
      }

      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          // The PKCE verifier lives in this browser's storage, so a link opened
          // on a different device or browser cannot complete.
          setPhase(/expired/i.test(exchangeError.message) ? 'expired' : 'invalid');
          return;
        }
        setPhase('ready');
        return;
      }

      // Implicit flow, or the user reloaded the page after the exchange: the
      // client will already have a session either way.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setPhase(session ? 'ready' : 'invalid');
    }

    establish();
    return () => {
      cancelled = true;
    };
  }, []);

  const validate = useCallback(() => {
    const next: { password?: string; confirm?: string } = {};
    if (password.length < MIN_PASSWORD) {
      next.password = `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }, [password, confirm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      // A recovery session is short-lived; if it lapsed mid-form, say so
      // rather than showing a generic failure.
      if (/session|jwt|expired/i.test(updateError.message)) {
        setPhase('expired');
        return;
      }
      setError(updateError.message);
      return;
    }

    setPhase('done');
    toast.success('Password updated');
    // Signed out deliberately, so the new password is actually used to get back
    // in — and so a shared machine isn't left logged in.
    await createClient().auth.signOut();
    setTimeout(() => window.location.assign('/auth/login?reset=1'), 1600);
  }

  if (phase === 'verifying') {
    return (
      <div className="text-center py-6">
        <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Checking your link…</p>
      </div>
    );
  }

  if (phase === 'expired' || phase === 'invalid') {
    const expired = phase === 'expired';
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-destructive/15 text-destructive grid place-items-center mx-auto mb-5">
          <TriangleAlert className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {expired ? 'This link has expired' : 'This link is no longer valid'}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {expired
            ? 'Reset links are good for one hour and can only be used once. Request a fresh one and it will work straight away.'
            : 'This link has already been used, or it was not a complete reset link. Request a new one to try again.'}
        </p>
        <Link
          href="/auth/forgot-password"
          className="shine press mt-6 inline-flex items-center justify-center w-full py-3.5 bg-primary text-white font-bold rounded-xl glow-primary"
        >
          Request a new link
        </Link>
        <Link
          href="/auth/login"
          className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary grid place-items-center mx-auto mb-5">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">Password updated</h3>
        <p className="text-sm text-muted-foreground">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <AuthError message={error} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthField
          id="password"
          label="New password"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          error={fieldErrors.password}
          reveal
          required
        />
        <AuthField
          id="confirm"
          label="Confirm new password"
          icon={<Lock className="w-4 h-4" />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Type it again"
          error={fieldErrors.confirm}
          reveal
          required
        />
        <AuthSubmit loading={loading} loadingLabel="Updating…">
          Update password
        </AuthSubmit>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      asideTitle={
        <>
          Nearly <span className="text-gradient">there.</span>
        </>
      }
      asideText="Pick a password you have not used elsewhere. You will be signed in with it right after."
    >
      <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
