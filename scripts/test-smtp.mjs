// Sends one test email using the SMTP settings from .env and prints exactly
// what the mail server said.
//
// The app deliberately shows users a short message when a send fails; this
// prints the raw provider response, which is what you actually need to fix the
// setting that is wrong.
//
//   pnpm smtp:test -- --to you@example.com
//
import nodemailer from 'nodemailer';
import { loadEnv } from './_env.mjs';

loadEnv();

const args = process.argv.slice(2);
const to = args[args.indexOf('--to') + 1];

if (!to || to.startsWith('--')) {
  console.error('Usage: pnpm smtp:test -- --to you@example.com');
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
const port = Number(SMTP_PORT ?? 587);
const secure = SMTP_SECURE ? SMTP_SECURE === 'true' : port === 465;

const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\n✗ Missing in .env: ${missing.join(', ')}\n  See SETUP.md → Email / SMTP.\n`);
  process.exit(1);
}

// SMTP_USER is not a usable fallback for the From address: Resend's username is
// the literal word "resend", and sending with that gets a 550 straight back.
// Accepts "a@b.com" and "Any Display Name <a@b.com>".
const isMailbox = (value) => {
  const angled = value.match(/<([^>]+)>/);
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((angled ? angled[1] : value).trim());
};
const from = [SMTP_FROM, SMTP_USER].find((v) => v && isMailbox(v.trim()))?.trim();

if (!from) {
  console.error(`\n✗ SMTP_FROM is not set to a valid email address (currently: ${SMTP_FROM || '(empty)'}).`);
  console.error('  It must be an address your provider has verified. Add to .env:\n');
  console.error('    SMTP_FROM="The Mindset Meditation <noreply@your-domain.com>"\n');
  if (String(SMTP_HOST).includes('resend')) {
    console.error('  Using Resend? Before verifying your own domain you can send from:\n');
    console.error('    SMTP_FROM="The Mindset Meditation <onboarding@resend.dev>"\n');
    console.error('  Note that unverified senders can only deliver to your own Resend account email.\n');
  }
  process.exit(1);
}

console.log('\nUsing:');
console.log(`  host    ${SMTP_HOST}`);
console.log(`  port    ${port}`);
console.log(`  secure  ${secure}   ${secure ? '(implicit TLS)' : '(STARTTLS)'}`);
console.log(`  user    ${SMTP_USER}`);
console.log(`  pass    ${'*'.repeat(Math.min(String(SMTP_PASS).length, 12))} (${String(SMTP_PASS).length} chars)`);
console.log(`  from    ${from}`);
console.log(`  to      ${to}\n`);

// logger:true prints the full SMTP conversation — the fastest way to see which
// step actually failed.
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  logger: true,
  debug: true,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

function diagnose(err) {
  const detail = (err.response || err.message || '').trim();
  switch (err.code) {
    case 'EAUTH':
      return 'Login rejected → fix SMTP_USER / SMTP_PASS.\n  Gmail: you must use a 16-character App Password, not your account password.\n  Resend: SMTP_USER must be the literal word "resend", SMTP_PASS your re_... API key.';
    case 'EENVELOPE':
      return `Sender or recipient refused → SMTP_FROM ("${from}") must be an address your provider has verified.\n  Resend/Mailgun: verify the domain first, or use their sandbox/onboarding sender.`;
    case 'ECONNECTION':
    case 'ESOCKET':
      return `Could not connect to ${SMTP_HOST}:${port} → check SMTP_HOST/SMTP_PORT, and that secure=${secure} is right for this port (true only for 465).`;
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return `Timed out talking to ${SMTP_HOST}:${port} → usually the wrong port, or SMTP_SECURE the wrong way round (true for 465, false for 587). Some hosts also block outbound port 25.`;
    case 'EDNS':
      return `SMTP_HOST "${SMTP_HOST}" does not resolve → check it for typos.`;
    default:
      if (err.responseCode === 535) return 'Authentication failed (535) → fix SMTP_USER / SMTP_PASS.';
      if (err.responseCode === 550 || err.responseCode === 553)
        return `Sender refused (${err.responseCode}) → SMTP_FROM must be verified with your provider.`;
      return detail ? `Server said: ${detail}` : 'No further detail from the server.';
  }
}

try {
  console.log('→ Verifying connection and credentials…\n');
  await transporter.verify();
  console.log('\n✓ Connection and login OK.\n');

  console.log('→ Sending test message…\n');
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'SMTP test — The Mindset Meditation',
    text: 'If you are reading this, password reset emails will work.',
    html: '<p>If you are reading this, <strong>password reset emails will work</strong>.</p>',
  });

  console.log(`\n✓ Sent. Message id: ${info.messageId}`);
  if (info.accepted?.length) console.log(`  Accepted: ${info.accepted.join(', ')}`);
  if (info.rejected?.length) console.log(`  Rejected: ${info.rejected.join(', ')}`);
  console.log('\nCheck that inbox (and its spam folder).\n');
  process.exit(0);
} catch (err) {
  console.error('\n✗ FAILED');
  console.error(`  code:         ${err.code ?? '(none)'}`);
  console.error(`  responseCode: ${err.responseCode ?? '(none)'}`);
  console.error(`  message:      ${err.message}`);
  if (err.response) console.error(`  response:     ${err.response}`);
  console.error(`\n  → ${diagnose(err)}\n`);
  process.exit(1);
}
