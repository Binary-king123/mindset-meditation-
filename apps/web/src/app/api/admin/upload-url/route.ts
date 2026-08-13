import { ADMIN_DENIAL_RESPONSE, checkAdmin } from '@/lib/admin-guard';
import { AUDIO_BUCKET, audioBackend, encodeAudioPath } from '@/lib/audio-storage';
import {
  MULTIPART_THRESHOLD,
  PART_SIZE,
  abortMultipart,
  completeMultipart,
  presignPutUrl,
  startMultipart,
} from '@/lib/r2';
// Tells the admin's browser where to put an audio file and how.
//  - R2 configured, large file → a multipart upload: many presigned part URLs
//                                the browser uploads in parallel
//  - R2 configured, small file → a single short-lived presigned PUT
//  - otherwise                 → the private Supabase Storage bucket, uploaded
//                                with the caller's own session (RLS allows it)
// Admin-gated either way.
import { type NextRequest, NextResponse } from 'next/server';

/** Object keys are minted here, never taken from the client. */
function newKey(filename: unknown): string {
  const ext =
    String(filename || '')
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'mp3';
  return `podcasts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

function fail(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    const denial = ADMIN_DENIAL_RESPONSE[admin.reason ?? 'unauthenticated'];
    return NextResponse.json({ error: denial.error }, { status: denial.status });
  }

  const body = await req.json().catch(() => null);
  if (!body) return fail('Malformed request', 400);

  const action: string = body.action ?? 'start';
  const backend = audioBackend();

  // ---- finish or clean up an in-flight multipart upload ----
  if (action === 'complete' || action === 'abort') {
    const { key, uploadId } = body;
    if (typeof key !== 'string' || typeof uploadId !== 'string') {
      return fail('key and uploadId are required', 400);
    }
    // Keys are minted by this route and always live under podcasts/. Without
    // this an admin-authenticated caller could complete or abort an upload
    // anywhere in the bucket.
    if (!key.startsWith('podcasts/') || key.includes('..')) {
      return fail('Invalid key', 400);
    }

    try {
      if (action === 'abort') {
        await abortMultipart(key, uploadId);
        return NextResponse.json({ ok: true });
      }
      // No parts manifest from the client: completeMultipart asks R2 which
      // parts it is holding, which works whether or not the bucket exposes the
      // ETag header to the browser. The client sends only the expected *count*,
      // which is checked against R2's own list so a short upload fails here
      // rather than publishing a truncated episode.
      const expected = Number(body.expectedParts);
      await completeMultipart(
        key,
        uploadId,
        Number.isInteger(expected) && expected > 0 ? expected : undefined,
      );
      return NextResponse.json({ ok: true, audioPath: encodeAudioPath('r2', key) });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not finalise the upload');
    }
  }

  // ---- start a new upload ----
  const key = newKey(body.filename);
  const contentType: string = body.contentType || 'audio/mpeg';
  const size = Number(body.size) || 0;

  if (backend !== 'r2') {
    return NextResponse.json({
      backend,
      mode: 'single',
      bucket: AUDIO_BUCKET,
      key,
      audioPath: encodeAudioPath('supabase', key),
    });
  }

  try {
    // Below the threshold the multipart handshake costs more than it saves.
    if (size > MULTIPART_THRESHOLD) {
      const partCount = Math.ceil(size / PART_SIZE);
      const { uploadId, partUrls, partSize } = await startMultipart(key, contentType, partCount);
      return NextResponse.json({
        backend,
        mode: 'multipart',
        key,
        uploadId,
        partUrls,
        partSize,
        audioPath: encodeAudioPath('r2', key),
      });
    }

    const url = await presignPutUrl(key, contentType);
    return NextResponse.json({
      backend,
      mode: 'single',
      url,
      key,
      audioPath: encodeAudioPath('r2', key),
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not sign the upload URL');
  }
}
