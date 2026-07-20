'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, KeyRound } from 'lucide-react';
import { LogoMark } from '@/components/layout/logo';
import { BRAND } from '@/lib/brand';
import { verifyAdminCodeAction } from '@/app/auth/actions';
import { toast } from 'sonner';

/**
 * Only same-origin relative paths may be redirected to. Without this, a link
 * like /auth/verify?redirect=https://evil.com would bounce a freshly verified
 * admin straight to an attacker's site — a ready-made phishing hop.
 * "//evil.com" is rejected too: browsers read it as protocol-relative.
 */
function safeRedirect(target: string | null): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/admin';
  return target;
}

function VerifyForm() {
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await verifyAdminCodeAction({ code });
    if (res.error) {
      setError(res.error);
      setCode('');
      setLoading(false);
      return;
    }

    toast.success('Verified');
    // Hard navigation so middleware re-reads the freshly set cookie.
    window.location.assign(redirectTo);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md glass-card rounded-3xl p-8 glow-soft"
    >
      <div className="flex items-center gap-3 mb-6">
        <LogoMark className="w-11 h-11 rounded-2xl" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Admin verification
          </p>
          <p className="text-sm text-muted-foreground">{BRAND.name}</p>
        </div>
      </div>

      <h1 className="text-2xl font-black text-foreground mb-2">One more step</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your password was accepted. Enter the admin verification code to open the dashboard.
      </p>

      {error && (
        <p className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-foreground mb-1.5">
            Verification code
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              id="code"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              required
              // biome-ignore lint/a11y/noAutofocus: sole purpose of this page
              autoFocus
              className="w-full pl-10 pr-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground tracking-widest focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="shine press w-full py-3.5 bg-primary text-white font-bold rounded-xl glow-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
        The code is set as <code>ADMIN_VERIFICATION_CODE</code> in the project&apos;s{' '}
        <code>.env</code>. It is checked on the server and never sent to the browser. Verification
        lasts 12 hours.
      </p>
    </motion.div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg grain p-6">
      <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-white" />}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
