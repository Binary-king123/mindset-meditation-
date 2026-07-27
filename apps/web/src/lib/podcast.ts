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

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'podcast'}-${suffix}`;
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

export const DEMO_PLAYLISTS: PlaylistSummary[] = [
  {
    id: 'demo-playlist-1',
    title: 'Relaxation',
    slug: 'playlists',
    description: 'Calming sessions for peace, softness, and stillness.',
    thumbnail_url: null,
    track_count: 0,
    total_duration_seconds: 0,
  },
  {
    id: 'demo-playlist-2',
    title: 'Still Waters',
    slug: 'playlists',
    description: 'Meditative soundscapes inspired by lakes, light, and quiet mornings.',
    thumbnail_url: null,
    track_count: 0,
    total_duration_seconds: 0,
  },
  {
    id: 'demo-playlist-3',
    title: 'Nature Path',
    slug: 'playlists',
    description: 'Grounding audio and breath-led mindfulness inspired by open landscapes.',
    thumbnail_url: null,
    track_count: 0,
    total_duration_seconds: 0,
  },
] as const;

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
