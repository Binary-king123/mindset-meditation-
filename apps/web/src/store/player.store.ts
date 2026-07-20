import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@mindset/types';

interface PlayerStore {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  sleepTimerMinutes: number | null;
  sleepTimerEndsAt: number | null;
  isRepeat: boolean;
  isShuffle: boolean;
  previewEnded: boolean;

  // Setters
  setCurrentTrack: (track: Track | null) => void;
  setQueue: (queue: Track[]) => void;
  setQueueIndex: (index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (muted: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setSleepTimerEndsAt: (endsAt: number | null) => void;
  setIsRepeat: (repeat: boolean) => void;
  setIsShuffle: (shuffle: boolean) => void;
  setPreviewEnded: (ended: boolean) => void;
  clearQueue: () => void;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      currentTrack: null,
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      isMuted: false,
      playbackSpeed: 1.0,
      sleepTimerMinutes: null,
      sleepTimerEndsAt: null,
      isRepeat: false,
      isShuffle: false,
      previewEnded: false,

      setCurrentTrack: (track) =>
        set({ currentTrack: track, currentTime: 0, duration: 0, previewEnded: false }),
      setQueue: (queue) => set({ queue }),
      setQueueIndex: (queueIndex) => set({ queueIndex }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume }),
      setIsMuted: (isMuted) => set({ isMuted }),
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
      setSleepTimer: (sleepTimerMinutes) => set({ sleepTimerMinutes }),
      setSleepTimerEndsAt: (sleepTimerEndsAt) => set({ sleepTimerEndsAt }),
      setIsRepeat: (isRepeat) => set({ isRepeat }),
      setIsShuffle: (isShuffle) => set({ isShuffle }),
      setPreviewEnded: (previewEnded) => set({ previewEnded }),
      clearQueue: () => set({ queue: [], queueIndex: 0, currentTrack: null }),
    }),
    {
      name: 'mindset-meditation-player',
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        playbackSpeed: state.playbackSpeed,
        isRepeat: state.isRepeat,
        isShuffle: state.isShuffle,
      }),
    },
  ),
);
