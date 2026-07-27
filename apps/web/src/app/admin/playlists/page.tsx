import Link from 'next/link';
import Image from 'next/image';
import { Plus, ListMusic, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPlaylistMeta } from '@/lib/podcast';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  title: string;
  slug: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  track_count: number;
  total_duration_seconds: number;
}

export default async function AdminPlaylistsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('playlists')
    .select('id, title, slug, thumbnail_url, is_public, track_count, total_duration_seconds')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Row[];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-foreground mb-1">Playlists</h1>
          <p className="text-sm text-muted-foreground">
            Every episode belongs to a playlist — this is how listeners browse the show.
          </p>
        </div>
        <Link
          href="/admin/playlists/new"
          className="press shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-full font-bold glow-primary"
        >
          <Plus className="w-4 h-4" />
          New playlist
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <ListMusic className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">No playlists yet</p>
          <p className="text-sm text-muted-foreground">
            Create the first one, then upload episodes into it.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/playlists/${p.id}`}
                className="flex items-center gap-4 p-3 rounded-2xl glass-card hover:border-primary/40 transition-colors"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-muted grid place-items-center">
                  {p.thumbnail_url ? (
                    <Image
                      src={p.thumbnail_url}
                      alt=""
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ListMusic className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatPlaylistMeta(p.track_count, p.total_duration_seconds)}
                  </p>
                </div>
                {!p.is_public && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <EyeOff className="w-3 h-3" />
                    Hidden
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
