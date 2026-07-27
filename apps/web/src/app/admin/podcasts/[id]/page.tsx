import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { EditForm } from '@/components/admin/edit-form';
import type { PlaylistOption } from '@/components/admin/upload-form';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EditPodcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: track }, { data: playlists }, { data: membership }] =
    await Promise.all([
      supabase
        .from('tracks')
        .select(
          'id, title, slug, description, instructor_name, duration_seconds, thumbnail_url, audio_path, status, platform_links',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('playlists')
        .select('id, title')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('playlist_tracks').select('playlist_id').eq('track_id', id).maybeSingle(),
    ]);

  if (!track) notFound();

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
      >
        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to manage
      </Link>

      <h1 className="text-2xl font-black text-foreground mb-1">Edit episode</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Change any detail. Audio and cover keep their current files unless you pick a replacement.
      </p>

      <EditForm
        // biome-ignore lint/suspicious/noExplicitAny: untyped podcast schema row
        track={track as any}
        currentPlaylistId={(membership as { playlist_id?: string } | null)?.playlist_id ?? ''}
        playlists={(playlists ?? []) as PlaylistOption[]}
      />
    </div>
  );
}
