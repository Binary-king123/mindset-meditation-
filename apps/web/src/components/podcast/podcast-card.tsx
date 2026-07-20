'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Play, MessageCircle, Heart } from 'lucide-react';
import { useAudioPlayer } from '@/components/providers/audio-player-provider';
import { usePlayerStore } from '@/store/player.store';
import { formatDuration } from '@/lib/podcast';
import { cn } from '@/lib/utils';
import type { Track } from '@mindset/types';

export interface CardPodcast {
  id: string;
  title: string;
  slug: string;
  thumbnail_url?: string | null;
  instructor_name?: string | null;
  duration_seconds: number;
  favorite_count?: number;
  comment_count?: number;
  category?: { name: string; color: string | null; icon: string | null } | null;
}

export function PodcastCard({ podcast, queue }: { podcast: CardPodcast; queue?: CardPodcast[] }) {
  const { play } = useAudioPlayer();
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isActive = currentId === podcast.id;
  const accent = podcast.category?.color ?? '#8b5cf6';

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={cn(
        'gradient-ring group relative rounded-2xl overflow-hidden glass-card',
        'transition-shadow duration-500 hover:shadow-[0_28px_60px_-24px_hsl(var(--glow)/0.55)]',
        isActive && 'ring-2 ring-primary glow-primary',
      )}
    >
      <div className="relative aspect-square overflow-hidden">
        <Link href={`/podcast/${podcast.slug}`} className="block w-full h-full">
          {podcast.thumbnail_url ? (
            <Image
              src={podcast.thumbnail_url}
              alt={podcast.title}
              fill
              className="object-cover transition-transform duration-slow ease-smooth group-hover:scale-110"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-5xl transition-transform duration-slow group-hover:scale-110"
              style={{ background: `linear-gradient(140deg, ${accent} 0%, ${accent}55 60%, transparent 100%)` }}
            >
              <span className="drop-shadow-lg">{podcast.category?.icon ?? '🧘'}</span>
            </div>
          )}

          {/* Scrim keeps the overlay chips legible on any artwork */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-70 group-hover:opacity-95 transition-opacity duration-500" />
        </Link>

        {/* Duration */}
        <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-black/45 backdrop-blur-md border border-white/15">
          {formatDuration(podcast.duration_seconds)}
        </span>

        {/* Now-playing badge */}
        {isActive && isPlaying && (
          <span className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white bg-primary/85 backdrop-blur-md">
            <span className="audio-wave scale-[0.45] -mx-1.5">
              {[1, 2, 3].map((n) => (
                <span key={n} className="audio-wave-bar" />
              ))}
            </span>
            Playing
          </span>
        )}

        {/* Play */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          onClick={() => play(podcast as unknown as Track, (queue ?? [podcast]) as unknown as Track[])}
          aria-label={`Play ${podcast.title}`}
          className={cn(
            'absolute bottom-3 right-3 w-12 h-12 rounded-full grid place-items-center',
            'bg-primary text-white shadow-2xl glow-primary',
            'transition-all duration-500 ease-smooth',
            isActive
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0',
          )}
        >
          {isActive && isPlaying ? (
            <span className="audio-wave">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className="audio-wave-bar" style={{ height: `${6 + n * 3}px` }} />
              ))}
            </span>
          ) : (
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          )}
        </motion.button>
      </div>

      <div className="p-4">
        {podcast.category && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2"
            style={{ color: accent, background: `${accent}1f`, boxShadow: `inset 0 0 0 1px ${accent}33` }}
          >
            {podcast.category.icon} {podcast.category.name}
          </span>
        )}
        <Link href={`/podcast/${podcast.slug}`} className="block">
          <h3 className="font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-300">
            {podcast.title}
          </h3>
        </Link>
        {podcast.instructor_name && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{podcast.instructor_name}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            {podcast.favorite_count ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            {podcast.comment_count ?? 0}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
