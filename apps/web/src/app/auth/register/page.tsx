'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AtSign, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { BRAND } from '@/lib/brand';
import { signUpAction } from '@/app/auth/actions';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

    if (res.needsConfirmation) {
      // No session until the address is verified, so hand off to sign-in.
      toast.success('Account created! Check your email to confirm it.');
      window.location.assign('/auth/login?confirm=1');
      return;
    }

    // Confirmation disabled — the signup already established a session.
    toast.success('Welcome to ' + BRAND.name + '!');
    window.location.assign('/');
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : null);

  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg grain p-6">
      <div className="w-full max-w-md bg-background rounded-3xl p-8 shadow-2xl glow-soft relative z-10">
        <Logo className="mb-6" />
        <h1 className="text-3xl font-black text-foreground mb-1">Create your account</h1>
        <p className="text-sm text-primary font-semibold mb-3">{BRAND.tagline}</p>
        <p className="text-muted-foreground mb-6">
          Already have one?{' '}
          <Link href="/auth/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>

        {error && !error.field && (
          <p className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
            {error.message}
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1.5">
              Username
            </label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoComplete="username"
                required
                className="w-full pl-10 pr-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder="yourname"
              />
            </div>
            {fieldError('username') ? (
              <p className="text-destructive text-xs mt-1.5">{fieldError('username')}</p>
            ) : (
              <p className="text-muted-foreground text-xs mt-1.5">
                3–20 characters. Letters, numbers and underscores.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full pl-10 pr-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder="you@example.com"
              />
            </div>
            {fieldError('email') && (
              <p className="text-destructive text-xs mt-1.5">{fieldError('email')}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full pl-10 pr-10 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldError('password') && (
              <p className="text-destructive text-xs mt-1.5">{fieldError('password')}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="shine press w-full py-3.5 bg-primary text-white font-bold rounded-xl glow-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
