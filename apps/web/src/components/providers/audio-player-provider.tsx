'use client';

import { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';
import { Lock } from 'lucide-react';
import { usePlayerStore } from '@/store/player.store';
import { useAuth } from '@/components/providers/auth-provider';
import { BRAND } from '@/lib/brand';
import type { Track } from '@mindset/types';

// Signed-OUT listeners get a 1-minute preview of every episode; signing in
// unlocks full playback. Enforced in the timeupdate handler and in resume().
const PREVIEW_SECONDS = 60;

interface AudioPlayerContextValue {
  play: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setSleepTimer: (minutes: number | null) => void;
  addToQueue: (track: Track) => void;
  /** Stop playback and dismiss the player entirely. */
  close: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

/**
 * Stable per-browser id so anonymous listeners can be told apart in analytics
 * without any tracking cookie. Lives in localStorage; regenerating it just
 * counts that browser as a new listener.
 */
function listenerSessionId(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'mm-listener-session';
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const store = usePlayerStore();
  const { user } = useAuth();
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  // The timeupdate listener is registered once, so it would close over a stale
  // `user`. A ref keeps the signed-in state current inside that callback.
  const isSignedInRef = useRef(false);
  // Analytics for the episode currently playing.
  const playEventRef = useRef<string | null>(null);
  const reportedRef = useRef(0);

  useEffect(() => {
    isSignedInRef.current = !!user;
  }, [user]);

  /** Sends how far the listener got. Throttled to once per 15s of playback. */
  const reportProgress = useCallback((seconds: number, force = false) => {
    const eventId = playEventRef.current;
    if (!eventId) return;
    const whole = Math.floor(seconds);
    if (!force && whole - reportedRef.current < 15) return;
    reportedRef.current = whole;

    const payload = JSON.stringify({ eventId, listenedSeconds: whole });
    // sendBeacon survives the page being closed mid-episode.
    if (force && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/play-progress', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/play-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* analytics must never break playback */
    });
  }, []);

  // Initialize audio element
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      store.setCurrentTime(audio.currentTime);
      reportProgress(audio.currentTime);
      // Preview limit is for signed-OUT listeners only.
      if (!isSignedInRef.current && audio.currentTime >= PREVIEW_SECONDS) {
        audio.pause();
        reportProgress(audio.currentTime, true);
        const s = usePlayerStore.getState();
        s.setIsPlaying(false);
        if (!s.previewEnded) s.setPreviewEnded(true);
      }
    });

    audio.addEventListener('pause', () => reportProgress(audio.currentTime, true));

    // Catch listeners who close the tab mid-episode.
    const flush = () => reportProgress(audio.currentTime, true);
    window.addEventListener('pagehide', flush);

    audio.addEventListener('loadedmetadata', () => {
      store.setDuration(audio.duration);
    });

    audio.addEventListener('ended', () => {
      if (store.isRepeat) {
        audio.currentTime = 0;
        audio.play();
      } else {
        skipNext();
      }
    });

    audio.addEventListener('waiting', () => store.setIsLoading(true));
    audio.addEventListener('canplay', () => store.setIsLoading(false));

    // Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        audio.play();
        store.setIsPlaying(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
        store.setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler('nexttrack', skipNext);
      navigator.mediaSession.setActionHandler('previoustrack', skipPrev);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
          store.setCurrentTime(details.seekTime);
        }
      });
    }

    return () => {
      window.removeEventListener('pagehide', flush);
      audio.pause();
      audio.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
      } catch {
        // Wake lock not supported or permission denied
      }
    }
  }

  function releaseWakeLock() {
    wakeLock?.release();
    setWakeLock(null);
  }

  const play = useCallback(
    async (track: Track, queue: Track[] = []) => {
      const audio = audioRef.current;
      if (!audio) return;

      try {
        // Flush the outgoing episode's progress before switching.
        reportProgress(audio.currentTime, true);

        const response = await fetch(
          `/api/stream/${track.id}?sid=${encodeURIComponent(listenerSessionId())}`,
        );
        const { url, eventId } = await response.json();
        if (!url) return;

        playEventRef.current = eventId ?? null;
        reportedRef.current = 0;

        audio.src = url;
        audio.playbackRate = store.playbackSpeed;

        store.setCurrentTrack(track); // also resets previewEnded
        store.setIsPlaying(true);
        store.setIsLoading(true);
        if (queue.length) store.setQueue(queue);

        await audio.play();
        await requestWakeLock();

        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.instructor_name ?? BRAND.shortName,
            album: BRAND.name,
            artwork: track.thumbnail_url
              ? [{ src: track.thumbnail_url, sizes: '512x512', type: 'image/jpeg' }]
              : [],
          });
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
        store.setIsLoading(false);
      }
    },
    [store],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    store.setIsPlaying(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [store]);

  const resume = useCallback(async () => {
    if (!audioRef.current) return;
    // Signed-out listeners cannot resume past the preview limit.
    if (!isSignedInRef.current && audioRef.current.currentTime >= PREVIEW_SECONDS) {
      store.setPreviewEnded(true);
      return;
    }
    await audioRef.current.play();
    store.setIsPlaying(true);
    await requestWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }, [store]);

  const skipNext = useCallback(() => {
    const { queue, queueIndex } = store;
    const nextIndex = store.isShuffle ? Math.floor(Math.random() * queue.length) : queueIndex + 1;

    if (nextIndex < queue.length) {
      store.setQueueIndex(nextIndex);
      play(queue[nextIndex]);
    } else {
      store.setIsPlaying(false);
      releaseWakeLock();
    }
  }, [store, play]);

  const skipPrev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const prevIndex = store.queueIndex - 1;
    if (prevIndex >= 0) {
      store.setQueueIndex(prevIndex);
      play(store.queue[prevIndex]);
    }
  }, [store, play]);

  const seek = useCallback(
    (seconds: number) => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = seconds;
      store.setCurrentTime(seconds);
    },
    [store],
  );

  const setVolume = useCallback(
    (volume: number) => {
      if (!audioRef.current) return;
      audioRef.current.volume = volume;
      store.setVolume(volume);
    },
    [store],
  );

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !store.isMuted;
    store.setIsMuted(!store.isMuted);
  }, [store]);

  const setPlaybackSpeed = useCallback(
    (speed: number) => {
      if (!audioRef.current) return;
      audioRef.current.playbackRate = speed;
      store.setPlaybackSpeed(speed);
    },
    [store],
  );

  const toggleRepeat = useCallback(() => store.setIsRepeat(!store.isRepeat), [store]);
  const toggleShuffle = useCallback(() => store.setIsShuffle(!store.isShuffle), [store]);
  const setSleepTimer = useCallback(
    (minutes: number | null) => {
      store.setSleepTimer(minutes);
      if (minutes) {
        store.setSleepTimerEndsAt(Date.now() + minutes * 60 * 1000);
      } else {
        store.setSleepTimerEndsAt(null);
      }
    },
    [store],
  );

  const addToQueue = useCallback(
    (track: Track) => {
      store.setQueue([...store.queue, track]);
    },
    [store],
  );

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      // Reporting before the src is dropped, so the final position is recorded.
      reportProgress(audio.currentTime, true);
      audio.removeAttribute('src');
      audio.load();
    }
    store.setIsPlaying(false);
    store.clearQueue(); // also clears currentTrack, which hides the player
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  }, [store, reportProgress]);

  // Sleep timer effect
  useEffect(() => {
    if (!store.sleepTimerEndsAt) return;
    const remaining = store.sleepTimerEndsAt - Date.now();
    if (remaining <= 0) {
      pause();
      store.setSleepTimerEndsAt(null);
      return;
    }
    const timer = setTimeout(() => {
      pause();
      store.setSleepTimerEndsAt(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [store.sleepTimerEndsAt, pause]);

  return (
    <AudioPlayerContext.Provider
      value={{
        play,
        pause,
        resume,
        skipNext,
        skipPrev,
        seek,
        setVolume,
        setPlaybackSpeed,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        setSleepTimer,
        addToQueue,
        close,
      }}
    >
      {children}

      {store.previewEnded && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card rounded-3xl p-8 max-w-sm text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-4">
              <Lock className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-foreground mb-2">1-minute preview</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              You&apos;ve reached the free preview limit for this session. Full episodes are coming
              soon.
            </p>
            <button
              type="button"
              onClick={() => store.setPreviewEnded(false)}
              className="px-6 py-2.5 bg-primary text-white rounded-full font-semibold glow-primary"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
