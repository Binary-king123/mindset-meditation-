// Tells the admin's browser where to put an audio file and how.
//  - R2 configured  → a short-lived presigned PUT URL (direct to Cloudflare)
//  - otherwise      → the private Supabase Storage bucket, uploaded with the
//                     caller's own session (RLS allows admins to insert)
// Admin-gated either way.
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { presignPutUrl } from '@/lib/r2';
import { AUDIO_BUCKET, audioBackend, encodeAudioPath } from '@/lib/audio-storage';
import { ADMIN_COOKIE, adminIsVerified } from '@/lib/admin-verify';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });
  if (role !== 'admin' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Second factor, checked here because the signing key is not available to
  // Edge middleware (see the note in middleware.ts).
  const verified = await adminIsVerified(req.cookies.get(ADMIN_COOKIE)?.value, user.id);
  if (!verified) {
    return NextResponse.json({ error: 'Admin verification required' }, { status: 403 });
  }

  const { filename, contentType } = await req.json();
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || 'mp3';
  const key = `podcasts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const backend = audioBackend();

  if (backend === 'r2') {
    try {
      const url = await presignPutUrl(key, contentType || 'audio/mpeg');
      return NextResponse.json({ backend, url, key, audioPath: encodeAudioPath('r2', key) });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not sign the upload URL' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    backend,
    bucket: AUDIO_BUCKET,
    key,
    audioPath: encodeAudioPath('supabase', key),
  });
}
