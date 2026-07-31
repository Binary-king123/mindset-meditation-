'use client';

import { adminCreatePlaylist, adminDeletePlaylist, adminUpdatePlaylist } from '@/app/actions';
import { CoverArtField } from '@/components/admin/cover-art-field';
import { Field, INPUT, uploadCover } from '@/components/admin/upload-form';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
// Create or edit a playlist — the only way episodes are grouped for listeners.
// Reuses the field and upload helpers from upload-form.tsx rather than growing
// a second set of them.
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

export interface EditablePlaylist {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  track_count: number;
}

export function PlaylistForm({ playlist }: { playlist?: EditablePlaylist }) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState(playlist?.title ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [isPublic, setIsPublic] = useState(playlist?.is_public ?? true);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Playlist name is required');
      return;
    }

    setBusy(true);
    try {
      // Covers go in the public thumbnails bucket, same as episode artwork.
      const uploaded = await uploadCover(supabase, cover, 'playlists');
      const payload = {
        title,
        description,
        coverUrl: uploaded.url,
        coverPath: uploaded.path,
        isPublic,
      };

      const res = playlist
        ? await adminUpdatePlaylist({ ...payload, id: playlist.id })
        : await adminCreatePlaylist(payload);
      if ('error' in res && res.error) throw new Error(res.error);

      toast.success(playlist ? 'Playlist saved' : 'Playlist created');
      router.push('/admin/playlists');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!playlist) return;
    setBusy(true);
    // Episodes survive — only the grouping goes.
    const res = await adminDeletePlaylist(playlist.id);
    if ('error' in res && res.error) {
      toast.error(res.error);
      setBusy(false);
      setConfirmingDelete(false);
      return;
    }
    toast.success('Playlist deleted');
    router.push('/admin/playlists');
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={save}>
      <Field label="Playlist name *" hint="Shown on the homepage and as the page title.">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={INPUT}
          placeholder="e.g. Sleep Stories, Season 1"
        />
      </Field>

      <Field label="Description" hint="A sentence or two about what this series covers.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={INPUT}
          placeholder="Who is this series for, and what will they get from it?"
        />
      </Field>

      <Field
        label="Cover art"
        hint="Square works best — 1400×1400 or larger. The newest playlist's cover is also used as the homepage artwork."
      >
        <CoverArtField file={cover} onChange={setCover} existingUrl={playlist?.thumbnail_url} />
      </Field>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-[hsl(var(--primary))]"
        />
        <span className="text-sm">
          <span className="font-semibold text-foreground">Visible to listeners</span>
          <span className="block text-xs text-muted-foreground">
            Uncheck to hide this playlist from the site while you build it up.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="shine press px-6 py-3 bg-primary text-white rounded-full font-bold glow-primary disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {playlist ? 'Save changes' : 'Create playlist'}
        </button>

        {playlist && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="press px-5 py-3 rounded-full font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>

      {playlist && (
        <ConfirmDialog
          open={confirmingDelete}
          title={`Delete "${playlist.title}"?`}
          description={`Its ${playlist.track_count} episode${playlist.track_count === 1 ? '' : 's'} stay published — only the playlist grouping is removed.`}
          confirmLabel="Delete playlist"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </form>
  );
}
