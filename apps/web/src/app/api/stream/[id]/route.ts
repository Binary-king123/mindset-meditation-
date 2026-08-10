// Streams a podcast's audio via a short-lived signed URL, from whichever
// backend it was uploaded to (see lib/audio-storage.ts), and records the play
// for analytics.
// RLS on the user's session decides visibility (non-admins only see published).
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signAudioUrl } from '@/lib/audio-storage';
import { requestContext } from '@/lib/request-context';

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
    // Device/referrer/language, and country when a CDN supplies it. Recorded
    // here rather than sent from the client because a browser cannot be trusted
    // to report its own referrer, and because this route already holds the
    // headers — see lib/request-context.ts for what is deliberately not kept.
    const context = requestContext(req.headers, req.nextUrl.hostname);
    const base = {
      track_id: id,
      user_id: user?.id ?? null,
      session_id: sessionId,
      duration_seconds: track.duration_seconds ?? 0,
    };

    const { data: event, error } = await admin
      .from('play_events')
      .insert({ ...base, ...context })
      .select('id')
      .single();

    if (error) {
      // The context columns arrive with migration 035. If the code is deployed
      // before that runs, PostgREST rejects the whole insert for unknown
      // columns and the play would go unrecorded — analytics would quietly flatline
      // rather than fail loudly. Retrying without them keeps play tracking
      // working on the old schema, so deploy order stops mattering.
      const { data: fallback } = await admin
        .from('play_events')
        .insert(base)
        .select('id')
        .single();
      eventId = fallback?.id ?? null;
    } else {
      eventId = event?.id ?? null;
    }
  }

  // Best-effort play-count bump.
  void supabase.rpc('increment_play_count', { p_track_id: id });

  return NextResponse.json({ url, eventId });
}
