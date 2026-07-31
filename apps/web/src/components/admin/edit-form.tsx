'use client';

import { adminCreatePlaylist, adminUpdatePodcast } from '@/app/actions';
import { CoverArtField } from '@/components/admin/cover-art-field';
import { PlatformLinkFields } from '@/components/admin/platform-link-fields';
import { SeoFields, type SeoOverrides } from '@/components/admin/seo-fields';
import {
  ChipPicker,
  Field,
  FileInput,
  INPUT,
  type PlaylistOption,
  accessToken,
  readBlurDataUrl,
  readDuration,
  uploadAudio,
  uploadCover,
} from '@/components/admin/upload-form';
import { type PlatformLinks, parsePlatformLinks } from '@/lib/platforms';
import { formatDuration } from '@/lib/podcast';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { Info, ListMusic, Loader2, Music, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface EditableTrack {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  instructor_name: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  audio_path: string | null;
  status: string;
  platform_links?: unknown;
  meta_description?: string | null;
  keywords?: string[] | null;
}

export function EditForm({
  track,
  currentPlaylistId,
  playlists: initialPlaylists,
}: {
  track: EditableTrack;
  currentPlaylistId: string;
  playlists: PlaylistOption[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState(track.title);
  const [channel, setChannel] = useState(track.instructor_name ?? '');
  const [description, setDescription] = useState(track.description ?? '');
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [playlistId, setPlaylistId] = useState(currentPlaylistId);
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);
  // Prefilled from what is already stored, so the panel shows the live values
  // rather than re-deriving them and implying an edit that never happened.
  const [seo, setSeo] = useState<SeoOverrides>({
    metaDescription: track.meta_description ?? '',
    keywords: (track.keywords ?? []).join(', '),
  });
  const [platformLinks, setPlatformLinks] = useState<PlatformLinks>(() =>
    parsePlatformLinks(track.platform_links),
  );

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
      // Only touch storage when a replacement file was picked. Audio and cover
      // go up together rather than one after the other.
      const [durationSeconds, audioPath, coverResult, blurDataUrl] = await Promise.all([
        audio ? readDuration(audio) : Promise.resolve(null),
        audio
          ? uploadAudio(audio, {
              supabaseAccessToken: () => accessToken(supabase),
              onStatus: setProgress,
              onProgress: setPct,
            })
          : Promise.resolve(null),
        uploadCover(supabase, cover),
        cover ? readBlurDataUrl(cover) : Promise.resolve(null),
      ]);

      setProgress('Saving…');
      const res = await adminUpdatePodcast({
        id: track.id,
        title,
        channel,
        description,
        playlistId: playlistId || null,
        audioPath,
        durationSeconds,
        coverUrl: coverResult.url,
        coverPath: coverResult.path,
        fileSizeBytes: audio?.size ?? null,
        blurDataUrl,
        metaDescription: seo.metaDescription.trim() || undefined,
        keywords: seo.keywords
          ? seo.keywords
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
          : undefined,
        platformLinks,
      });
      if ('error' in res && res.error) throw new Error(res.error);
      if ('warning' in res && res.warning) toast.warning(res.warning);

      toast.success('Changes saved');
      router.push('/admin/playlists');
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
            Current audio:{' '}
            <span className="text-foreground font-medium">
              {track.audio_path ? formatDuration(track.duration_seconds) : 'none'}
            </span>{' '}
            — leave the field below empty to keep it.
          </p>
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

      <Field label="Cover">
        <CoverArtField file={cover} onChange={setCover} existingUrl={track.thumbnail_url} />
      </Field>

      <SeoFields
        title={title}
        playlistTitle={playlists.find((p) => p.id === playlistId)?.title ?? null}
        description={description}
        durationSeconds={track.duration_seconds}
        overrides={seo}
        onChange={setSeo}
      />

      <div className="pt-2">
        <h2 className="text-sm font-bold text-foreground mb-1">Platform links for this episode</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Optional. Leave a field empty and this episode uses the show-wide link from{' '}
          <span className="text-foreground font-medium">Podcast settings</span>. Fill one in to send
          listeners to this specific episode on that platform instead.
        </p>
        <PlatformLinkFields value={platformLinks} onChange={setPlatformLinks} />
      </div>

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
          onClick={() => router.push('/admin/playlists')}
          disabled={busy}
          className="press px-6 py-3 glass-card rounded-full font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
