// ============================================================
// Core domain types for The Mindset Meditation platform
// ============================================================
// These mirror `fullschema.sql` column for column. That file is the source of
// truth for the database; when a column changes there, change it here too.
//
// Nothing speculative lives in this file. It previously carried ~480 lines of
// types for features that do not exist (subscriptions, downloads, notifications,
// audit logs, categories) plus columns that had been dropped from the schema —
// `Track.category_id`, `is_premium`, `search_vector` and friends. Reading any of
// them typechecked cleanly and returned `undefined` at runtime, which is the
// worst kind of wrong.

/** podcast.profiles.role — matches the profiles_role_check constraint. */
export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin';

/** podcast.tracks.status */
export type TrackStatus = 'draft' | 'published' | 'archived';

/**
 * Per-platform listen URLs, keyed by platform id (see lib/platforms.ts).
 * Stored as JSONB on both `show` and `tracks`; an episode's entry overrides
 * the show-level default.
 */
export type PlatformLinksJson = Record<string, string>;

/** podcast.profiles */
export interface Profile {
  id: string; // = auth.users.id
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** The signed-in user, assembled from auth.users + their profile row. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  profile?: Profile;
}

/** podcast.tracks — one episode. */
export interface Track {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  duration_seconds: number;
  audio_url: string;
  audio_path: string;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  instructor_name: string | null;
  status: TrackStatus;
  play_count: number;
  favorite_count: number;
  comment_count: number;
  platform_links: PlatformLinksJson;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** podcast.playlists — the only grouping; categories were dropped in 028. */
export interface Playlist {
  id: string;
  user_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  is_public: boolean;
  track_count: number;
  total_duration_seconds: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
