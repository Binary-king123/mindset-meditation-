'use client';

// Step one of password recovery: ask the server to email a recovery link.
//
// The actual work happens in requestPasswordResetAction, which mints the link
// with the service role and sends it over our own SMTP — Supabase's built-in
// sender only reaches project team members, so relying on it means real users
// never get the email.
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, MailCheck, ArrowLeft } from 'lucide-react';
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  AuthError,
} from '@/components/auth/auth-shell';
import { requestPasswordResetAction } from '@/app/auth/actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError(null);
    setLoading(true);

    const res = await requestPasswordResetAction({ email });
    setLoading(false);

    // A delivery failure is a server misconfiguration rather than a fact about
    // this address, so it is shown plainly — otherwise a broken mail setup is
    // indistinguishable from success and impossible to debug.
    if (res.error) {
      if (res.field === 'email') setFieldError(res.error);
      else setError(res.error);
      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      title={sent ? 'Check your inbox' : 'Reset your password'}
      subtitle={
        sent ? undefined : "Enter your email and we'll send you a link to set a new password."
      }
      asideTitle={
        <>
          Locked out? <span className="text-gradient">It happens.</span>
        </>
      }
      asideText="Enter the email address on your account and we will send you a secure link to choose a new password."
    >
      {sent ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary grid place-items-center mx-auto mb-5">
            <MailCheck className="w-7 h-7" />
          </div>
          <p className="text-foreground leading-relaxed">
            If an account exists for{' '}
            <span className="font-semibold break-all">{email.trim().toLowerCase()}</span>, a
            password reset link is on its way.
          </p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            The link expires in an hour and works once. Check your spam folder if it has not
            arrived in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail('');
            }}
            className="mt-6 text-sm font-semibold text-primary hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <AuthField
              id="email"
              label="Email"
              type="email"
              icon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              error={fieldError}
              required
            />
            <AuthSubmit loading={loading} loadingLabel="Sending…">
              Send reset link
            </AuthSubmit>
          </form>
        </>
      )}

      <Link
        href="/auth/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </Link>
    </AuthShell>
  );
}
