'use server';

// Server Actions — run as the signed-in user; RLS enforces authorization.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/podcast';
import { PLATFORMS, sanitizePlatformUrl, type PlatformLinks } from '@/lib/platforms';

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
      author:
        profile?.full_name || profile?.username || profile?.email?.split('@')[0] || 'You',
      mine: true,
      isAdmin: role === 'admin' || role === 'super_admin',
    },
  };
}

export async function deleteComment(id: string) {
  const supabase = await createClient();
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
    ? `${message}\n\nThe database looks a migration behind the app. Run \`pnpm db:status\` and apply what is pending — see migrations/README.md.`
    : message;
}

/** Playlists are how listeners browse, so every change touches these three. */
function revalidatePlaylist(slug?: string | null) {
  revalidatePath('/');
  revalidatePath('/playlists');
  if (slug) revalidatePath(`/playlist/${slug}`);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

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

  const { data, error } = await supabase
    .from('playlists')
    .insert({
      user_id: user.id,
      title,
      description: input.description?.trim() || null,
      thumbnail_url: input.coverUrl || null,
      thumbnail_path: input.coverPath || null,
      slug: slugify(title),
      is_public: input.isPublic ?? true,
    })
    .select('id, title, slug')
    .single();

  if (error) return { error: schemaHint(error.message) };
  revalidatePlaylist(data.slug);
  return { playlist: data };
}

export async function adminUpdatePlaylist(input: PlaylistInput & { id: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('playlists')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) return { error: error.message };
  revalidatePlaylist(data?.slug);
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
  /** Per-episode overrides of the show-wide platform links. */
  platformLinks?: PlatformLinks;
  publish: boolean;
}

export async function adminCreatePodcast(input: CreatePodcastInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const title = input.title.trim();
  if (!title) return { error: 'Title is required' };
  if (!input.audioPath) return { error: 'Audio file is required' };

  const { data, error } = await supabase
    .from('tracks')
    .insert({
      title,
      slug: slugify(title),
      description: input.description?.trim() || null,
      short_description: input.description?.trim().slice(0, 300) || null,
      duration_seconds: Math.max(1, Math.round(input.durationSeconds || 1)),
      audio_url: input.audioPath,
      audio_path: input.audioPath,
      thumbnail_url: input.coverUrl || null,
      thumbnail_path: input.coverPath || null,
      instructor_name: input.channel?.trim() || null,
      platform_links: cleanPlatformLinks(input.platformLinks),
      status: input.publish ? 'published' : 'draft',
    })
    .select('id, slug')
    .single();

  if (error) return { error: schemaHint(error.message) };

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
      return { podcast: data, warning: `Saved, but could not add to playlist: ${linkError.message}` };
    }
    revalidatePath('/playlists');
  }

  revalidatePath('/');
  revalidatePath('/admin/podcasts');
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
  /** Per-episode overrides of the show-wide platform links. */
  platformLinks?: PlatformLinks;
}

/** Edits an existing episode. RLS restricts track updates to admins/moderators. */
export async function adminUpdatePodcast(input: UpdatePodcastInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const title = input.title.trim();
  if (!title) return { error: 'Title is required' };

  // biome-ignore lint/suspicious/noExplicitAny: partial update over an untyped row
  const patch: Record<string, any> = {
    title,
    description: input.description?.trim() || null,
    short_description: input.description?.trim().slice(0, 300) || null,
    instructor_name: input.channel?.trim() || null,
  };

  // Only overwrite media when a replacement was actually uploaded.
  if (input.audioPath) {
    patch.audio_path = input.audioPath;
    patch.audio_url = input.audioPath;
    if (input.durationSeconds && input.durationSeconds > 0) {
      patch.duration_seconds = Math.round(input.durationSeconds);
    }
  }
  if (input.coverUrl) {
    patch.thumbnail_url = input.coverUrl;
    patch.thumbnail_path = input.coverPath ?? null;
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
          return { podcast: data, warning: `Saved, but playlist move failed: ${linkError.message}` };
        }
      }
    }
  }

  revalidatePath('/');
  revalidatePath('/playlists');
  revalidatePath('/admin/podcasts');
  revalidatePath(`/podcast/${data.slug}`);
  return { podcast: data };
}

/**
 * Updates the platform links for the whole podcast — the list behind
 * /admin/links. Per-episode overrides live on tracks.platform_links.
 *
 * RLS (show_manage_admin) is what authorizes this; a non-admin's update matches
 * no row and changes nothing.
 */
export async function adminUpdatePlatformLinks(input: { platformLinks?: PlatformLinks }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const cleaned = cleanPlatformLinks(input.platformLinks);

  // .select() so we can tell whether a row was actually written. Without it an
  // RLS-blocked update returns no error and updates nothing, which is exactly
  // how a save can look successful yet change nothing.
  const { data, error } = await supabase
    .from('show')
    .update({ platform_links: cleaned })
    .eq('id', true)
    .select('platform_links');
  if (error) return { error: schemaHint(error.message) };
  if (!data || data.length === 0) {
    // The singleton row exists on a seeded database, so no match means the
    // caller was not allowed to write it.
    return { error: 'Could not save — this account is not allowed to edit the show links.' };
  }

  // The homepage is cached (revalidate = 300), so it needs an explicit nudge
  // for a links change to show up straight away.
  revalidatePath('/', 'layout');
  return { ok: true, platformLinks: data[0].platform_links as PlatformLinks };
}

export async function adminSetStatus(id: string, status: 'draft' | 'published' | 'archived') {
  const supabase = await createClient();
  const { error } = await supabase.from('tracks').update({ status }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/podcasts');
  return { ok: true };
}

export async function adminDeletePodcast(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('tracks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/podcasts');
  return { ok: true };
}
