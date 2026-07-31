'use server';

import { PLATFORMS, type PlatformLinks, sanitizePlatformUrl } from '@/lib/platforms';
import { slugify, uniqueSlug } from '@/lib/podcast';
import { generateEpisodeMetadata } from '@/lib/seo/generate';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PodcastClient } from '@/lib/supabase/types';
// Server Actions — run as the signed-in user; RLS enforces authorization.
import { revalidatePath } from 'next/cache';
import { checkAdmin } from '@/lib/admin-guard';

/**
 * Keeps only known platform ids holding valid http(s) URLs. Without the
 * protocol check an admin could store a `javascript:` URL that then runs for
 * every visitor who clicks that platform button.
 */
function cleanPlatformLinks(input: PlatformLinks | undefined): PlatformLinks {
  const out: PlatformLinks = {};
  if (!input) return out;
  for (const { id } of PLATFORMS) {
    const url = input[id] ? sanitizePlatformUrl(input[id] as string) : null;
    if (url) out[id] = url;
  }
  return out;
}

/**
 * Inserts a row under a slug derived from its title, resolving collisions.
 *
 * Both `tracks.slug` and `playlists.slug` carry a unique constraint, and
 * `slugify` is deterministic — so two titles that reduce to the same stem
 * ("Sleep & Calm" and "Sleep Calm") would otherwise fail with a raw Postgres
 * error. Shared by episodes and playlists because the requirement is identical.
 *
 * Two steps, because neither alone is sufficient: a prefix query picks the next
 * free suffix (`-2`, `-3`) so the common case is one round trip, and the retry
 * on the unique-violation closes the race where two concurrent inserts resolve
 * to the same candidate between the query and the write.
 *
 * The existence check runs on the service-role client, not the caller's. Both
 * `tracks_slug_key` and `playlists_slug_lower_key` are plain unique indexes —
 * neither excludes soft-deleted rows, so a deleted row still occupies its
 * slug. `playlists_select`'s RLS hides soft-deleted rows from every caller,
 * admin included (deliberately — see migration 031), so a normal, RLS-checked
 * SELECT here is blind to exactly the rows that can still collide. That blind
 * spot meant every retry re-ran the same query, got the same incomplete
 * answer, and proposed the same doomed bare slug three times in a row — an
 * admin recreating a playlist under a previously-deleted title always hit
 * "Could not find a free URL for that title" instead of just getting `-2`.
 * Every call site already passed `requireAdmin()` before reaching here.
 */
async function insertWithUniqueSlug<T extends { id: string; slug: string }>(
  supabase: PodcastClient,
  table: 'tracks' | 'playlists',
  title: string,
  row: Record<string, unknown>,
  select = 'id, slug',
): Promise<{ data: T | null; error: string | null }> {
  const base = slugify(title);
  const admin = createAdminClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await admin.from(table).select('slug').like('slug', `${base}%`);

    const slug = uniqueSlug(
      title,
      ((existing ?? []) as Array<{ slug: string }>).map((r) => r.slug),
    );

    const { data, error } = await supabase
      .from(table)
      .insert({ ...row, slug })
      .select(select)
      .single();

    if (!error) return { data: data as unknown as T, error: null };
    // 23505 = unique_violation. Anything else is a real failure — report it.
    if (!error.message.includes('duplicate key') && error.code !== '23505') {
      return { data: null, error: error.message };
    }
  }
  return { data: null, error: 'Could not find a free URL for that title — try a different one' };
}

/**
 * Whether the signed-in listener has saved this episode.
 *
 * The player and the homepage card both used to initialise their heart to
 * "not saved" and never check — so opening an episode you had already saved
 * showed an empty heart, and the first press *removed* it from your library.
 * Returns false for signed-out visitors, who have no library.
 */
export async function isSaved(trackId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('track_id', trackId)
    .maybeSingle();
  return Boolean(data);
}

export async function toggleSave(trackId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('track_id', trackId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('favorites').delete().eq('id', existing.id);
    return { saved: false };
  }
  const { error } = await supabase
    .from('favorites')
    .insert({ track_id: trackId, user_id: user.id });
  if (error) return { error: error.message };
  return { saved: true };
}

export async function addComment(trackId: string, body: string, parentId?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const text = body.trim();
  if (!text) return { error: 'Comment is empty' };
  if (text.length > 2000) return { error: 'Comment is too long' };

  const { data, error } = await supabase
    .from('comments')
    .insert({ track_id: trackId, user_id: user.id, body: text, parent_id: parentId ?? null })
    .select('id, body, created_at, user_id, parent_id')
    .single();
  if (error) return { error: error.message };

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, email')
    .eq('id', user.id)
    .maybeSingle();

  // Whether the author is staff decides the "Host" badge on the thread.
  const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });

  return {
    comment: {
      ...data,
      author: profile?.full_name || profile?.username || profile?.email?.split('@')[0] || 'You',
      mine: true,
      isAdmin: role === 'admin' || role === 'super_admin',
    },
  };
}

export async function deleteComment(id: string) {
  const supabase = await createClient();
  // RLS (comments_delete_own) already restricts this to the author or an
  // admin — a mismatched id just deletes zero rows, no error. This explicit
  // check exists so a caller gets an honest "not authorized" instead of a
  // silent no-op, and so the guarantee doesn't rest on RLS alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be signed in.' };

  const { data: comment } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();
  if (!comment) return { error: 'Comment not found' };

  if (comment.user_id !== user.id) {
    const gate = await checkAdmin();
    if (!gate.ok) return { error: 'Not authorized to delete this comment' };
  }

  const { error } = await supabase.from('comments').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

// ---- Admin ----

/**
 * PostgREST reports a column the code expects but the database lacks as
 * "Could not find the 'x' column … in the schema cache", which reads like a
 * caching glitch. It almost always means the database is a migration behind
 * the app, so say that instead of leaving the admin to guess.
 */
function schemaHint(message: string): string {
  const behind = /schema cache|could not find the|does not exist/i.test(message);
  return behind
    ? `${message}\n\nThe database looks a migration behind the app. Check its version with \`SELECT version FROM podcast.schema_migrations ORDER BY version DESC LIMIT 1\` and apply the pending file — see migrations/README.md.`
    : message;
}

/**
 * The two files nothing on the site links to, but which every crawler polls:
 * /sitemap.xml (Google) and /feed.xml (Apple/Spotify and podcast directories).
 *
 * Both are ISR'd with `revalidate = 3600`. Without an explicit purge a freshly
 * published episode is live on the site immediately but stays missing from the
 * sitemap and the feed for up to an hour — so the crawler that happens to visit
 * in that window sees nothing new. Every mutation that changes what is public
 * calls this, which is what makes "publish → Google discovers the URL" actually
 * hold rather than hold-eventually.
 */
function revalidateDiscovery() {
  revalidatePath('/sitemap.xml');
  revalidatePath('/feed.xml');
}

/** Playlists are how listeners browse, so every change touches these three. */
function revalidatePlaylist(slug?: string | null) {
  revalidatePath('/');
  revalidatePath('/playlists');
  if (slug) revalidatePath(`/playlist/${slug}`);
  // Playlists are sitemap entries in their own right.
  revalidateDiscovery();
}

/**
 * Every `admin*` action below starts with this.
 *
 * A Server Action is addressable by its generated ID, not by which page happens
 * to import it — so "this action is only referenced from /admin" is not an
 * access control. Row-level security covers the `tracks` writes (see
 * `tracks_insert_admin` / `tracks_update_admin` / `tracks_delete_admin` in
 * fullschema.sql), but it does NOT cover playlists: `playlists_insert_own` only
 * requires `user_id = auth.uid()`, so before this guard any signed-in listener
 * could invoke `adminCreatePlaylist` and publish a public playlist onto the
 * homepage, /playlists and the sitemap.
 *
 * Returns an error string to hand straight back to the caller, or the caller's
 * id when they are a verified admin. `checkAdmin` is React-cached, so an action
 * that needs the id gets it from here rather than paying for a second
 * `auth.getUser()` round-trip.
 */
type AdminGate = { error: string; userId?: never } | { error?: never; userId: string };

async function requireAdmin(): Promise<AdminGate> {
  const admin = await checkAdmin();
  if (admin.ok && admin.userId) return { userId: admin.userId };
  return { error: admin.reason === 'unauthenticated' ? 'Please sign in' : 'Not authorised' };
}

export interface PlaylistInput {
  title: string;
  description?: string;
  /** Only set when a new cover was uploaded. */
  coverUrl?: string | null;
  coverPath?: string | null;
  isPublic?: boolean;
}

export async function adminCreatePlaylist(input: PlaylistInput) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: 'Playlist name is required' };
  if (title.length > 200) return { error: 'Playlist name is too long' };

  const { data: existing } = await supabase
    .from('playlists')
    .select('id')
    .eq('title', title)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return { error: 'A playlist with that name already exists' };

  const { data, error } = await insertWithUniqueSlug<{ id: string; title: string; slug: string }>(
    supabase,
    'playlists',
    title,
    {
      user_id: gate.userId,
      title,
      description: input.description?.trim() || null,
      thumbnail_url: input.coverUrl || null,
      thumbnail_path: input.coverPath || null,
      is_public: input.isPublic ?? true,
    },
    'id, title, slug',
  );

  if (error) return { error: schemaHint(error) };
  if (!data) return { error: 'Could not save the playlist' };
  revalidatePlaylist(data.slug);
  return { playlist: data };
}

export async function adminUpdatePlaylist(input: PlaylistInput & { id: string }) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: 'Playlist name is required' };
  if (title.length > 200) return { error: 'Playlist name is too long' };

  // biome-ignore lint/suspicious/noExplicitAny: partial update over an untyped row
  const patch: Record<string, any> = {
    title,
    description: input.description?.trim() || null,
  };
  if (input.isPublic !== undefined) patch.is_public = input.isPublic;
  // Only replace the artwork when a new file was actually uploaded — otherwise
  // saving the title would silently wipe the existing cover.
  if (input.coverUrl) {
    patch.thumbnail_url = input.coverUrl;
    patch.thumbnail_path = input.coverPath ?? null;
  }

  const { data, error } = await supabase
    .from('playlists')
    .update(patch)
    .eq('id', input.id)
    .select('id, title, slug')
    .single();

  if (error) return { error: schemaHint(error.message) };
  revalidatePlaylist(data.slug);
  return { playlist: data };
}

/** Soft delete, matching adminDeletePodcast — the episodes inside are kept. */
export async function adminDeletePlaylist(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  // Read the slug BEFORE the delete. Reading it back afterwards cannot work:
  // `playlists_select` requires `deleted_at IS NULL`, so the freshly deleted row
  // fails the select and the returned slug was always null — which meant
  // `/playlist/<slug>` never got purged and kept serving a deleted playlist
  // until its own revalidate window elapsed.
  const { data: existing } = await supabase
    .from('playlists')
    .select('slug')
    .eq('id', id)
    .maybeSingle();

  // An RPC, not a direct `.update()`. The obvious `UPDATE ... SET deleted_at`
  // was verified — policy text, and auth.uid()/is_admin() in the very same
  // transaction as the failing statement — to be correct and still rejected by
  // RLS on this table for reasons that don't trace back to anything in the
  // policy. podcast.delete_playlist() performs the identical owner-or-admin
  // check itself and updates as its own (RLS-exempt) owner. See migration 033.
  const { error } = await supabase.rpc('delete_playlist', { p_id: id });

  if (error) return { error: schemaHint(error.message) };
  revalidatePlaylist((existing as { slug: string | null } | null)?.slug);
  return { ok: true };
}

interface CreatePodcastInput {
  title: string;
  channel?: string;
  description?: string;
  playlistId?: string | null;
  durationSeconds: number;
  audioPath: string;
  coverUrl?: string | null;
  coverPath?: string | null;
  /** Read from the File in the browser — there is no server-side ffmpeg. */
  fileSizeBytes?: number | null;
  /** Base64 LQIP produced by downscaling the cover on a canvas. */
  blurDataUrl?: string | null;
  /**
   * Optional admin overrides of the generated SEO copy. Blank/absent means
   * "use the generated value" — the upload form previews the generated text as
   * a placeholder and only sends these once someone types over it.
   */
  metaDescription?: string;
  keywords?: string[];
  /** Per-episode overrides of the show-wide platform links. */
  platformLinks?: PlatformLinks;
  publish: boolean;
}

export async function adminCreatePodcast(input: CreatePodcastInput) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: 'Title is required' };
  if (!input.audioPath) return { error: 'Audio file is required' };
  // A 0 here would be clamped to 1 second and silently ship a broken episode;
  // the form blocks submission, and this is the server-side backstop.
  if (!input.durationSeconds || input.durationSeconds < 1) {
    return { error: 'Could not read the audio duration — re-select the file and try again' };
  }

  // The playlist title feeds the generated copy, so fetch it before generating.
  let playlistTitle: string | null = null;
  if (input.playlistId) {
    const { data: pl } = await supabase
      .from('playlists')
      .select('title')
      .eq('id', input.playlistId)
      .maybeSingle();
    playlistTitle = pl?.title ?? null;
  }

  const durationSeconds = Math.round(input.durationSeconds);
  const description = input.description?.trim() || null;
  const generated = generateEpisodeMetadata({
    title,
    playlistTitle,
    durationSeconds,
    description,
  });

  const row = {
    title,
    description,
    // short_description keeps its historical meaning (the card blurb) but is
    // now a sentence-boundary excerpt rather than a mid-word .slice(0, 300).
    short_description: generated.excerpt.slice(0, 300),
    excerpt: generated.excerpt,
    meta_description: input.metaDescription?.trim() || generated.metaDescription,
    keywords: input.keywords?.length ? input.keywords : generated.keywords,
    duration_seconds: durationSeconds,
    audio_url: input.audioPath,
    audio_path: input.audioPath,
    thumbnail_url: input.coverUrl || null,
    thumbnail_path: input.coverPath || null,
    blur_data_url: input.blurDataUrl || null,
    file_size_bytes: input.fileSizeBytes ?? null,
    bitrate_kbps: input.fileSizeBytes
      ? Math.round((input.fileSizeBytes * 8) / durationSeconds / 1000)
      : null,
    instructor_name: input.channel?.trim() || null,
    platform_links: cleanPlatformLinks(input.platformLinks),
    status: input.publish ? 'published' : 'draft',
    published_at: input.publish ? new Date().toISOString() : null,
  };

  const { data, error } = await insertWithUniqueSlug(supabase, 'tracks', title, row);
  if (error) return { error: schemaHint(error) };
  if (!data) return { error: 'Could not save the episode' };

  // Attach to a playlist, appending to the end. The trg_playlist_stats trigger
  // keeps track_count / total_duration_seconds in sync.
  if (input.playlistId) {
    const { count } = await supabase
      .from('playlist_tracks')
      .select('id', { count: 'exact', head: true })
      .eq('playlist_id', input.playlistId);

    const { error: linkError } = await supabase.from('playlist_tracks').insert({
      playlist_id: input.playlistId,
      track_id: data.id,
      position: count ?? 0,
    });
    // The episode itself saved fine — report the link failure without losing it.
    if (linkError) {
      revalidatePath('/');
      revalidateDiscovery();
      return {
        podcast: data,
        warning: `Saved, but could not add to playlist: ${linkError.message}`,
      };
    }
    revalidatePath('/playlists');
  }

  revalidatePath('/');
  revalidatePath('/admin/playlists');
  revalidateDiscovery();
  return { podcast: data };
}

interface UpdatePodcastInput {
  id: string;
  title: string;
  channel?: string;
  description?: string;
  playlistId?: string | null;
  /** Only set when the admin replaced the audio file. */
  audioPath?: string | null;
  durationSeconds?: number | null;
  /** Only set when the admin replaced the cover. */
  coverUrl?: string | null;
  coverPath?: string | null;
  fileSizeBytes?: number | null;
  blurDataUrl?: string | null;
  /** Blank means "regenerate" — see CreatePodcastInput. */
  metaDescription?: string;
  keywords?: string[];
  /** Per-episode overrides of the show-wide platform links. */
  platformLinks?: PlatformLinks;
}

/** Edits an existing episode. RLS restricts track updates to admins/moderators. */
export async function adminUpdatePodcast(input: UpdatePodcastInput) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: 'Title is required' };

  // The generated copy is derived from title + playlist + duration, so it has
  // to be recomputed on edit or an episode keeps the description of its old
  // title. The slug is deliberately NOT regenerated — see below.
  const { data: current } = await supabase
    .from('tracks')
    .select('duration_seconds, published_at, status')
    .eq('id', input.id)
    .maybeSingle();

  const existingTrack = (current ?? null) as {
    duration_seconds: number;
    published_at: string | null;
    status: string;
  } | null;

  let playlistTitle: string | null = null;
  if (input.playlistId) {
    const { data: pl } = await supabase
      .from('playlists')
      .select('title')
      .eq('id', input.playlistId)
      .maybeSingle();
    playlistTitle = pl?.title ?? null;
  }

  const durationSeconds =
    input.durationSeconds && input.durationSeconds > 0
      ? Math.round(input.durationSeconds)
      : (existingTrack?.duration_seconds ?? 1);

  const description = input.description?.trim() || null;
  const generated = generateEpisodeMetadata({
    title,
    playlistTitle,
    durationSeconds,
    description,
  });

  // biome-ignore lint/suspicious/noExplicitAny: partial update over an untyped row
  const patch: Record<string, any> = {
    title,
    description,
    short_description: generated.excerpt.slice(0, 300),
    excerpt: generated.excerpt,
    meta_description: input.metaDescription?.trim() || generated.metaDescription,
    keywords: input.keywords?.length ? input.keywords : generated.keywords,
    instructor_name: input.channel?.trim() || null,
  };

  // NB: `slug` is intentionally absent. Renaming an episode must not change its
  // URL — inbound links, the sitemap Google already crawled, and any podcast
  // client that stored the page URL would all break.

  // Only overwrite media when a replacement was actually uploaded.
  if (input.audioPath) {
    patch.audio_path = input.audioPath;
    patch.audio_url = input.audioPath;
    if (input.durationSeconds && input.durationSeconds > 0) {
      patch.duration_seconds = Math.round(input.durationSeconds);
      if (input.fileSizeBytes) {
        patch.file_size_bytes = input.fileSizeBytes;
        patch.bitrate_kbps = Math.round(
          (input.fileSizeBytes * 8) / Math.round(input.durationSeconds) / 1000,
        );
      }
    }
  }
  if (input.coverUrl) {
    patch.thumbnail_url = input.coverUrl;
    patch.thumbnail_path = input.coverPath ?? null;
    patch.blur_data_url = input.blurDataUrl ?? null;
  }
  if (input.platformLinks) {
    patch.platform_links = cleanPlatformLinks(input.platformLinks);
  }

  const { data, error } = await supabase
    .from('tracks')
    .update(patch)
    .eq('id', input.id)
    .select('id, slug')
    .single();
  if (error) return { error: schemaHint(error.message) };

  // Move between playlists: drop the old membership, append to the new one.
  if (input.playlistId !== undefined) {
    const { data: current } = await supabase
      .from('playlist_tracks')
      .select('id, playlist_id')
      .eq('track_id', input.id);

    const existing = (current ?? []) as Array<{ id: string; playlist_id: string }>;
    const alreadyThere = existing.some((r) => r.playlist_id === input.playlistId);

    if (!alreadyThere) {
      for (const row of existing) {
        await supabase.from('playlist_tracks').delete().eq('id', row.id);
      }
      if (input.playlistId) {
        const { count } = await supabase
          .from('playlist_tracks')
          .select('id', { count: 'exact', head: true })
          .eq('playlist_id', input.playlistId);
        const { error: linkError } = await supabase.from('playlist_tracks').insert({
          playlist_id: input.playlistId,
          track_id: input.id,
          position: count ?? 0,
        });
        if (linkError) {
          return {
            podcast: data,
            warning: `Saved, but playlist move failed: ${linkError.message}`,
          };
        }
      }
    }
  }

  revalidatePath('/');
  revalidatePath('/playlists');
  revalidatePath('/admin/playlists');
  revalidatePath(`/podcast/${data.slug}`);
  revalidateDiscovery();
  return { podcast: data };
}

export async function adminSetStatus(id: string, status: 'draft' | 'published' | 'archived') {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();

  // published_at is stamped once, the first time an episode goes public, and
  // never moved after that — un-publishing and re-publishing must not restate
  // the episode as brand new in the RSS feed.
  // biome-ignore lint/suspicious/noExplicitAny: partial update over an untyped row
  const patch: Record<string, any> = { status };
  if (status === 'published') {
    const { data } = await supabase
      .from('tracks')
      .select('published_at')
      .eq('id', id)
      .maybeSingle();
    if (!(data as { published_at: string | null } | null)?.published_at) {
      patch.published_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from('tracks').update(patch).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/playlists');
  revalidateDiscovery();
  return { ok: true };
}

export async function adminDeletePodcast(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from('tracks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/playlists');
  revalidateDiscovery();
  return { ok: true };
}
