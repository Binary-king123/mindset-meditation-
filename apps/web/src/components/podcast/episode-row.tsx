'use client';

// A Spotify-style episode row for the playlist detail page: artwork with a
// play overlay, title + description, duration and date, and a play button that
// reflects the now-playing state. Built entirely on theme tokens (--card,
// --foreground, --muted-foreground, --primary, --border) so it reads correctly
// in both light and dark themes.
import Link from 'next/link';
import Image from 'next/image';
import { Play, Clock, Calendar } from 'lucide-react';
import { useAudioPlayer } from '@/components/providers/audio-player-provider';
import { usePlayerStore } from '@/store/player.store';
import { formatDuration } from '@/lib/podcast';
import { FALLBACK_COVER_GRADIENT } from '@/lib/fallback-cover';
import { cn } from '@/lib/utils';
import type { Track } from '@mindset/types';

export interface EpisodeItem {
  id: string;
  title: string;
  slug: string;
  thumbnail_url?: string | null;
  instructor_name?: string | null;
  short_description?: string | null;
  description?: string | null;
  duration_seconds: number;
  created_at?: string | null;
}

// Fixed month names, so the date renders identically on server and client
// regardless of locale (toLocaleDateString can differ and trip hydration).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function NowPlayingWave() {
  return (
    <span className="audio-wave">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className="audio-wave-bar" style={{ height: `${6 + n * 3}px` }} />
      ))}
    </span>
  );
}

export function EpisodeRow({
  podcast,
  queue,
}: {
  podcast: EpisodeItem;
  queue?: EpisodeItem[];
}) {
  const { play } = useAudioPlayer();
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isActive = currentId === podcast.id;

  const desc = podcast.short_description || podcast.description;
  const date = formatDate(podcast.created_at);

  const onPlay = () =>
    play(podcast as unknown as Track, (queue ?? [podcast]) as unknown as Track[]);

  return (
    <div
      className={cn(
        // Each episode is a subtle card that lights up on hover — reads cleanly
        // in both light and dark because it is built on theme tokens.
        'group flex items-center gap-3 sm:gap-4 p-2.5 md:p-3 rounded-xl border transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/60 bg-card/50 hover:bg-card hover:border-primary/30',
      )}
    >
      {/* Artwork with play overlay */}
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play ${podcast.title}`}
        className="relative w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden shrink-0"
      >
        {podcast.thumbnail_url ? (
          <Image src={podcast.thumbnail_url} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: FALLBACK_COVER_GRADIENT }} />
        )}
        <span
          className={cn(
            'absolute inset-0 grid place-items-center bg-black/45 transition-opacity',
            isActive && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {isActive && isPlaying ? (
            <NowPlayingWave />
          ) : (
            <Play className="w-5 h-5 text-foreground ml-0.5" fill="currentColor" />
          )}
        </span>
      </button>

      {/* Title + description */}
      <div className="min-w-0 flex-1">
        <Link href={`/podcast/${podcast.slug}`} className="block">
          <h3
            className={cn(
              'font-bold leading-snug line-clamp-1 transition-colors',
              isActive ? 'text-primary' : 'text-foreground group-hover:text-primary',
            )}
          >
            {podcast.title}
          </h3>
        </Link>
        {desc && (
          <p className="text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2 mt-0.5">
            {desc}
          </p>
        )}
      </div>

      {/* Duration + date, hidden on small screens */}
      <div className="hidden md:flex items-center gap-6 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {formatDuration(podcast.duration_seconds)}
        </span>
        {date && (
          <span className="flex items-center gap-1.5 w-28 justify-end">
            <Calendar className="w-3.5 h-3.5" />
            {date}
          </span>
        )}
      </div>

      {/* Play button */}
      <button
        type="button"
        onClick={onPlay}
        aria-label={isActive && isPlaying ? `Pause ${podcast.title}` : `Play ${podcast.title}`}
        className={cn(
          'press grid place-items-center w-10 h-10 rounded-full border shrink-0 transition-all',
          isActive
            ? 'bg-primary text-white border-transparent glow-primary'
            : 'border-border text-foreground hover:bg-primary hover:text-white hover:border-transparent',
        )}
      >
        {isActive && isPlaying ? (
          <NowPlayingWave />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </button>
    </div>
  );
}
