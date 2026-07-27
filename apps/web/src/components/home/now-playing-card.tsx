'use client';

/**
 * The homepage hero panel, modelled on Spotify's "tapped a song" now-playing
 * screen: context header, big square art, title/artist row, scrubber, transport
 * controls, and the device bar along the bottom.
 *
 * It is a real player, not a mock — it drives the same AudioPlayerProvider the
 * rest of the site uses, so pressing play here starts the episode and the
 * global bottom bar picks it up. When the site has no published episodes yet
 * (`playable={false}`) the same layout renders as a showcase whose primary
 * action links to /playlists instead.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  Headphones,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAudioPlayer } from '@/components/providers/audio-player-provider';
import { usePlayerStore } from '@/store/player.store';
import { toggleSave } from '@/app/actions';
import { formatDuration, type EpisodeSummary } from '@/lib/podcast';
import { cn } from '@/lib/utils';
import type { Track } from '@mindset/types';

/** Sizing shared by the four small transport buttons flanking the play key. */
const SIDE_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70 transition-colors ' +
  'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ' +
  'disabled:cursor-not-allowed disabled:text-foreground/25 disabled:hover:text-foreground/25';

/** The play key, inverted against the panel. Button when it can stream, link when it cannot. */
const PLAY_KEY =
  'press grid h-14 w-14 shrink-0 place-items-center rounded-full bg-foreground text-background ' +
  'shadow-[0_10px_30px_-8px_hsl(var(--glow)/0.55)] transition-transform hover:scale-105 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-16 sm:w-16';

// 40px square: the header icons are visually small, but the tap target must not be.
const ICON_BUTTON =
  'grid h-9 w-9 xs:h-10 xs:w-10 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors ' +
  'hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring/60';

function ContextHeader({ showName }: { showName: string }) {
  return (
    <header className="flex items-center gap-1.5 xs:gap-3">
      <Link href="/playlists" aria-label="Browse all episodes" className={ICON_BUTTON}>
        <ChevronDown className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[8px] font-bold uppercase tracking-[0.16em] text-foreground/45 xs:text-[9px] xs:tracking-[0.22em]">
          Playing from podcast
        </p>
        <p className="truncate text-[11px] font-semibold text-foreground/85 sm:text-xs">{showName}</p>
      </div>
      <Link href="/playlists" aria-label="Open the episode queue" className={ICON_BUTTON}>
        <ListMusic className="h-4 w-4" />
      </Link>
    </header>
  );
}

function Artwork({ src, title, playing }: { src: string; title: string; playing: boolean }) {
  return (
    <div className="relative mx-auto mt-4 aspect-square w-full max-w-[19rem] sm:mt-6 sm:max-w-none">
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-foreground/10 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85)]">
        <Image
          src={src}
          alt={`${title} cover art`}
          fill
          priority
          sizes="(max-width: 640px) 80vw, (max-width: 1024px) 60vw, 400px"
          className="object-cover"
        />
      </div>
      {playing && (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
          <span className="audio-wave -mx-1.5 scale-[0.5]">
            <span className="audio-wave-bar" />
            <span className="audio-wave-bar" />
            <span className="audio-wave-bar" />
          </span>
          Playing
        </span>
      )}
    </div>
  );
}

function SaveButton({
  title,
  saved,
  onToggle,
}: {
  title: string;
  saved: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from your library` : `Save ${title} to your library`}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        saved
          ? 'border-primary bg-primary text-white'
          : 'border-foreground/25 text-foreground/70 hover:border-foreground hover:text-foreground',
      )}
    >
      {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );
}

function Scrubber({
  title,
  elapsed,
  duration,
  seekable,
  onSeek,
}: {
  title: string;
  elapsed: number;
  duration: number;
  seekable: boolean;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <div className="mt-4">
      <input
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={elapsed}
        onChange={onSeek}
        disabled={!seekable}
        aria-label={`Seek within ${title}`}
        className="seek-range w-full"
        style={{ '--seek': `${progress}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex items-center justify-between text-[11px] font-medium tabular-nums text-foreground/45">
        <span>{formatDuration(elapsed)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

function PlayKey({
  title,
  playable,
  loading,
  playing,
  onToggle,
}: {
  title: string;
  playable: boolean;
  loading: boolean;
  playing: boolean;
  onToggle: () => void;
}) {
  if (!playable) {
    return (
      <Link href="/playlists" aria-label="Browse episodes" className={PLAY_KEY}>
        <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
      </Link>
    );
  }

  let icon = <Play className="ml-0.5 h-6 w-6" fill="currentColor" />;
  if (loading) icon = <Loader2 className="h-6 w-6 animate-spin" />;
  else if (playing) icon = <Pause className="h-6 w-6" fill="currentColor" />;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? `Pause ${title}` : `Play ${title}`}
      className={PLAY_KEY}
    >
      {icon}
    </button>
  );
}

function DeviceBar({ playing }: { playing: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2 border-t border-foreground/8 pt-3 sm:mt-5 sm:pt-4">
      <Headphones className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-primary sm:text-xs">
        {playing ? 'Listening on this device' : 'Ready on this device'}
      </p>
      <Link
        href="/playlists"
        className="shrink-0 rounded-full px-2 py-2 text-[11px] font-semibold text-foreground/45 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:text-xs"
      >
        Queue
      </Link>
    </div>
  );
}

export function NowPlayingCard({
  track,
  queue = [],
  showName,
  cover,
  playable = true,
}: {
  track: EpisodeSummary;
  queue?: EpisodeSummary[];
  showName: string;
  /** Artwork used when the episode has no cover of its own. */
  cover: string;
  /** False when only demo episodes exist, so nothing can actually stream. */
  playable?: boolean;
}) {
  const { play, pause, resume, seek, skipNext, skipPrev, toggleRepeat, toggleShuffle } =
    useAudioPlayer();

  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const storeTime = usePlayerStore((s) => s.currentTime);
  const storeDuration = usePlayerStore((s) => s.duration);
  const isRepeat = usePlayerStore((s) => s.isRepeat);
  const isShuffle = usePlayerStore((s) => s.isShuffle);

  const [saved, setSaved] = useState(false);
  // isRepeat/isShuffle are rehydrated from localStorage, so they can disagree
  // with the server-rendered defaults. Hold the server values until mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted && currentId === track.id;
  const duration = active && storeDuration > 0 ? storeDuration : track.duration_seconds;
  const elapsed = active ? Math.min(storeTime, duration) : 0;
  const playing = active && isPlaying;

  const handlePlayPause = useCallback(() => {
    if (currentId !== track.id) {
      play(track as unknown as Track, (queue.length ? queue : [track]) as unknown as Track[]);
      return;
    }
    if (isPlaying) pause();
    else void resume();
  }, [currentId, isPlaying, pause, play, queue, resume, track]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value)),
    [seek],
  );

  const handleSave = useCallback(async () => {
    setSaved((prev) => !prev); // optimistic; reverted below on failure
    const res = await toggleSave(track.id);
    if ('error' in res && res.error) {
      setSaved((prev) => !prev);
      toast.error(res.error === 'Please sign in' ? 'Sign in to save episodes' : res.error);
    } else if ('saved' in res) {
      setSaved(Boolean(res.saved));
      toast.success(res.saved ? 'Saved to your library' : 'Removed from your library');
    }
  }, [track.id]);

  // Demo episodes borrow stock covers, so in that state the branded show art is
  // the honest thing to show. A real episode always wins with its own artwork.
  const artwork = (playable && track.thumbnail_url) || cover;

  return (
    <article className="now-playing relative isolate w-full overflow-hidden rounded-[1.75rem] border border-foreground/10 p-4 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)] xs:p-5 sm:rounded-[2rem] sm:p-6">
      {/* Colour pooled behind the art, the way Spotify tints its player */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--aura-1)/0.32),transparent_65%)]"
      />

      <ContextHeader showName={showName} />
      <Artwork src={artwork} title={track.title} playing={playing} />

      <div className="mt-5 flex items-start gap-3 sm:mt-6">
        <div className="min-w-0 flex-1">
          <Link
            href={playable ? `/podcast/${track.slug}` : '/playlists'}
            className="block truncate text-lg font-black leading-tight text-foreground transition-colors hover:text-foreground/80 sm:text-xl"
          >
            {track.title}
          </Link>
          <p className="mt-1 truncate text-sm text-foreground/50">
            {track.instructor_name || showName}
          </p>
        </div>
        {playable && <SaveButton title={track.title} saved={saved} onToggle={handleSave} />}
      </div>

      <Scrubber
        title={track.title}
        elapsed={elapsed}
        duration={duration}
        seekable={active}
        onSeek={handleSeek}
      />

      <div className="mt-3 flex items-center justify-between gap-1 px-1 sm:mt-4 sm:gap-2 sm:px-2">
        <button
          type="button"
          onClick={toggleShuffle}
          disabled={!playable}
          aria-pressed={mounted && isShuffle}
          aria-label="Shuffle episodes"
          className={cn(SIDE_BUTTON, mounted && isShuffle && 'text-primary hover:text-primary')}
        >
          <Shuffle className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={skipPrev}
          disabled={!active}
          aria-label="Previous episode"
          className={SIDE_BUTTON}
        >
          <SkipBack className="h-5 w-5" fill="currentColor" />
        </button>

        <PlayKey
          title={track.title}
          playable={playable}
          loading={active && isLoading}
          playing={playing}
          onToggle={handlePlayPause}
        />

        <button
          type="button"
          onClick={skipNext}
          disabled={!active}
          aria-label="Next episode"
          className={SIDE_BUTTON}
        >
          <SkipForward className="h-5 w-5" fill="currentColor" />
        </button>

        <button
          type="button"
          onClick={toggleRepeat}
          disabled={!playable}
          aria-pressed={mounted && isRepeat}
          aria-label="Repeat episode"
          className={cn(SIDE_BUTTON, mounted && isRepeat && 'text-primary hover:text-primary')}
        >
          <Repeat className="h-[18px] w-[18px]" />
        </button>
      </div>

      <DeviceBar playing={playing} />
    </article>
  );
}
