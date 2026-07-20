// Second factor for admin sign-in.
//
// After an admin passes email + password they must also enter
// ADMIN_VERIFICATION_CODE. Proof of that is stored in a signed, HttpOnly
// cookie, so the code itself is never sent to the browser and a stolen
// password alone is not enough to reach /admin.
//
// Built on Web Crypto rather than node:crypto because middleware runs on the
// Edge runtime, where node: imports are not available. Web Crypto works in
// both Edge middleware and Node server actions, so one implementation serves
// both callers.
//
// This is a shared static secret, not TOTP — it does not defend against
// someone who can read the server's environment. What it does defend against
// is the realistic case: leaked, phished or guessed admin credentials.

export const ADMIN_COOKIE = 'mm_admin_verified';

/** How long one verification lasts before the code is required again. */
const TTL_SECONDS = 60 * 60 * 12; // 12 hours

export function verificationCode(): string | null {
  const code = process.env.ADMIN_VERIFICATION_CODE?.trim();
  return code && code.length > 0 ? code : null;
}

/** Signing key. Server-only and always present, so no extra env var is needed. */
async function hmacKey(): Promise<CryptoKey> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sign admin sessions');
  // .slice() yields a plain ArrayBuffer — TextEncoder's buffer is typed as
  // ArrayBufferLike, which importKey's signature rejects.
  const material = new TextEncoder().encode(key);
  return crypto.subtle.importKey(
    'raw',
    material.slice().buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

/** Length-independent, constant-time comparison of two strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compares against ADMIN_VERIFICATION_CODE. Both sides are HMAC'd first so the
 * comparison runs over fixed-width digests — a wrong code can't be discovered
 * by timing the response or by probing lengths.
 */
export async function codeMatches(input: string): Promise<boolean> {
  const expected = verificationCode();
  if (!expected) return false;
  const [a, b] = await Promise.all([sign(input), sign(expected)]);
  return safeEqual(a, b);
}

/** Token is bound to the user id, so it can't be replayed on another account. */
export async function issueToken(userId: string): Promise<{ value: string; maxAge: number }> {
  const expires = Date.now() + TTL_SECONDS * 1000;
  const nonce = crypto.randomUUID();
  const payload = `${userId}.${expires}.${nonce}`;
  return { value: `${payload}.${await sign(payload)}`, maxAge: TTL_SECONDS };
}

/**
 * Node-runtime guard used by the admin layout and the admin API routes.
 * Returns true only when the caller holds a valid, unexpired token for this
 * user. Never call this from middleware — see the note in middleware.ts.
 */
export async function adminIsVerified(
  cookieValue: string | undefined,
  userId: string,
): Promise<boolean> {
  return tokenIsValid(cookieValue, userId);
}

export async function tokenIsValid(
  token: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [tokenUser, expiresRaw, nonce, signature] = parts;
  if (tokenUser !== userId) return false;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;

  return safeEqual(signature, await sign(`${tokenUser}.${expiresRaw}.${nonce}`));
}
