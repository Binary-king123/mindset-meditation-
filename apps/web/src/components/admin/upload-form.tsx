'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Loader2,
  UploadCloud,
  Music,
  Image as ImageIcon,
  CheckCircle2,
  Plus,
  ListMusic,
  X,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient, type PodcastClient } from '@/lib/supabase/client';
import { adminCreatePodcast, adminCreatePlaylist } from '@/app/actions';
import { BUCKETS } from '@/lib/podcast';
import { cn } from '@/lib/utils';
import { PlatformLinkFields } from '@/components/admin/platform-link-fields';
import type { PlatformLinks } from '@/lib/platforms';

export const INPUT =
  'w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all';

export interface PlaylistOption {
  id: string;
  title: string;
}
export function randomPath(prefix: string, name: string) {
  const ext = name.split('.').pop() || 'bin';
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

/**
 * PUT/POST a blob with real progress. fetch() can't report upload progress.
 *
 * Resolves with the response ETag, which multipart uploads need in order to
 * assemble the finished object. Reading it requires the bucket's CORS policy to
 * list ETag under ExposeHeaders — see SETUP.md.
 *
 * `onProgress` reports bytes rather than a percentage so callers running
 * several parts at once can sum them.
 */
export function uploadWithProgress(
  url: string,
  body: Blob,
  opts: {
    method: 'PUT' | 'POST';
    headers: Record<string, string>;
    onProgress: (loadedBytes: number) => void;
  },
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, url);
    for (const [k, v] of Object.entries(opts.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve({ etag: xhr.getResponseHeader('ETag') })
        : reject(new Error(`Upload failed (${xhr.status}) ${xhr.responseText.slice(0, 140)}`));
    xhr.onerror = () =>
      reject(new Error('Network error during upload — check the storage bucket CORS settings'));
    xhr.send(body);
  });
}

/** How many parts are in flight at once. Past this, they just contend. */
const PART_CONCURRENCY = 5;
const PART_RETRIES = 2;

/**
 * Uploads `file` in parallel chunks against pre-signed part URLs.
 *
 * This is the difference between one TCP stream doing all the work and five
 * saturating the connection — on a typical link a 100 MB episode goes from
 * minutes to well under one. A part that fails is retried on its own rather
 * than restarting the whole upload.
 */
async function uploadParts(
  file: File,
  partUrls: string[],
  partSize: number,
  onProgress: (pct: number) => void,
): Promise<Array<{ partNumber: number; etag: string }>> {
  const loaded = new Array<number>(partUrls.length).fill(0);
  const report = () => {
    const total = loaded.reduce((a, b) => a + b, 0);
    onProgress(Math.min(100, Math.round((total / file.size) * 100)));
  };

  const results: Array<{ partNumber: number; etag: string }> = [];
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= partUrls.length) return;

      const chunk = file.slice(index * partSize, Math.min((index + 1) * partSize, file.size));

      for (let attempt = 0; ; attempt++) {
        try {
          const { etag } = await uploadWithProgress(partUrls[index], chunk, {
            method: 'PUT',
            // Content-Type is fixed by the signature; setting it per part would
            // invalidate it.
            headers: {},
            onProgress: (bytes) => {
              loaded[index] = bytes;
              report();
            },
          });
          if (!etag) {
            throw new Error(
              'The storage bucket did not expose the ETag header — add "ETag" to its CORS ExposeHeaders',
            );
          }
          results.push({ partNumber: index + 1, etag });
          loaded[index] = chunk.size;
          report();
          return;
        } catch (err) {
          if (attempt >= PART_RETRIES) throw err;
          loaded[index] = 0;
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PART_CONCURRENCY, partUrls.length) }, () => worker()),
  );

  return results;
}

/** The signed-in admin's token, for uploads that go straight to Supabase. */
export async function accessToken(supabase: PodcastClient): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired — sign in again');
  return session.access_token;
}

/**
 * Puts a cover image in the public thumbnails bucket. Returns nulls when there
 * is no file, so callers can pass the result straight through to the action.
 */
export async function uploadCover(
  supabase: PodcastClient,
  file: File | null,
  prefix = 'covers',
): Promise<{ url: string | null; path: string | null }> {
  if (!file) return { url: null, path: null };

  const path = randomPath(prefix, file.name);
  const { error } = await supabase.storage
    .from(BUCKETS.thumbnails)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);

  return {
    url: supabase.storage.from(BUCKETS.thumbnails).getPublicUrl(path).data.publicUrl,
    path,
  };
}

/**
 * Uploads the audio file and returns the stored audio_path, choosing between
 * multipart R2, single-PUT R2 and Supabase Storage based on what the server
 * says it wants. Shared by the create and edit forms.
 */
export async function uploadAudio(
  file: File,
  opts: {
    supabaseAccessToken: () => Promise<string>;
    onStatus: (message: string) => void;
    onProgress: (pct: number) => void;
  },
): Promise<string> {
  const contentType = file.type || 'audio/mpeg';

  opts.onStatus('Preparing upload…');
  const presignRes = await fetch('/api/admin/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
  });
  const presign = await presignRes.json();
  if (!presignRes.ok) throw new Error(presign.error || 'Could not start upload');

  if (presign.backend === 'r2' && presign.mode === 'multipart') {
    opts.onStatus('Uploading to Cloudflare R2 (parallel)…');
    try {
      const parts = await uploadParts(file, presign.partUrls, presign.partSize, opts.onProgress);
      opts.onStatus('Finalising upload…');
      const done = await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          key: presign.key,
          uploadId: presign.uploadId,
          parts,
        }),
      });
      const result = await done.json();
      if (!done.ok) throw new Error(result.error || 'Could not finalise the upload');
      return result.audioPath as string;
    } catch (err) {
      // Leaving the upload open would keep R2 billing for the orphaned parts.
      await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort', key: presign.key, uploadId: presign.uploadId }),
      }).catch(() => {});
      throw err;
    }
  }

  const toPct = (bytes: number) => opts.onProgress(Math.round((bytes / file.size) * 100));

  if (presign.backend === 'r2') {
    opts.onStatus('Uploading audio to Cloudflare R2…');
    await uploadWithProgress(presign.url, file, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      onProgress: toPct,
    });
    return presign.audioPath as string;
  }

  // Supabase Storage: upload with the admin's own session (RLS allows it).
  opts.onStatus('Uploading audio…');
  const token = await opts.supabaseAccessToken();
  await uploadWithProgress(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${presign.bucket}/${presign.key}`,
    file,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      onProgress: toPct,
    },
  );
  return presign.audioPath as string;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-foreground mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground mt-1.5">{hint}</span>}
    </label>
  );
}

export function FileInput({
  icon,
  accept,
  file,
  onChange,
  hint,
}: {
  icon: ReactNode;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  hint: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
        file ? 'bg-primary/8 border-primary/40' : 'bg-input border-border',
      )}
    >
      <span className={file ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <div className="flex-1 min-w-0">
        <input
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:font-semibold file:cursor-pointer"
        />
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : hint}
        </p>
      </div>
      {file && <Check className="w-4 h-4 text-primary shrink-0" />}
    </div>
  );
}

/**
 * Selectable chips with an inline "create new" affordance — easier to scan than
 * a native <select> and it keeps creating a new option on the same screen.
 */
export function ChipPicker({
  label,
  required,
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  hint,
  icon,
  allowNone,
}: {
  label: string;
  required?: boolean;
  items: Array<{ id: string; label: string; icon?: string | null }>;
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  placeholder: string;
  hint: string;
  icon: ReactNode;
  allowNone?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    const name = draft.trim();
    if (!name) {
      toast.error(`Enter a ${label.toLowerCase()} name`);
      return;
    }
    setSaving(true);
    try {
      await onCreate(name);
      setDraft('');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">
          {label} {required && <span className="text-primary">*</span>}
        </span>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New {label.toLowerCase()}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mb-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    create();
                  }
                  if (e.key === 'Escape') setCreating(false);
                }}
                className={INPUT}
                placeholder={placeholder}
                // biome-ignore lint/a11y/noAutofocus: field is revealed on demand
                autoFocus
              />
              <button
                type="button"
                onClick={create}
                disabled={saving}
                className="px-4 py-3 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setDraft('');
                }}
                className="px-3 py-3 glass-card rounded-xl shrink-0 hover:border-border"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto scrollbar-hide p-0.5">
          {allowNone && (
            <button
              type="button"
              onClick={() => onChange('')}
              className={cn(
                'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all press',
                value === ''
                  ? 'bg-primary text-white border-transparent shadow-lg glow-primary'
                  : 'bg-input border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
              )}
            >
              None
            </button>
          )}
          {items.map((it) => {
            const active = value === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onChange(it.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all press',
                  active
                    ? 'bg-primary text-white border-transparent shadow-lg glow-primary'
                    : 'bg-input border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
                )}
              >
                <span className={active ? '' : 'opacity-70'}>{it.icon ?? icon}</span>
                {it.label}
                {active && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UploadForm({
  playlists: initialPlaylists,
  defaultPlaylistId,
}: {
  playlists: PlaylistOption[];
  defaultPlaylistId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('');
  const [description, setDescription] = useState('');
  const [playlists, setPlaylists] = useState<PlaylistOption[]>(initialPlaylists);
  const [playlistId, setPlaylistId] = useState(
    defaultPlaylistId && initialPlaylists.some((p) => p.id === defaultPlaylistId)
      ? defaultPlaylistId
      : initialPlaylists[0]?.id ?? '',
  );
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [platformLinks, setPlatformLinks] = useState<PlatformLinks>({});

  function reset() {
    setDone(null);
    setTitle('');
    setChannel('');
    setDescription('');
    setAudio(null);
    setCover(null);
    setPlatformLinks({});
    setPct(0);
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

  async function submit(e: FormEvent, publish: boolean) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!audio) {
      toast.error('An audio file (MP3) is required');
      return;
    }
    if (!playlistId) {
      toast.error('Choose a playlist, or create a new one');
      return;
    }

    setBusy(true);
    setPct(0);
    try {
      setProgress('Reading audio…');
      const duration = await readDuration(audio);

      // The cover is small and goes to a different bucket, so there is no
      // reason to make it wait for the audio the way it used to.
      const [audioPath, coverResult] = await Promise.all([
        uploadAudio(audio, {
          supabaseAccessToken: () => accessToken(supabase),
          onStatus: setProgress,
          onProgress: setPct,
        }),
        uploadCover(supabase, cover),
      ]);

      setProgress('Saving…');
      const res = await adminCreatePodcast({
        title,
        channel,
        description,
        playlistId: playlistId || null,
        durationSeconds: duration,
        audioPath,
        coverUrl: coverResult.url,
        coverPath: coverResult.path,
        platformLinks,
        publish,
      });
      if ('error' in res && res.error) throw new Error(res.error);
      if ('warning' in res && res.warning) toast.warning(res.warning);

      setDone(publish ? 'Podcast published!' : 'Saved as draft.');
      toast.success(publish ? 'Published' : 'Draft saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  if (done) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center max-w-2xl">
        <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-black text-foreground mb-2">{done}</h2>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={reset}
            className="press px-5 py-2.5 bg-primary text-white rounded-full font-semibold glow-primary"
          >
            Upload another
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/podcasts')}
            className="press px-5 py-2.5 glass-card rounded-full font-semibold"
          >
            Manage podcasts
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="max-w-2xl space-y-6">
      <Field label="Title *">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={INPUT}
          placeholder="e.g. 10-Minute Body Scan for Deep Sleep"
        />
      </Field>

      <Field label="Channel / Host">
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={INPUT}
          placeholder="e.g. Rahul S."
        />
      </Field>

      <Field
        label="Description"
        hint="Shown on the episode page and used as the meta description for search engines."
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={INPUT}
          placeholder="What's this session about? Who is it for?"
        />
      </Field>

      <ChipPicker
        label="Playlist"
        required
        items={playlists.map((p) => ({ id: p.id, label: p.title }))}
        value={playlistId}
        onChange={setPlaylistId}
        onCreate={createPlaylist}
        placeholder="e.g. Sleep Stories, Season 1"
        hint="No playlists yet — create the first one."
        icon={<ListMusic className="w-3.5 h-3.5" />}
      />

      <Field label="Audio (MP3) *">
        <FileInput
          icon={<Music className="w-5 h-5" />}
          accept="audio/*"
          file={audio}
          onChange={setAudio}
          hint="MP3, up to 200MB"
        />
      </Field>

      <Field label="Cover logo (optional)">
        <FileInput
          icon={<ImageIcon className="w-5 h-5" />}
          accept="image/*"
          file={cover}
          onChange={setCover}
          hint="JPG / PNG / WebP, up to 5MB"
        />
      </Field>

      <div className="pt-2">
        <h2 className="text-sm font-bold text-foreground mb-1">Links for this episode</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Optional. Paste the direct URL for this episode on each app — listeners get those
          buttons under the audio. Leave a field empty and it falls back to the show-wide link
          from <span className="text-foreground font-medium">Links</span>.
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
          onClick={(e) => submit(e, true)}
          disabled={busy}
          className="shine press px-6 py-3 bg-primary text-white rounded-full font-bold glow-primary disabled:opacity-50 flex items-center gap-2"
        >
          <UploadCloud className="w-4 h-4" />
          Publish
        </button>
        <button
          type="button"
          onClick={(e) => submit(e, false)}
          disabled={busy}
          className="press px-6 py-3 glass-card rounded-full font-semibold disabled:opacity-50"
        >
          Save draft
        </button>
      </div>
    </form>
  );
}
