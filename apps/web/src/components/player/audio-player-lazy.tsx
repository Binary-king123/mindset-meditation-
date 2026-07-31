'use client';

import dynamic from 'next/dynamic';

/**
 * The global player, loaded on demand.
 *
 * `AudioPlayer` is the largest client component in the app (~23 KB of source,
 * plus framer-motion) and is mounted on the homepage, both detail pages and the
 * playlist index — but it returns null until a track is playing, so on a first
 * visit every byte of it is downloaded and hydrated to render nothing.
 *
 * `ssr: false` is correct rather than merely convenient: the player's entire
 * initial state comes from a zustand store rehydrated from localStorage, so
 * there is no meaningful server render to reconcile.
 *
 * This wrapper exists because `next/dynamic` with `ssr: false` cannot be called
 * from a Server Component, and every page rendering the player is one.
 */
const AudioPlayerImpl = dynamic(
  () => import('@/components/player/audio-player').then((m) => m.AudioPlayer),
  { ssr: false },
);

export function AudioPlayer() {
  return <AudioPlayerImpl />;
}
