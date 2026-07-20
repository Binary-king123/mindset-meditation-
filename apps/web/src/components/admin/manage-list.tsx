'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Trash2, Eye, EyeOff, ListMusic, Pencil } from 'lucide-react';
import { adminSetStatus, adminDeletePodcast } from '@/app/actions';
import { formatDuration } from '@/lib/podcast';

export interface ManageRow {
  id: string;
  title: string;
  status: string;
  duration_seconds: number;
  play_count: number;
  created_at: string;
  /** Playlists this episode belongs to, flattened from playlist_tracks. */
  playlists?: string[];
}

export function ManageList({ rows }: { rows: ManageRow[] }) {
  const [items, setItems] = useState<ManageRow[]>(rows);
  const [pending, startTransition] = useTransition();

  function setStatus(id: string, status: 'published' | 'draft') {
    startTransition(async () => {
      const r = await adminSetStatus(id, status);
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    });
  }

  function del(id: string) {
    if (!window.confirm('Delete this podcast?')) return;
    startTransition(async () => {
      const r = await adminDeletePodcast(id);
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  if (items.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
        No podcasts yet. Upload your first one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{i.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDuration(i.duration_seconds)} · {i.play_count} plays ·{' '}
              <span className={i.status === 'published' ? 'text-primary font-semibold' : ''}>
                {i.status}
              </span>
            </p>
            {i.playlists && i.playlists.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {i.playlists.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/12 text-primary"
                  >
                    <ListMusic className="w-3 h-3" />
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link
            href={`/admin/podcasts/${i.id}`}
            aria-label={`Edit ${i.title}`}
            className="press flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
          {i.status === 'published' ? (
            <button
              type="button"
              onClick={() => setStatus(i.id, 'draft')}
              disabled={pending}
              className="p-2 rounded-lg hover:bg-accent/50"
              title="Unpublish"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus(i.id, 'published')}
              disabled={pending}
              className="p-2 rounded-lg hover:bg-accent/50 text-primary"
              title="Publish"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => del(i.id)}
            disabled={pending}
            className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
