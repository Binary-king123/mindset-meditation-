import { ManageList, type ManageRow } from '@/components/admin/manage-list';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPodcastsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tracks')
    .select(
      'id, title, status, duration_seconds, play_count, created_at, playlist_tracks(playlist:playlists(title))',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Flatten the playlist_tracks join down to plain names for the list.
  const rows: ManageRow[] = ((data ?? []) as Array<Record<string, any>>).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    duration_seconds: t.duration_seconds,
    play_count: t.play_count,
    created_at: t.created_at,
    playlists: ((t.playlist_tracks ?? []) as Array<{ playlist?: { title?: string } | null }>)
      .map((pt) => pt.playlist?.title)
      .filter((name): name is string => !!name),
  }));

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-6">Manage podcasts</h1>
      <ManageList rows={rows} />
    </div>
  );
}
