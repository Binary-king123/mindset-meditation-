// Derives the small amount of request context the analytics dashboard needs
// from headers the server already has.
//
// Scope is deliberately narrow. This records what kind of device played an
// episode and roughly where the listener arrived from — not who they are. No
// IP address is stored, no full URL, no raw user-agent string: only a bucketed
// device/browser/OS label, the referrer's hostname, a language tag and, where a
// CDN supplies one, a country code. That is enough to answer "what should I
// optimise for" without building a tracking profile out of a meditation app.
//
// Everything here returns null rather than a guess when a header is missing or
// unrecognised. The dashboard renders nulls as "Unknown", which keeps the
// segment totals equal to the play total instead of silently shrinking the
// denominator.

export interface RequestContext {
  country: string | null;
  referrer_host: string | null;
  device_type: 'mobile' | 'tablet' | 'desktop' | 'tv' | 'bot' | 'other' | null;
  browser: string | null;
  os: string | null;
  language: string | null;
}

/**
 * Country from whichever CDN is in front of the app.
 *
 * This project deploys standalone to a plain VPS, where none of these headers
 * exist and the result is null — that is expected, not a failure. Reading the
 * IP from x-forwarded-for and resolving it ourselves would mean shipping a
 * GeoIP database and storing an address we otherwise never keep, so it is not
 * done here.
 */
function country(h: Headers): string | null {
  const raw =
    h.get('cf-ipcountry') ?? // Cloudflare
    h.get('x-vercel-ip-country') ?? // Vercel
    h.get('x-geo-country') ?? // some reverse proxies
    h.get('fastly-client-country'); // Fastly

  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  // Cloudflare sends XX for "unknown" and T1 for Tor exit nodes.
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return code;
}

/**
 * The referring hostname, never the path — a path can carry search terms or
 * identifiers, and the host alone answers "where did they come from".
 *
 * Self-referrals are dropped: a listener moving between pages of this site is
 * not a traffic source, and counting them would swamp every real referrer.
 */
function referrerHost(h: Headers, selfHost: string | null): string | null {
  const raw = h.get('referer') ?? h.get('referrer');
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    if (!host) return null;
    if (selfHost && host === selfHost.replace(/^www\./, '')) return null;
    return host.slice(0, 120);
  } catch {
    return null; // Malformed Referer headers are common; not worth recording.
  }
}

/** Primary language tag, e.g. "en" from "en-GB,en;q=0.9". */
function language(h: Headers): string | null {
  const raw = h.get('accept-language');
  if (!raw) return null;
  const tag = raw.split(',')[0]?.trim().split(';')[0]?.trim();
  if (!tag) return null;
  const base = tag.split('-')[0]?.toLowerCase();
  return base && /^[a-z]{2,3}$/.test(base) ? base : null;
}

/**
 * Buckets a user-agent into the fixed vocabulary the CHECK constraint on
 * play_events.device_type allows.
 *
 * Order matters. Bots are tested first because plenty of crawlers advertise a
 * full desktop UA, and "tablet" before "mobile" because every Android tablet
 * also says "Android" and most iPads now claim to be a Mac. Anything we cannot
 * place becomes 'other' rather than being silently folded into desktop, which
 * would overstate the platform that already dominates.
 */
function deviceType(ua: string): RequestContext['device_type'] {
  if (!ua) return null;
  const s = ua.toLowerCase();

  if (/bot|crawler|spider|crawling|facebookexternalhit|slurp|curl|wget|headless|python-requests|axios|postman/.test(s)) {
    return 'bot';
  }
  if (/smart-?tv|smarttv|googletv|appletv|hbbtv|netcast|web0s|tizen|roku|playstation|xbox/.test(s)) {
    return 'tv';
  }
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/.test(s)) return 'mobile';
  if (/windows nt|macintosh|mac os x|x11|linux|cros/.test(s)) return 'desktop';
  return 'other';
}

/**
 * Browser family.
 *
 * The checks run most-specific-first because the modern UA string is a pile of
 * compatibility tokens: Edge claims Chrome and Safari, Chrome claims Safari,
 * and testing for Safari first would label nearly everything Safari.
 */
function browser(ua: string): string | null {
  if (!ua) return null;
  if (/Edg[A-Z]?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  // iOS forces every browser onto WebKit, so a Chrome-on-iPhone UA says CriOS.
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

/** Operating system family. iOS before macOS, for the same iPad reason. */
function os(ua: string): string | null {
  if (!ua) return null;
  if (/iPhone|iPad|iPod|iOS/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

/**
 * Reads every field at once. Never throws: a play must be recorded even if a
 * header is malformed, so each extractor degrades to null on its own.
 */
export function requestContext(headers: Headers, selfHost: string | null = null): RequestContext {
  const ua = headers.get('user-agent') ?? '';
  return {
    country: country(headers),
    referrer_host: referrerHost(headers, selfHost),
    device_type: deviceType(ua),
    browser: browser(ua),
    os: os(ua),
    language: language(headers),
  };
}
