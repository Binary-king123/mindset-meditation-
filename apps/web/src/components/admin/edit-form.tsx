'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Loader2, Music, Image as ImageIcon, Save, ListMusic, Tag, Info } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminUpdatePodcast, adminCreatePlaylist, adminCreateCategory } from '@/app/actions';
import { BUCKETS, formatDuration } from '@/lib/podcast';
import {
  INPUT,
  ChipPicker,
  Field,
  FileInput,
  randomPath,
  readDuration,
  uploadWithProgress,
  type CategoryOption,
  type PlaylistOption,
} from '@/components/admin/upload-form';

interface EditableTrack {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  instructor_name: string | null;
  category_id: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  audio_path: string | null;
  status: string;
}

export function EditForm({
  track,
  currentPlaylistId,
  categories: initialCategories,
  playlists: initialPlaylists,
}: {
  track: EditableTrack;
  currentPlaylistId: string;
  categories: CategoryOption[];
  playlists: PlaylistOption[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState(track.title);
  const [channel, setChannel] = useState(track.instructor_name ?? '');
  const [description, setDescription] = useState(track.description ?? '');
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(track.category_id ?? '');
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [playlistId, setPlaylistId] = useState(currentPlaylistId);
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);

  async function createCategory(name: string) {
    const res = await adminCreateCategory({ name });
    if ('error' in res && res.error) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    const created = res.category as CategoryOption;
    setCategories((prev) => [...prev, created]);
    setCategoryId(created.id);
    toast.success(`Category "${created.name}" created`);
  }

  async function createPlaylist(name: string) {
    const res = await adminCreatePlaylist({ title: name });
    if ('error' in res && res.error) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    const created = res.playlist as PlaylistOption;
    setPlaylists((prev) => [created, ...prev]);
    setPlaylistId(created.id);
    toast.success(`Playlist "${created.title}" created`);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setBusy(true);
    setPct(0);
    try {
      let audioPath: string | null = null;
      let durationSeconds: number | null = null;

      // Only touch storage when a replacement file was picked.
      if (audio) {
        setProgress('Reading audio…');
        durationSeconds = await readDuration(audio);

        setProgress('Preparing upload…');
        const presignRes = await fetch('/api/admin/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: audio.name, contentType: audio.type || 'audio/mpeg' }),
        });
        const presign = await presignRes.json();
        if (!presignRes.ok) throw new Error(presign.error || 'Could not start upload');

        const contentType = audio.type || 'audio/mpeg';
        if (presign.backend === 'r2') {
          setProgress('Uploading audio to Cloudflare R2…');
          await uploadWithProgress(presign.url, audio, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            onProgress: setPct,
          });
        } else {
          setProgress('Uploading audio…');
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) throw new Error('Session expired — sign in again');
          await uploadWithProgress(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${presign.bucket}/${presign.key}`,
            audio,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': contentType,
                'x-upsert': 'false',
              },
              onProgress: setPct,
            },
          );
        }
        audioPath = presign.audioPath as string;
      }

      let coverUrl: string | null = null;
      let coverPath: string | null = null;
      if (cover) {
        setProgress('Uploading cover…');
        coverPath = randomPath('covers', cover.name);
        const up = await supabase.storage
          .from(BUCKETS.thumbnails)
          .upload(coverPath, cover, { contentType: cover.type || 'image/jpeg', upsert: false });
        if (up.error) throw new Error(up.error.message);
        coverUrl = supabase.storage.from(BUCKETS.thumbnails).getPublicUrl(coverPath).data.publicUrl;
      }

      setProgress('Saving…');
      const res = await adminUpdatePodcast({
        id: track.id,
        title,
        channel,
        description,
        categoryId: categoryId || null,
        playlistId: playlistId || null,
        audioPath,
        durationSeconds,
        coverUrl,
        coverPath,
      });
      if ('error' in res && res.error) throw new Error(res.error);
      if ('warning' in res && res.warning) toast.warning(res.warning);

      toast.success('Changes saved');
      router.push('/admin/podcasts');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <form className="max-w-2xl space-y-6">
      <Field label="Title *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
      </Field>

      <Field label="Channel / Host">
        <input value={channel} onChange={(e) => setChannel(e.target.value)} className={INPUT} />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={INPUT}
        />
      </Field>

      <ChipPicker
        label="Category"
        items={categories.map((c) => ({ id: c.id, label: c.name, icon: c.icon }))}
        value={categoryId}
        onChange={setCategoryId}
        onCreate={createCategory}
        placeholder="e.g. Evening Wind-Down"
        hint="No categories yet — create the first one."
        icon={<Tag className="w-3.5 h-3.5" />}
        allowNone
      />

      <ChipPicker
        label="Playlist"
        items={playlists.map((p) => ({ id: p.id, label: p.title }))}
        value={playlistId}
        onChange={setPlaylistId}
        onCreate={createPlaylist}
        placeholder="e.g. Sleep Stories, Season 1"
        hint="No playlists yet — create the first one."
        icon={<ListMusic className="w-3.5 h-3.5" />}
      />

      {/* Current media, so it's obvious what is being replaced */}
      <div className="glass-card rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Current audio: <span className="text-foreground font-medium">
              {track.audio_path ? formatDuration(track.duration_seconds) : 'none'}
            </span>{' '}
            — leave the field below empty to keep it.
          </p>
          {track.thumbnail_url && (
            <div className="flex items-center gap-2 pt-1">
              <span>Current cover:</span>
              <Image
                src={track.thumbnail_url}
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 rounded object-cover"
              />
            </div>
          )}
        </div>
      </div>

      <Field label="Replace audio (optional)">
        <FileInput
          icon={<Music className="w-5 h-5" />}
          accept="audio/*"
          file={audio}
          onChange={setAudio}
          hint="Pick a file only if you want to swap the audio"
        />
      </Field>

      <Field label="Replace cover (optional)">
        <FileInput
          icon={<ImageIcon className="w-5 h-5" />}
          accept="image/*"
          file={cover}
          onChange={setCover}
          hint="Pick a file only if you want to swap the cover"
        />
      </Field>

      {progress && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progress}
            {pct > 0 && pct < 100 && <span className="font-semibold text-foreground">{pct}%</span>}
          </p>
          {pct > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="shine press px-6 py-3 bg-primary text-white rounded-full font-bold glow-primary disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save changes
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/podcasts')}
          disabled={busy}
          className="press px-6 py-3 glass-card rounded-full font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
