/**
 * Only same-origin relative paths may be redirected to.
 *
 * Without this, a link like `/auth/login?redirect=https://evil.com` would bounce
 * a freshly signed-in admin straight to an attacker's site — a ready-made
 * phishing hop that borrows this site's credibility. `//evil.com` is rejected
 * too: browsers read a protocol-relative URL as an absolute one.
 *
 * `fallback` is where to go when the target is missing or rejected.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}
