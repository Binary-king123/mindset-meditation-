'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Lock, Loader2, Eye, EyeOff, MailCheck } from 'lucide-react';
import { Logo, LogoMark } from '@/components/layout/logo';
import { BRAND } from '@/lib/brand';
import { signInAction } from '@/app/auth/actions';
import { toast } from 'sonner';

function LoginForm() {
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('confirm') === '1';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signInAction({ identifier, password });

    if (res.error) {
      setError({ message: res.error, field: res.field });
      setLoading(false);
      return;
    }

    toast.success('Welcome back!');
    // Admins owe the verification code before /admin will open.
    // Hard navigation so every client reads the freshly-set auth cookies.
    window.location.assign(res.needsAdminCode ? '/auth/verify' : '/');
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
    >
      <div className="text-center mb-8">
        <Logo className="mb-6 lg:hidden justify-center" />
        <h2 className="text-3xl font-black text-foreground">Sign in</h2>
        <p className="text-muted-foreground mt-2">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-primary font-semibold hover:underline">
            Get started free
          </Link>
        </p>
      </div>

      {justRegistered && (
        <div className="mb-6 flex gap-3 text-sm text-foreground bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <MailCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p>
            Account created. Check your inbox for the confirmation link, then sign in below.
          </p>
        </div>
      )}

      {error && !error.field && (
        <p className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
          {error.message}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-foreground mb-1.5">
            Username or email
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              className="w-full pl-10 pr-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              placeholder="yourname or you@example.com"
            />
          </div>
          {error?.field === 'identifier' && (
            <p className="text-destructive text-xs mt-1.5">{error.message}</p>
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
              autoComplete="current-password"
              required
              className="w-full pl-10 pr-10 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              placeholder="••••••••"
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
          {error?.field === 'password' && (
            <p className="text-destructive text-xs mt-1.5">{error.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="shine press w-full py-3.5 bg-primary text-white font-bold rounded-xl glow-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex aurora-bg">
      {/* Left — decorative */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden grain">
        <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={`login-ring-${i}`}
              className="absolute rounded-full border border-white/10 pulse-ring"
              style={{
                width: `${16 + i * 10}rem`,
                height: `${16 + i * 10}rem`,
                animationDelay: `${i * 1.3}s`,
              }}
            />
          ))}
        </div>
        <div className="max-w-md text-white relative z-10">
          <LogoMark className="w-16 h-16 rounded-3xl mb-8 breathe" />
          <h1
            className="text-5xl font-black mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-outfit)' }}
          >
            Welcome back to <span className="text-gradient">{BRAND.name}</span>
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            {BRAND.tagline}. Your practice is right where you left it.
          </p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-primary" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
