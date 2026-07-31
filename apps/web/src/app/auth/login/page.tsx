'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { safeRedirect } from '@/lib/safe-redirect';
import { User, Lock, Loader2, MailCheck, KeyRound } from 'lucide-react';
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  AuthError,
  AUTH_ASIDE_TEXT,
} from '@/components/auth/auth-shell';
import { BRAND } from '@/lib/brand';
import { signInAction } from '@/app/auth/actions';
import { toast } from 'sonner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginForm() {
  const searchParams = useSearchParams();
  // Only reached when signup created the account but could not open a session.
  const redirectParam = searchParams.get('redirect');
  const justRegistered = searchParams.get('created') === '1';
  const justReset = searchParams.get('reset') === '1';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  /** Caught before the round-trip so obvious mistakes answer instantly. */
  function localError(): { message: string; field: string } | null {
    if (!identifier.trim()) {
      return { message: 'Enter your username or email.', field: 'identifier' };
    }
    if (identifier.includes('@') && !EMAIL_RE.test(identifier.trim())) {
      return { message: 'That email address does not look right.', field: 'identifier' };
    }
    if (!password) return { message: 'Enter your password.', field: 'password' };
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const invalid = localError();
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setLoading(true);

    const res = await signInAction({ identifier, password, remember });

    if (res.error) {
      setError({ message: res.error, field: res.field });
      setLoading(false);
      return;
    }

    toast.success('Welcome back!');
    // Middleware sends an admin here with ?redirect=<the page they wanted>.
    // Carry it through the verification step so they land where they were
    // going rather than back on the homepage.
    // Hard navigation so every client reads the freshly-set auth cookies.
    window.location.assign(
      res.needsAdminCode
        ? `/auth/verify?redirect=${encodeURIComponent(safeRedirect(redirectParam, '/admin'))}`
        : safeRedirect(redirectParam, '/'),
    );
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : null);

  return (
    <>
      {justRegistered && (
        <div className="mb-6 flex gap-3 text-sm text-foreground bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <MailCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p>Account created. Sign in below with the details you just chose.</p>
        </div>
      )}

      {justReset && (
        <div className="mb-6 flex gap-3 text-sm text-foreground bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <KeyRound className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p>Password updated. Sign in with your new password.</p>
        </div>
      )}

      {!error?.field && <AuthError message={error?.message} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthField
          id="identifier"
          label="Username or email"
          icon={<User className="w-4 h-4" />}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          placeholder="yourname or you@example.com"
          error={fieldError('identifier')}
          required
        />

        <AuthField
          id="password"
          label="Password"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
          error={fieldError('password')}
          reveal
          required
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex min-h-[24px] items-center gap-2 py-1 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary accent-[hsl(var(--primary))]"
            />
            Remember me
          </label>
          <Link
            href="/auth/forgot-password"
            className="inline-flex min-h-[24px] items-center py-1 text-sm font-semibold text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <AuthSubmit loading={loading} loadingLabel="Signing in…">
          Sign in
        </AuthSubmit>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      subtitle={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-primary font-semibold hover:underline">
            Get started free
          </Link>
        </>
      }
      asideTitle={
        <>
          Welcome back to <span className="text-gradient">{BRAND.name}</span>
        </>
      }
      asideText={AUTH_ASIDE_TEXT}
    >
      <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
