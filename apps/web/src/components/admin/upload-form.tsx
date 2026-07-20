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
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminCreatePodcast, adminCreatePlaylist, adminCreateCategory } from '@/app/actions';
import { BUCKETS } from '@/lib/podcast';
import { cn } from '@/lib/utils';

export const INPUT =
  'w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all';

export interface PlaylistOption {
  id: string;
  title: string;
}
export interface CategoryOption {
  id: string;
  name: string;
  icon?: string | null;
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

/** PUT/POST a file with real progress. fetch() can't report upload progress. */
export function uploadWithProgress(
  url: string,
  file: File,
  opts: { method: 'PUT' | 'POST'; headers: Record<string, string>; onProgress: (pct: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, url);
    for (const [k, v] of Object.entries(opts.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}) ${xhr.responseText.slice(0, 140)}`));
    xhr.onerror = () =>
      reject(new Error('Network error during upload — check the storage bucket CORS settings'));
    xhr.send(file);
  });
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
  categories: initialCategories,
  playlists: initialPlaylists,
}: {
  categories: CategoryOption[];
  playlists: PlaylistOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories);
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? '');
  const [playlists, setPlaylists] = useState<PlaylistOption[]>(initialPlaylists);
  const [playlistId, setPlaylistId] = useState(initialPlaylists[0]?.id ?? '');
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setDone(null);
    setTitle('');
    setChannel('');
    setDescription('');
    setAudio(null);
    setCover(null);
    setPct(0);
  }

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
        // Supabase Storage: upload with the admin's own session (RLS allows it).
        setProgress('Uploading audio…');
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Session expired — sign in again');

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        await uploadWithProgress(
          `${base}/storage/v1/object/${presign.bucket}/${presign.key}`,
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

      const audioPath = presign.audioPath as string;

      let coverUrl: string | null = null;
      let coverPath: string | null = null;
      if (cover) {
        setProgress('Uploading cover…');
        coverPath = randomPath('covers', cover.name);
        const up2 = await supabase.storage
          .from(BUCKETS.thumbnails)
          .upload(coverPath, cover, { contentType: cover.type || 'image/jpeg', upsert: false });
        if (up2.error) throw new Error(up2.error.message);
        coverUrl = supabase.storage.from(BUCKETS.thumbnails).getPublicUrl(coverPath).data.publicUrl;
      }

      setProgress('Saving…');
      const res = await adminCreatePodcast({
        title,
        channel,
        description,
        categoryId: categoryId || null,
        playlistId: playlistId || null,
        durationSeconds: duration,
        audioPath,
        coverUrl,
        coverPath,
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
