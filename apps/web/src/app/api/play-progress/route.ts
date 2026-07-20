// Heartbeat from the player: how far into an episode a listener has actually
// got. Feeds the retention figure on the admin analytics dashboard.
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: { eventId?: string; listenedSeconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { eventId, listenedSeconds } = body;
  if (!eventId || typeof listenedSeconds !== 'number' || !Number.isFinite(listenedSeconds)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Clamped so a bad client can't skew retention with absurd values. The row
  // is addressed by an unguessable UUID handed out at play time.
  const seconds = Math.max(0, Math.min(Math.round(listenedSeconds), 86_400));

  const admin = createAdminClient();
  const { error } = await admin
    .from('play_events')
    .update({ listened_seconds: seconds })
    .eq('id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
