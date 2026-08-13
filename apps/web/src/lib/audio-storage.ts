// Where podcast audio lives. Cloudflare R2 is used when its credentials are
// present; otherwise we fall back to the private `podcast-audio` Supabase
// Storage bucket, which needs no extra setup. Either way the browser uploads
// directly and playback goes through a short-lived signed URL.
import { deleteObject, presignGetUrl, r2Configured } from '@/lib/r2';
import { createAdminClient } from '@/lib/supabase/admin';

export type AudioBackend = 'r2' | 'supabase';

export const AUDIO_BUCKET = 'podcast-audio';

export function audioBackend(): AudioBackend {
  return r2Configured() ? 'r2' : 'supabase';
}

/**
 * Stored `audio_path` carries its backend as a prefix ("r2:key" / "sb:key") so
 * a library can be migrated between backends without breaking existing rows.
 * A bare key is treated as R2, which is what earlier uploads wrote.
 */
export function encodeAudioPath(backend: AudioBackend, key: string): string {
  return `${backend === 'r2' ? 'r2' : 'sb'}:${key}`;
}

function parseAudioPath(path: string): { backend: AudioBackend; key: string } {
  if (path.startsWith('sb:')) return { backend: 'supabase', key: path.slice(3) };
  if (path.startsWith('r2:')) return { backend: 'r2', key: path.slice(3) };
  return { backend: 'r2', key: path };
}

/** Mints a short-lived playback URL, or null if the backend can't serve it. */
export async function signAudioUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { backend, key } = parseAudioPath(path);

  if (backend === 'r2') {
    if (!r2Configured()) return null;
    return presignPutSafe(() => presignGetUrl(key, expiresIn));
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(AUDIO_BUCKET).createSignedUrl(key, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Deletes the stored audio, from whichever backend holds it.
 *
 * Returns an error message instead of throwing: by the time this runs the DB
 * row is already gone, and the admin should not see a red toast on a delete
 * that did in fact happen. The caller surfaces it as a warning so a file left
 * behind is still visible rather than silent.
 */
export async function deleteAudio(path: string): Promise<string | null> {
  const { backend, key } = parseAudioPath(path);

  try {
    if (backend === 'r2') {
      if (!r2Configured()) return 'R2 is not configured — its audio file was left in place';
      await deleteObject(key);
      return null;
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(AUDIO_BUCKET).remove([key]);
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not delete the audio file';
  }
}

async function presignPutSafe(fn: () => Promise<string>): Promise<string | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
