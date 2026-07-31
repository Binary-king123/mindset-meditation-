'use client';

import { cn } from '@/lib/utils';
/**
 * Cover art picker for both episodes and playlists.
 *
 * Two real failures used to reach the admin as a raw Supabase Storage error
 * only after they had filled in the rest of the form and pressed submit:
 *   - "mime type image/heic is not supported" — the storage bucket only
 *     allows jpeg/png/webp/gif (see fullschema.sql), but a phone's camera
 *     roll hands out HEIC by default.
 *   - "The object exceeded the maximum allowed size" — the bucket caps
 *     uploads at 5MB, well under what a modern phone photo actually is.
 *
 * Both are fixed here rather than worked around at upload time: whatever is
 * picked is immediately decoded, downscaled to cover-art dimensions and
 * re-encoded as a small JPEG — before the admin has typed anything else, with
 * a live thumbnail as proof it worked. `uploadCover` receives an already-safe
 * file and needs no changes.
 *
 * The only case this can't fix is a HEIC file opened outside Safari, since no
 * other major browser can decode HEIC into a canvas at all. That case gets a
 * plain-English error telling the admin what to do about it, instead of a raw
 * storage error string.
 */
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

/** Comfortably larger than any cover art is displayed at, small in bytes. */
const MAX_DIMENSION = 1600;

function withJpegExtension(name: string): string {
  return `${name.replace(/\.[^./]+$/, '')}.jpg`;
}

/**
 * Decodes, downscales and re-encodes an image file to a JPEG under 5MB.
 * Resolves null only when the browser cannot decode the file at all.
 */
export async function normalizeCoverImage(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    // Step quality down on the rare busy image that is still large at
    // MAX_DIMENSION — cheap insurance against ever hitting the 5MB cap again.
    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size <= 5 * 1024 * 1024) {
        return new File([blob], withJpegExtension(file.name), { type: 'image/jpeg' });
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CoverArtField({
  file,
  onChange,
  existingUrl,
  hint,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  /** The cover already saved, shown until a replacement is picked. */
  existingUrl?: string | null;
  hint?: string;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when replaced or when the field unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pick(raw: File | null) {
    setError(null);
    if (!raw) return;

    setBusy(true);
    const normalized = await normalizeCoverImage(raw);
    setBusy(false);

    if (!normalized) {
      setError(
        "Couldn't read that image. If it's a HEIC photo from an iPhone, open it in " +
          'Photos and use Share → Save as JPEG (or take a screenshot of it), then try again.',
      );
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(normalized));
    onChange(normalized);
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const showUrl = preview ?? (!file ? existingUrl : null);

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-input">
        {showUrl ? (
          <Image
            src={showUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized={!!preview}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {preview && !busy && (
          <button
            type="button"
            onClick={clear}
            aria-label="Remove picked cover"
            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground hover:bg-destructive hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <label
          htmlFor={inputId}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5',
            'text-sm font-semibold text-primary hover:bg-primary/25',
          )}
        >
          {preview || existingUrl ? 'Replace image' : 'Choose image'}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <p className={cn('mt-1.5 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint ?? 'JPG, PNG, WebP or a phone photo — resized automatically'}
        </p>
      </div>
    </div>
  );
}
