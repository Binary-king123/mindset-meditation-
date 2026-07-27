#!/usr/bin/env node
// ============================================================
// The Mindset Meditation — seed the first admin account
// ============================================================
// 1) Creates (or reuses) a Supabase Auth user via the GoTrue admin API. The
//    on_auth_user_created_podcast trigger creates the matching profiles row.
// 2) Promotes that user to 'admin' through PostgREST using the service-role
//    key, which is granted UPDATE on profiles.role (ordinary users are not).
//    No database connection string needed.
// Idempotent. Run AFTER the database exists (see fullschema.sql).
//
// Credentials are passed in, never stored: they live only as a hash inside
// Supabase Auth. Nothing to leak from .env or from the repo.
//
// Re-running it on an existing account RESETS that account's password, so this
// is also the way back in if the admin password is lost.
//
//   pnpm seed:admin -- --email you@example.com --password 'S3cret!'
//   pnpm seed:admin                      # prompts for anything omitted
import { loadEnv } from './_env.mjs';

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- credentials come from argv or an interactive prompt, never from .env ---
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!hidden) {
      stdin.resume();
      stdin.setEncoding('utf8');
      stdin.once('data', (d) => {
        stdin.pause();
        resolve(d.toString().trim());
      });
      return;
    }
    // Hidden input: echo nothing while the password is typed.
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(1);
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const email = arg('email') || (await ask('Admin email: '));
const password = arg('password') || (await ask('Admin password (hidden): ', { hidden: true }));

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!email || !password) {
  console.error('❌ An email and password are required');
  console.error("   pnpm seed:admin -- --email you@example.com --password 'S3cret!'");
  process.exit(1);
}
if (password.length < 12) {
  console.error('❌ Use at least 12 characters — this account can publish and delete content.');
  process.exit(1);
}

const authHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
};

async function gotrue(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: { ...authHeaders, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

async function findUser(targetEmail) {
  const res = await gotrue('/auth/v1/admin/users?per_page=200');
  if (!res.ok) return null;
  const users = Array.isArray(res.json) ? res.json : res.json?.users || [];
  return users.find((u) => (u.email || '').toLowerCase() === targetEmail.toLowerCase()) || null;
}

async function main() {
  // 1) Create the auth user, or reset the password of the existing one.
  //
  // Resetting matters: this script used to skip the password entirely when the
  // account already existed, so re-running it to "change the admin password"
  // silently did nothing and left you locked out with the old one.
  let user = await findUser(email);
  if (user) {
    const res = await gotrue(`/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!res.ok) {
      console.error('❌ failed to reset the admin password:', res.status, res.json);
      process.exit(1);
    }
    console.log(`↺ admin auth user already existed: ${email} (${user.id})`);
    console.log('✅ password reset to the one you just entered');
  } else {
    const res = await gotrue('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Administrator' },
      }),
    });
    if (!res.ok) {
      console.error('❌ failed to create admin user:', res.status, res.json);
      process.exit(1);
    }
    user = res.json;
    console.log(`✅ created admin auth user: ${email} (${user.id})`);
  }

  // 2) Grant the admin role through PostgREST with the service-role key.
  //    profiles.role is writable by service_role only (migrations 025/026).
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders,
      'Content-Profile': 'podcast',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ role: 'admin' }),
  });
  const patched = await patch.json().catch(() => null);

  if (!patch.ok) {
    console.error('❌ could not grant the admin role:', patch.status, patched);
    console.error('   Has fullschema.sql been run, and is "podcast" an exposed schema?');
    process.exit(1);
  }
  if (!Array.isArray(patched) || patched.length === 0) {
    console.error('❌ no profile row for that user yet.');
    console.error('   The signup trigger creates it — check on_auth_user_created_podcast exists.');
    process.exit(1);
  }
  console.log(`✅ admin role granted (role=${patched[0].role})`);

  console.log(`\n   Admin login → ${email}  (the password you just entered)`);
  console.log('   Signing in also requires ADMIN_VERIFICATION_CODE from .env\n');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
