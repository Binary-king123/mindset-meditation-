// Shared podcast helpers. The DB stores metadata only; audio lives in the
// private "podcast-audio" bucket (streamed via signed URLs) and covers in the
// public "podcast-thumbnails" bucket.
export const BUCKETS = {
  audio: 'podcast-audio',
  thumbnails: 'podcast-thumbnails',
  images: 'podcast-images',
  avatars: 'podcast-avatars',
} as const;

/**
 * The subset of `tracks` every episode surface needs: cards, the hero player,
 * episode rows. Four near-identical shapes used to be declared separately in
 * page.tsx, podcast-card.tsx, now-playing-card.tsx and here, which meant adding
 * a field to an episode card meant editing four files.
 *
 * Required fields are the ones no surface can render without. Everything a
 * given surface may not have selected is optional, so a caller can pass a
 * narrow `select()` result without casting.
 */
export interface EpisodeSummary {
  id: string;
  title: string;
  slug: string;
  duration_seconds: number;
  thumbnail_url?: string | null;
  short_description?: string | null;
  instructor_name?: string | null;
  created_at?: string;
  favorite_count?: number;
  comment_count?: number;
}

/** An episode surface that shows a publish date needs it to actually be there. */
export type DatedEpisode = EpisodeSummary & { created_at: string };

export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * The URL-safe stem of a title. Deterministic — no random suffix.
 *
 * This used to append `Math.random()` to every slug, which made each URL
 * unguessable (`morning-calm-k3f9x`), leaked nothing useful to search engines,
 * and only *probabilistically* avoided the `tracks_slug_key` unique
 * constraint — a collision was an unhandled Postgres error. Uniqueness is now
 * resolved explicitly by `uniqueSlug()` below.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, ''); // a trailing dash after the 60-char cut looks broken
  return base || 'episode';
}

/**
 * `slugify` plus a numeric suffix when the stem is already taken:
 * `morning-calm`, then `morning-calm-2`, `morning-calm-3`.
 *
 * `taken` is the set of existing slugs sharing the stem — the caller fetches it
 * with a single prefix query. This is advisory only: two concurrent uploads of
 * the same title can still both pick `-2`, so the caller must also handle the
 * unique-violation and retry (see `adminCreatePodcast`).
 */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const base = slugify(title);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // 1000 episodes with one title is not a real scenario; fall back rather than loop.
  return `${base}-${Date.now()}`;
}

// Columns selected for a podcast card / detail. Plain '*' since episodes are
// grouped by playlist, not by an embedded category row.
export const PODCAST_SELECT = '*';

export interface PlaylistSummary {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  track_count: number;
  total_duration_seconds: number;
}

export const PLAYLIST_SELECT =
  'id, title, slug, description, thumbnail_url, track_count, total_duration_seconds';

/** "3 sessions · 42 min" — the subtitle under a playlist title. */
export function formatPlaylistMeta(trackCount: number, totalSeconds: number): string {
  const tracks = `${trackCount} session${trackCount === 1 ? '' : 's'}`;
  if (!totalSeconds) return tracks;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${tracks} · ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${tracks} · ${hours}h${rest ? ` ${rest}m` : ''}`;
}
