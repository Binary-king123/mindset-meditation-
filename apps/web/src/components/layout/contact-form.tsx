'use client';

// Compact enquiry form in the footer. Sends to BRAND.contactEmail via the
// sendEnquiry server action.
import { useState, type FormEvent } from 'react';
import { Loader2, Send, CheckCircle2, Mail } from 'lucide-react';
import { sendEnquiry } from '@/app/actions/contact';

const INPUT =
  'w-full px-3.5 py-2.5 text-sm bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all';

export function ContactForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await sendEnquiry({ email, message, website });
    setLoading(false);

    if (res.error) {
      setError({ message: res.error, field: res.field });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2.5 text-sm text-foreground bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p>Thanks — your message is on its way. We&apos;ll reply to your email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2.5" noValidate>
      {error && !error.field && (
        <p role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      )}

      <div>
        <label htmlFor="enquiry-email" className="sr-only">
          Your email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            id="enquiry-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={`${INPUT} pl-9`}
            required
          />
        </div>
        {error?.field === 'email' && (
          <p className="text-destructive text-xs mt-1">{error.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="enquiry-message" className="sr-only">
          Your message
        </label>
        <textarea
          id="enquiry-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="How can we help?"
          className={INPUT}
          required
        />
        {error?.field === 'message' && (
          <p className="text-destructive text-xs mt-1">{error.message}</p>
        )}
      </div>

      {/* Honeypot — visually hidden, off the tab order. Bots fill it; people don't. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden
      />

      <button
        type="submit"
        disabled={loading}
        className="press inline-flex items-center gap-2 px-4 py-2.5 text-sm bg-primary text-white font-bold rounded-xl glow-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
