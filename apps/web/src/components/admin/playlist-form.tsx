'use client';

// Create or edit a playlist — the only way episodes are grouped for listeners.
// Reuses the field and upload helpers from upload-form.tsx rather than growing
// a second set of them.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Save, Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminCreatePlaylist, adminUpdatePlaylist, adminDeletePlaylist } from '@/app/actions';
import { INPUT, Field, FileInput, uploadCover } from '@/components/admin/upload-form';

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
    // Episodes survive — only the grouping goes.
    if (!confirm(`Delete "${playlist.title}"? Its ${playlist.track_count} episode(s) are kept.`)) {
      return;
    }
    setBusy(true);
    const res = await adminDeletePlaylist(playlist.id);
    if ('error' in res && res.error) {
      toast.error(res.error);
      setBusy(false);
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
        <div className="flex items-start gap-4">
          {playlist?.thumbnail_url && !cover && (
            <Image
              src={playlist.thumbnail_url}
              alt=""
              width={80}
              height={80}
              className="w-20 h-20 rounded-xl object-cover shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <FileInput
              icon={<ImageIcon className="w-5 h-5" />}
              accept="image/*"
              file={cover}
              onChange={setCover}
              hint={
                playlist?.thumbnail_url
                  ? 'Pick a file only if you want to replace the current cover'
                  : 'JPG / PNG / WebP, up to 5MB'
              }
            />
          </div>
        </div>
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
            onClick={remove}
            disabled={busy}
            className="press px-5 py-3 rounded-full font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
