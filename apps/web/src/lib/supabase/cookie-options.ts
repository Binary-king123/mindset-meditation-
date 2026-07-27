/**
 * "Remember me" support.
 *
 * Supabase writes its auth cookies with a long `maxAge`, so a session survives
 * the browser closing. When the user unticks "Remember me" at sign-in we set
 * the marker cookie below, and both cookie writers (lib/supabase/server.ts and
 * middleware.ts) then strip the lifetime off the auth cookies as they are
 * refreshed — turning them into session cookies that the browser discards when
 * it quits.
 *
 * Doing it at the cookie layer rather than in the sign-in action matters: the
 * cookies are rewritten on every token refresh, so anything applied only once
 * at sign-in would be undone within the hour.
 */
export const SESSION_ONLY_COOKIE = 'mm_session_only';

/**
 * The subset of cookie attributes this app touches. @supabase/ssr types these
 * loosely; narrowing to the fields actually read here keeps `any` out of the
 * two call sites (lib/supabase/server.ts and middleware.ts).
 */
export type CookieOptions =
  | (Record<string, unknown> & { maxAge?: number; expires?: Date | number })
  | undefined;

/** Drops `maxAge`/`expires` when the marker cookie is present. */
export function applySessionOnly(options: CookieOptions, sessionOnly: boolean): CookieOptions {
  if (!sessionOnly || !options) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest;
}
