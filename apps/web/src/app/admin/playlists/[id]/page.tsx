import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PlaylistForm, type EditablePlaylist } from '@/components/admin/playlist-form';
import { ManageList, type ManageRow } from '@/components/admin/manage-list';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EditPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // "new" is handled by the same route so create and edit share one form.
  const isNew = id === 'new';

  let playlist: EditablePlaylist | undefined;
  let playlistTracks: ManageRow[] = [];

  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('playlists')
      .select('id, title, description, thumbnail_url, is_public, track_count')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) notFound();
    playlist = data as EditablePlaylist;

    const { data: tracksData } = await supabase
      .from('playlist_tracks')
      .select('position, track:tracks(id, title, status, duration_seconds, play_count, created_at)')
      .eq('playlist_id', id)
      .order('position', { ascending: true });

    // The select above pins these columns, so the embedded relation's shape is
    // known — no need to widen it to `any` and lose every check downstream.
    type EmbeddedTrack = {
      id: string;
      title: string;
      status: string;
      duration_seconds: number;
      play_count: number;
      created_at: string;
    };

    playlistTracks = ((tracksData ?? []) as unknown as Array<{ track: EmbeddedTrack | null }>)
      .map((r) => r.track)
      .filter((t): t is EmbeddedTrack => Boolean(t));
  }

  return (
    <div>
      <Link
        href="/admin/playlists"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
      >
        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to playlists
      </Link>

      <h1 className="text-2xl font-black text-foreground mb-1">
        {isNew ? 'New playlist' : 'Edit playlist'}
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        {isNew
          ? 'Create the series first, then upload episodes into it.'
          : 'Cover art and description show on the homepage and the playlist page.'}
      </p>

      <PlaylistForm playlist={playlist} />

      {!isNew && (
        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-foreground mb-1">Episodes in this playlist</h2>
              <p className="text-sm text-muted-foreground">
                Manage the files, edit descriptions, or publish/draft episodes.
              </p>
            </div>
            <Link
              href={`/admin/upload?playlist=${id}`}
              className="press shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-full font-bold glow-primary text-sm"
            >
              Upload episode to this playlist
            </Link>
          </div>
          <ManageList rows={playlistTracks} />
        </div>
      )}
    </div>
  );
}
