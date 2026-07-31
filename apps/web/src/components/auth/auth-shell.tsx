'use client';

// Shared chrome and form controls for the auth pages.
//
// Login, register, forgot-password and reset-password were each repeating the
// same split-screen layout and the same label/icon/input/error block. They all
// come from here now, so a change to the auth look happens in one file.
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Logo, LogoMark } from '@/components/layout/logo';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

export function AuthShell({
  title,
  subtitle,
  asideTitle,
  asideText,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Headline on the decorative panel, hidden below lg. */
  asideTitle: ReactNode;
  asideText: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex stream-shell">
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden grain">
        <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={`auth-ring-${i}`}
              className="absolute rounded-full border border-foreground/10 pulse-ring"
              style={{
                width: `${16 + i * 10}rem`,
                height: `${16 + i * 10}rem`,
                animationDelay: `${i * 1.3}s`,
              }}
            />
          ))}
        </div>
        <div className="max-w-md text-foreground relative z-10">
          <LogoMark className="w-16 h-16 rounded-3xl mb-8 breathe" />
          <h1
            className="text-5xl font-black mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-outfit)' }}
          >
            {asideTitle}
          </h1>
          <p className="text-foreground/70 text-lg leading-relaxed">{asideText}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-transparent">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="stream-panel rounded-[2rem] p-6 md:p-8 text-center mb-8">
            <Logo className="mb-6 lg:hidden justify-center" />
            <h2 className="text-3xl font-black text-foreground">{title}</h2>
            {subtitle && <div className="text-muted-foreground mt-2">{subtitle}</div>}
          </div>
          <div className="stream-card rounded-[2rem] p-6 md:p-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

/** Default aside copy, so pages that have nothing specific to say can skip it. */
export const AUTH_ASIDE_TEXT = `${BRAND.tagline}. Your practice is right where you left it.`;

const INPUT_BASE =
  'w-full py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all';

export function AuthField({
  id,
  label,
  icon,
  error,
  hint,
  /** Renders a show/hide toggle and flips the input type. */
  reveal,
  ...input
}: {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string | null;
  hint?: string;
  reveal?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <input
          id={id}
          // Phone keyboards capitalise, autocorrect and add a trailing space
          // after autofill — all of which silently corrupt an email or
          // password field and produce an "incorrect password" with no
          // visible cause.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...input}
          type={reveal ? (shown ? 'text' : 'password') : input.type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(INPUT_BASE, 'pl-10', reveal ? 'pr-10' : 'pr-4')}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            // Sized as a target, not as an icon: the button used to be exactly
            // the 16px glyph, which is well under the 24px touch minimum and
            // genuinely awkward to hit on a phone. The icon is unchanged; only
            // the hit area grew, and pr-10 on the input already reserves it.
            className="absolute right-0 top-0 grid h-full w-11 place-items-center rounded-r-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs mt-1.5">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs mt-1.5">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Full-width submit button with the spinner state every auth form needs. */
export function AuthSubmit({
  loading,
  children,
  loadingLabel,
}: {
  loading: boolean;
  children: ReactNode;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="shine press w-full py-3.5 bg-primary text-white font-bold rounded-xl glow-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {loading ? loadingLabel : children}
    </button>
  );
}

/** Page-level (non field-specific) error banner. */
export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3"
    >
      {message}
    </p>
  );
}
