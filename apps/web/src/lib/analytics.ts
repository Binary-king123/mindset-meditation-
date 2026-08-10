// Shapes and formatting for the admin analytics dashboard.
//
// The types here mirror the return values of the four SQL functions added in
// migration 035 (get_admin_dashboard, get_admin_timeseries,
// get_admin_track_stats, get_admin_reach). PostgREST hands back bigint and
// numeric as strings once they exceed the safe integer range and as numbers
// below it, so everything numeric is typed `number | string` and passed through
// `num()` before use rather than trusted to arrive as one or the other.

export interface DashboardStats {
  days: number;
  plays: number;
  plays_prev: number;
  plays_total: number;
  plays_today: number;
  plays_yesterday: number;
  listeners: number;
  listeners_prev: number;
  listeners_total: number;
  listeners_new: number;
  listeners_repeat: number;
  signed_in_plays: number;
  anon_plays: number;
  listened_seconds: number;
  listened_seconds_prev: number;
  listened_seconds_total: number;
  avg_listen_seconds: number;
  retention: number;
  completion: number;
  saves: number;
  saves_prev: number;
  saves_total: number;
  comments: number;
  comments_prev: number;
  comments_total: number;
  accounts: number;
  accounts_prev: number;
  accounts_total: number;
  tracks_published: number;
  tracks_draft: number;
  catalog_seconds: number;
  has_geo: boolean;
}

export interface TimeseriesRow {
  day: string;
  plays: number | string;
  listeners: number | string;
  listened_seconds: number | string;
  saves: number | string;
  comments: number | string;
  signups: number | string;
}

export interface TrackStatsRow {
  track_id: string;
  title: string;
  slug: string;
  status: string;
  published_at: string | null;
  duration_seconds: number;
  plays: number | string;
  listeners: number | string;
  listened_seconds: number | string;
  retention: number | string;
  completions: number | string;
  saves: number | string;
  comments: number | string;
  last_played_at: string | null;
}

export interface ReachEntry {
  key: string;
  plays: number | string;
  listeners: number | string;
}

export type ReachDimension = 'device' | 'browser' | 'os' | 'country' | 'referrer' | 'language';
export type ReachData = Partial<Record<ReachDimension, ReachEntry[]>>;

/** Anything numeric out of PostgREST, coerced once and safely. */
export function num(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The windows the dashboard offers. `days` feeds straight into the RPCs. */
export const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: 3650 },
] as const;

export const DEFAULT_RANGE_DAYS = 30;

/** Clamps an untrusted `?days=` into one of the offered windows. */
export function parseRangeDays(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const days = Number(value);
  return RANGES.some((r) => r.days === days) ? days : DEFAULT_RANGE_DAYS;
}

/** "1.2k", "3.4M" — for figures where the exact digit does not carry meaning. */
export function compact(value: number): string {
  const n = Math.round(value);
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) {
    const k = n / 1000;
    return `${k % 1 === 0 || Math.abs(k) >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  const m = n / 1_000_000;
  return `${m % 1 === 0 || Math.abs(m) >= 100 ? Math.round(m) : m.toFixed(1)}M`;
}

/**
 * Listening time as "3h 24m" / "12m" / "48s".
 *
 * Distinct from formatDuration in lib/podcast.ts, which renders a clock
 * position inside the player ("1:02:03"). A total of accumulated listening is
 * not a timestamp and reads wrong in that form.
 */
export function formatListenTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export interface Delta {
  pct: number;
  direction: 'up' | 'down' | 'flat';
  /** True when the previous window was empty, so a percentage would be a lie. */
  fromZero: boolean;
}

/**
 * Period-over-period change.
 *
 * Growth from zero is reported as `fromZero` rather than as "+100%" or
 * "+∞%" — going from 0 plays to 3 is not a percentage improvement, and
 * rendering one puts a confident-looking number on a meaningless comparison.
 */
export function delta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { pct: 0, direction: current > 0 ? 'up' : 'flat', fromZero: true };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  return {
    pct: rounded,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
    fromZero: false,
  };
}

/** "+12.4%" / "−8%" / "—" */
export function formatDelta(d: Delta): string {
  if (d.fromZero) return d.direction === 'up' ? 'new' : '—';
  if (d.pct === 0) return 'no change';
  const sign = d.pct > 0 ? '+' : '−';
  const abs = Math.abs(d.pct);
  return `${sign}${abs >= 100 ? Math.round(abs) : abs.toFixed(1)}%`;
}

/** Share of a whole as a percentage, guarding the empty case. */
export function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

// Dates on this page are formatted through a module-level, UTC-pinned
// formatter. Server and client must agree on the string or React logs a
// hydration mismatch, and the server's timezone is whatever the VPS was
// installed with — the same reasoning as lib/comments.ts.
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const dayWithYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Aug 10" — axis ticks and compact labels. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayFormatter.format(d);
}

/** "Aug 10, 2026" — table cells, where the year matters. */
export function formatFullDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dayWithYearFormatter.format(d);
}

/** Human labels for the reach dimensions. */
export const REACH_LABELS: Record<ReachDimension, string> = {
  device: 'Device',
  browser: 'Browser',
  os: 'Operating system',
  country: 'Country',
  referrer: 'Traffic source',
  language: 'Language',
};
