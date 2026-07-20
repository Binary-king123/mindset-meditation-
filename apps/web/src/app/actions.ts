'use server';

// Server Actions — run as the signed-in user; RLS enforces authorization.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/podcast';

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

const CATEGORY_PALETTE = ['#8b5cf6', '#06b6d4', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e'];

/** Creates a category. RLS restricts categories to admins (migration 010). */
export async function adminCreateCategory(input: { name: string; icon?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const name = input.name.trim();
  if (!name) return { error: 'Category name is required' };
  if (name.length > 100) return { error: 'Category name is too long' };

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return { error: 'A category with that name already exists' };

  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name,
      slug: slugify(name),
      icon: input.icon?.trim() || '🧘',
      color: CATEGORY_PALETTE[(count ?? 0) % CATEGORY_PALETTE.length],
      sort_order: (count ?? 0) + 1,
    })
    .select('id, name, icon')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/');
  return { category: data };
}

/**
 * Creates a playlist owned by the signed-in admin and visible to everyone.
 * RLS (migration 010) already restricts inserts to `user_id = auth.uid()`.
 */
export async function adminCreatePlaylist(input: { title: string; description?: string }) {
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
      slug: slugify(title),
      is_public: true,
    })
    .select('id, title, slug')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/playlists');
  return { playlist: data };
}

interface CreatePodcastInput {
  title: string;
  channel?: string;
  description?: string;
  categoryId?: string | null;
  playlistId?: string | null;
  durationSeconds: number;
  audioPath: string;
  coverUrl?: string | null;
  coverPath?: string | null;
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
      category_id: input.categoryId || null,
      instructor_name: input.channel?.trim() || null,
      status: input.publish ? 'published' : 'draft',
    })
    .select('id, slug')
    .single();

  if (error) return { error: error.message };

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
  categoryId?: string | null;
  playlistId?: string | null;
  /** Only set when the admin replaced the audio file. */
  audioPath?: string | null;
  durationSeconds?: number | null;
  /** Only set when the admin replaced the cover. */
  coverUrl?: string | null;
  coverPath?: string | null;
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
    category_id: input.categoryId || null,
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

  const { data, error } = await supabase
    .from('tracks')
    .update(patch)
    .eq('id', input.id)
    .select('id, slug')
    .single();
  if (error) return { error: error.message };

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
