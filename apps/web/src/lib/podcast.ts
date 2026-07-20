// Shared podcast helpers. The DB stores metadata only; audio lives in the
// private "podcast-audio" bucket (streamed via signed URLs) and covers in the
// public "podcast-thumbnails" bucket.
export const BUCKETS = {
  audio: 'podcast-audio',
  thumbnails: 'podcast-thumbnails',
  images: 'podcast-images',
  avatars: 'podcast-avatars',
} as const;

export interface CategoryLite {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
}

export interface Podcast {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  duration_seconds: number;
  audio_path: string;
  thumbnail_url: string | null;
  instructor_name: string | null; // shown as "channel"
  category_id: string | null;
  status: 'draft' | 'published' | 'archived';
  play_count: number;
  favorite_count: number;
  comment_count: number;
  created_at: string;
  category?: CategoryLite | null;
}

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

// Columns selected for a podcast card / detail (with its category embedded).
export const PODCAST_SELECT =
  '*, category:categories(id, name, slug, color, icon)';

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
