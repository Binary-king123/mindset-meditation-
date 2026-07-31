'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ListMusic, Play } from 'lucide-react';
import { formatPlaylistMeta, type PlaylistSummary } from '@/lib/podcast';
import { FALLBACK_COVER_GRADIENT } from '@/lib/fallback-cover';

/**
 * Playlist tile with the stacked-cards look that signals "this is a set, not a
 * single episode" — the same visual cue YouTube uses.
 */
export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <article className="group relative">
      <Link href={`/playlist/${playlist.slug}`} className="block">
        {/* Offset layers peeking out behind the cover */}
        <div className="relative pt-2.5 px-2.5">
          <span
            className="absolute top-0 left-6 right-6 h-3 rounded-t-xl bg-foreground/10 dark:bg-foreground/10 transition-all duration-500 group-hover:left-5 group-hover:right-5"
            aria-hidden
          />
          <span
            className="absolute top-1.5 left-4 right-4 h-3 rounded-t-xl bg-foreground/[0.16] dark:bg-white/[0.16] transition-all duration-500 group-hover:left-3 group-hover:right-3"
            aria-hidden
          />

          <div className="gradient-ring relative rounded-2xl overflow-hidden glass-card">
            <div className="relative aspect-square overflow-hidden">
              {playlist.thumbnail_url ? (
                <Image
                  src={playlist.thumbnail_url}
                  alt={playlist.title}
                  fill
                  className="object-cover transition-transform duration-slow ease-smooth group-hover:scale-110"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : (
                <div className="h-full w-full" style={{ background: FALLBACK_COVER_GRADIENT }} />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-75 group-hover:opacity-95 transition-opacity duration-500" />

              {/* Count badge, bottom-right like a playlist chip */}
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-black/55 backdrop-blur-md border border-white/15">
                <ListMusic className="w-3 h-3" />
                {playlist.track_count}
              </span>

              <span className="absolute bottom-3 right-3 w-11 h-11 rounded-full grid place-items-center bg-primary text-white shadow-2xl glow-primary opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-smooth">
                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
              </span>
            </div>

            <div className="p-4">
              <h3 className="font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-300">
                {playlist.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                {formatPlaylistMeta(playlist.track_count, playlist.total_duration_seconds)}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
