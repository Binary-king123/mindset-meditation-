'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AtSign, Mail, Lock } from 'lucide-react';
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  AuthError,
} from '@/components/auth/auth-shell';
import { BRAND } from '@/lib/brand';
import { signUpAction } from '@/app/auth/actions';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signUpAction({ username, email, password });

    if (res.error) {
      setError({ message: res.error, field: res.field });
      setLoading(false);
      return;
    }

    // No email confirmation step — the account is created already verified.
    if (!res.signedIn) {
      toast.success('Account created — sign in to continue.');
      window.location.assign('/auth/login?created=1');
      return;
    }

    toast.success(`Welcome to ${BRAND.name}!`);
    window.location.assign('/');
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : null);

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link href="/auth/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </>
      }
      asideTitle={
        <>
          Start listening to <span className="text-gradient">{BRAND.name}</span>
        </>
      }
      asideText={`${BRAND.tagline}. Save episodes, follow playlists, and pick up where you left off.`}
    >
      {!error?.field && <AuthError message={error?.message} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthField
          id="username"
          label="Username"
          icon={<AtSign className="w-4 h-4" />}
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoComplete="username"
          placeholder="yourname"
          error={fieldError('username')}
          hint="3–20 characters. Letters, numbers and underscores."
          required
        />

        <AuthField
          id="email"
          label="Email"
          type="email"
          icon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          error={fieldError('email')}
          required
        />

        <AuthField
          id="password"
          label="Password"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={fieldError('password')}
          reveal
          required
        />

        <AuthSubmit loading={loading} loadingLabel="Creating…">
          Create account
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
