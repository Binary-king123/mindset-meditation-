// Outbound email over plain SMTP.
//
// Supabase's built-in email sender only delivers to members of your own
// project team and is rate-limited to a couple of messages an hour, so a real
// user asking for a password reset simply never receives anything. Rather than
// depend on it, the app generates the recovery link itself (see
// requestPasswordResetAction) and sends it through whatever SMTP server is
// configured here.
//
// Server-only: nodemailer opens TCP sockets, so this must never reach the
// browser bundle. It is imported exclusively from server actions.
import { BRAND } from '@/lib/brand';
import nodemailer, { type Transporter } from 'nodemailer';

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && senderAddress(),
  );
}

/**
 * The address messages are sent from.
 *
 * SMTP_USER is NOT a usable fallback: several providers use a fixed literal
 * there (Resend's is the word "resend"), and sending with that as the From
 * address gets the message rejected outright with "550 Invalid `from` field".
 * So an address is only accepted here if it actually looks like one.
 */
function senderAddress(): string | null {
  for (const candidate of [process.env.SMTP_FROM, process.env.SMTP_USER]) {
    const value = candidate?.trim();
    if (value && isMailbox(value)) return value;
  }
  return null;
}

/** True for "a@b.com" and for "Any Display Name <a@b.com>". */
function isMailbox(value: string): boolean {
  const angled = value.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

/** The connection settings, read fresh from the environment. */
function smtpOptions() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via
    // STARTTLS. Getting this backwards is the usual cause of a connection
    // that hangs and then times out.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  };
}

let transporter: Transporter | undefined;
let transporterKey: string | undefined;

/**
 * A transporter for the CURRENT settings, reused while those settings hold.
 *
 * The cache is deliberately keyed on the settings themselves rather than being
 * a plain one-shot singleton. A singleton pins whatever the environment held
 * the first time a message was sent and never looks again, so rotating the
 * provider API key — or moving between providers — keeps authenticating with
 * the dead credential until someone restarts the process. That failure is
 * awkward to diagnose, because `pnpm smtp:test` builds its own transporter and
 * therefore reports the new key working perfectly while the running app is
 * still failing on the old one. Keying on the config makes the swap take
 * effect on the next send.
 */
function transport(): Transporter {
  const options = smtpOptions();
  const key = JSON.stringify(options);

  if (!transporter || transporterKey !== key) {
    // Let the previous pool's sockets go rather than leaking them on rotation.
    transporter?.close();
    transporter = nodemailer.createTransport(options);
    transporterKey = key;
  }
  return transporter;
}

function sender(): string {
  const from = senderAddress();
  if (!from) {
    throw new Error(
      'SMTP_FROM is not set to a valid email address. It must be an address your provider has verified, e.g. SMTP_FROM="The Mindset Meditation <noreply@your-domain.com>". With Resend you can use onboarding@resend.dev before verifying a domain.',
    );
  }
  // Already in "Name <addr>" form? Leave it alone.
  return from.includes('<') ? from : `${BRAND.name} <${from}>`;
}

/**
 * Turns a nodemailer failure into something a person can act on.
 *
 * "The mail server rejected it" is useless on its own — every one of these
 * cases has a different fix, and the provider already told us which one it is.
 */
export function explainSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const detail = (e?.response || e?.message || '').trim();
  const tail = detail ? ` (server said: ${detail.slice(0, 180)})` : '';

  switch (e?.code) {
    case 'EAUTH':
      return `The mail server rejected the login. Check SMTP_USER and SMTP_PASS. If this is Gmail you must use a 16-character App Password, not your normal password.${tail}`;
    case 'EENVELOPE':
      return `The mail server rejected the sender or recipient address. SMTP_FROM must be an address your provider has verified for you.${tail}`;
    case 'ECONNECTION':
    case 'ESOCKET':
      return `Could not connect to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}. Check SMTP_HOST and SMTP_PORT, and that SMTP_SECURE matches the port (true for 465, false for 587).${tail}`;
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return `The connection to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587} timed out. This is usually the wrong port, or SMTP_SECURE set the wrong way round for it (true for 465, false for 587).${tail}`;
    case 'EDNS':
      return `SMTP_HOST "${process.env.SMTP_HOST}" could not be resolved. Check it for typos.${tail}`;
    default:
      break;
  }

  // No code, but the SMTP reply code often says it plainly.
  if (e?.responseCode === 535) {
    return `Authentication failed (535). Check SMTP_USER and SMTP_PASS.${tail}`;
  }
  if (e?.responseCode === 550 || e?.responseCode === 553) {
    return `The sender address was refused (${e.responseCode}). SMTP_FROM must be verified with your provider.${tail}`;
  }

  return `The mail server rejected the message.${tail}`;
}

export async function sendMail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies from the inbox should go — e.g. an enquiry's sender. */
  replyTo?: string;
}): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env — see SETUP.md.',
    );
  }
  await transport().sendMail({ from: sender(), ...message });
}

/**
 * HTML entity-escaping for values interpolated into the email body. Without it
 * a display name containing markup would be injected into every recipient's
 * inbox.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The password reset email. Deliberately plain HTML with inline styles — email
 * clients strip <style> blocks, external CSS and most modern layout.
 */
export function passwordResetEmail(link: string): { subject: string; html: string; text: string } {
  const safeLink = escapeHtml(link);
  const brand = escapeHtml(BRAND.name);

  return {
    subject: `Reset your ${BRAND.name} password`,
    text: [
      `Reset your ${BRAND.name} password`,
      '',
      'Open the link below to choose a new password. It expires in 1 hour and can only be used once.',
      '',
      link,
      '',
      'If you did not ask for this, you can ignore this email — your password will not change.',
    ].join('\n'),
    html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(20,20,43,0.08);">
        <tr><td style="background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 55%,#22d3ee 100%);height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#14142b;">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a68;">
            Someone asked to reset the password for your ${brand} account. Choose a new one with the button below.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#8b5cf6;">
            <a href="${safeLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Choose a new password</a>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b6b85;">
            This link expires in <strong>1 hour</strong> and can only be used once.
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6b85;">
            If the button does not work, copy this address into your browser:<br>
            <span style="word-break:break-all;color:#8b5cf6;">${safeLink}</span>
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <p style="margin:0;padding-top:20px;border-top:1px solid #ececf4;font-size:12px;line-height:1.6;color:#8a8aa3;">
            If you did not ask for this, you can safely ignore this email — your password will not change.
          </p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#8a8aa3;">${brand}</p>
    </td></tr>
  </table>
</body></html>`,
  };
}
