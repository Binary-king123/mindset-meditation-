/**
 * A permanent URL for an episode's audio file.
 *
 * The audio bucket is private and `signAudioUrl` mints URLs that expire within
 * the hour, which is fine for the in-page player but useless in an RSS
 * `<enclosure>` — a podcast client may fetch that URL days after the feed was
 * generated, and every subscriber would get a 403.
 *
 * So the feed points here instead, and this 302s to a freshly signed URL on
 * every request. Podcast clients follow redirects, the bucket stays private,
 * and every download passes through a route that could later record one.
 *
 * Distinct from /api/stream/[id], which is the in-app player's path: that one
 * takes a UUID, requires no crawler-friendly identifier, and opens a
 * play_events row for progress reporting. This takes the public slug and does
 * not, because a feed fetch is not a play.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';
import { signAudioUrl } from '@/lib/audio-storage';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('tracks')
    .select('audio_path, status, deleted_at')
    .eq('slug', slug)
    .maybeSingle();

  const track = data as { audio_path: string; status: string; deleted_at: string | null } | null;

  // Only published episodes are reachable — a draft's audio must not leak via
  // a guessable slug just because this route bypasses the player.
  if (!track || track.deleted_at || track.status !== 'published') {
    return new NextResponse('Not found', { status: 404 });
  }

  const url = await signAudioUrl(track.audio_path, 3600);
  if (!url) return new NextResponse('Audio unavailable', { status: 503 });

  // 302, not 301: the target is a short-lived signed URL and must never be
  // cached by a client or an intermediary as this episode's permanent home.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
