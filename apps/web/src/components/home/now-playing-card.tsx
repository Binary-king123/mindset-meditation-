/**
 * The homepage hero panel — modelled directly on a real Spotify now-playing
 * screen: full-width square artwork on top, title/host left-aligned beneath
 * it, elapsed/remaining time over a thin progress bar, a five-icon transport
 * row (like, previous, play, next, more), and a small device/share row along
 * the bottom.
 *
 * This is a static visual, not a real player — every control here is inert by
 * design, with no dependency on AudioPlayerProvider or the player store. The
 * persistent bottom bar (components/player/audio-player.tsx) is the real
 * player site-wide; this is a preview of what it looks like, not a second
 * copy of it.
 *
 * The artwork is always the fixed `cover` image passed in — it never swaps to
 * whatever episode happens to be latest, so the hero doesn't change shape
 * every time someone uploads. Title and host are the one thing that stays
 * real, taken from the latest episode as-is.
 */

import { type EpisodeSummary, formatDuration } from '@/lib/podcast';
import { Cast, Heart, MoreHorizontal, Pause, Share2, SkipBack, SkipForward } from 'lucide-react';
import Image from 'next/image';

/** A fixed-looking progress position — always partway through, never 0% or full. */
const STATIC_PROGRESS = 0.42;

/** The two small transport glyphs flanking the play key. */
const SIDE_KEY = 'grid shrink-0 place-items-center text-foreground';

export function NowPlayingCard({
  track,
  showName,
  cover,
}: {
  track: EpisodeSummary;
  showName: string;
  /** Fixed hero artwork — always shown, regardless of the episode's own cover. */
  cover: string;
}) {
  const duration = track.duration_seconds;
  const elapsed = Math.round(duration * STATIC_PROGRESS);
  const remaining = Math.max(0, duration - elapsed);

  return (
    <article className="now-playing relative isolate mx-auto w-full max-w-xs overflow-hidden rounded-[1.75rem] border border-foreground/10 p-4 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85)] sm:max-w-sm sm:p-5">
      {/* Colour pooled behind the art, the way Spotify tints its player */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--aura-1)/0.32),transparent_65%)]"
      />

      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-foreground/10 shadow-lg">
        <Image
          src={cover}
          alt={`${track.title} cover art`}
          fill
          priority
          sizes="(max-width: 640px) 85vw, 384px"
          className="object-cover"
        />
      </div>

      <div className="mt-4 flex items-center gap-2 sm:mt-5">
        {/* The "something is playing" cue, in miniature — decorative only. */}
        <span aria-hidden className="audio-wave -ml-0.5 scale-[0.6]">
          <span className="audio-wave-bar" />
          <span className="audio-wave-bar" />
          <span className="audio-wave-bar" />
        </span>
        <p className="min-w-0 flex-1 truncate text-lg font-black leading-tight text-foreground sm:text-xl">
          {track.title}
        </p>
      </div>
      <p className="mt-0.5 truncate text-sm text-foreground/50">
        {track.instructor_name || showName}
      </p>

      <div aria-hidden className="mt-4 sm:mt-5">
        <div className="flex items-center justify-between text-xs font-medium tabular-nums text-foreground/45">
          <span>{formatDuration(elapsed)}</span>
          <span>-{formatDuration(remaining)}</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/15">
          <div
            className="h-full rounded-full bg-foreground"
            style={{ width: `${STATIC_PROGRESS * 100}%` }}
          />
        </div>
      </div>

      <div aria-hidden className="mt-3 flex items-center justify-between sm:mt-4">
        <span className={SIDE_KEY}>
          <Heart className="h-5 w-5" />
        </span>
        <span className={SIDE_KEY}>
          <SkipBack className="h-6 w-6" fill="currentColor" />
        </span>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-foreground text-background shadow-[0_10px_28px_-8px_hsl(var(--glow)/0.55)] sm:h-14 sm:w-14">
          <Pause className="h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" />
        </span>
        <span className={SIDE_KEY}>
          <SkipForward className="h-6 w-6" fill="currentColor" />
        </span>
        <span className={SIDE_KEY}>
          <MoreHorizontal className="h-5 w-5" />
        </span>
      </div>

      <div
        aria-hidden
        className="mt-3 flex items-center justify-between text-foreground/40 sm:mt-4"
      >
        <Cast className="h-4 w-4" />
        <Share2 className="h-4 w-4" />
      </div>
    </article>
  );
}
