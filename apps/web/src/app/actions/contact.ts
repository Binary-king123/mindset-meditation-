'use server';

// Footer enquiry form → an email to BRAND.contactEmail, sent over the same SMTP
// the password-reset flow uses (lib/mailer.ts). Reply-To is set to the sender,
// so replying from the inbox goes straight back to them.
import { BRAND } from '@/lib/brand';
import { explainSmtpError, sendMail, smtpConfigured } from '@/lib/mailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-process, per-instance throttle. Enough to blunt a form-spam script; for a
// multi-instance deployment move this to a shared store.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EnquiryResult {
  ok?: boolean;
  error?: string;
  field?: 'email' | 'message';
}

export async function sendEnquiry(input: {
  email: string;
  message: string;
  /** Honeypot — real users never fill this; bots fill every field. */
  website?: string;
}): Promise<EnquiryResult> {
  // Silently succeed for bots so they don't learn the field is a trap.
  if (input?.website) return { ok: true };

  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  const message = typeof input?.message === 'string' ? input.message.trim() : '';

  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.', field: 'email' };
  if (message.length < 10) {
    return { error: 'Tell us a little more (at least 10 characters).', field: 'message' };
  }
  if (message.length > 3000) return { error: 'That message is too long.', field: 'message' };

  if (!smtpConfigured()) {
    return {
      error: `Messaging is not set up on the server yet. Please email us directly at ${BRAND.contactEmail}.`,
    };
  }

  if (rateLimited(email)) {
    return { error: 'You have sent a few already — please wait a minute and try again.' };
  }

  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  try {
    await sendMail({
      to: BRAND.contactEmail,
      // Reply goes to the enquirer, not our own send address.
      replyTo: email,
      subject: `New enquiry via ${BRAND.name}`,
      text: `From: ${email}\n\n${message}`,
      html: `<p><strong>From:</strong> ${safeEmail}</p><p style="white-space:pre-wrap">${safeMessage}</p>`,
    });
  } catch (err) {
    // The provider's own text is the fastest route to the broken setting, so it
    // goes to the server log in full. It does NOT go to the browser: this form
    // is public and unauthenticated, and those replies quote real addresses —
    // Resend's sandbox rejection, for one, names the account owner's personal
    // inbox. A visitor gets a plain apology and a way through instead.
    console.error('[contact] enquiry failed to send:', explainSmtpError(err), err);
    return {
      error: `Sorry — we could not send that just now. Please email us directly at ${BRAND.contactEmail}.`,
    };
  }

  return { ok: true };
}
