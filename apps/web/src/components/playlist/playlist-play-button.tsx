'use client';

import { motion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { useAudioPlayer } from '@/components/providers/audio-player-provider';
import { usePlayerStore } from '@/store/player.store';
import type { CardPodcast } from '@/components/podcast/podcast-card';
import type { Track } from '@mindset/types';

/** Plays a playlist from the top, queueing every session in order. */
export function PlaylistPlayButton({ tracks }: { tracks: CardPodcast[] }) {
  const { play, pause, resume } = useAudioPlayer();
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const inThisPlaylist = tracks.some((t) => t.id === currentId);
  const playing = inThisPlaylist && isPlaying;

  function onClick() {
    if (!tracks.length) return;
    if (!inThisPlaylist) {
      return play(tracks[0] as unknown as Track, tracks as unknown as Track[]);
    }
    return isPlaying ? pause() : resume();
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="shine relative flex items-center gap-3 pl-3 pr-7 py-3 bg-primary text-white rounded-full font-bold glow-primary hover:bg-primary/90 transition-colors"
    >
      <span className="relative grid place-items-center w-9 h-9 rounded-full bg-white/20">
        {playing && (
          <span className="absolute inset-0 rounded-full border border-white/50 pulse-ring" />
        )}
        {playing ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </span>
      {playing ? 'Pause playlist' : 'Play all'}
    </motion.button>
  );
}
