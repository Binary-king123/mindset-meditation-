// Streams a podcast's audio via a short-lived signed URL, from whichever
// backend it was uploaded to (see lib/audio-storage.ts), and records the play
// for analytics.
// RLS on the user's session decides visibility (non-admins only see published).
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signAudioUrl } from '@/lib/audio-storage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Visibility enforced by RLS (published-only for non-admins).
  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_path, duration_seconds')
    .eq('id', id)
    .maybeSingle();

  if (!track?.audio_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = await signAudioUrl(track.audio_path);
  if (!url) {
    return NextResponse.json({ error: 'Audio storage not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Record the play. Written with the service role because play_events has no
  // client-facing insert policy — that keeps the table un-spammable via PostgREST.
  let eventId: string | null = null;
  const sessionId = req.nextUrl.searchParams.get('sid');
  if (sessionId) {
    const admin = createAdminClient();
    const { data: event } = await admin
      .from('play_events')
      .insert({
        track_id: id,
        user_id: user?.id ?? null,
        session_id: sessionId,
        duration_seconds: track.duration_seconds ?? 0,
      })
      .select('id')
      .single();
    eventId = event?.id ?? null;
  }

  // Best-effort play-count bump.
  void supabase.rpc('increment_play_count', { p_track_id: id });

  return NextResponse.json({ url, eventId });
}
