'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Repeat, Shuffle, List, Timer, ChevronDown, Gauge, X, Heart
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlayerStore } from '@/store/player.store';
import { useAudioPlayer } from '@/components/providers/audio-player-provider';
import { toggleSave, isSaved } from '@/app/actions';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

function formatTime(seconds: number): string {
  if (Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_TIMER_OPTIONS = [5, 10, 15, 30, 45, 60];

export function AudioPlayer() {
  const store = usePlayerStore();
  const { pause, resume, skipNext, skipPrev, seek, setVolume, toggleMute, setPlaybackSpeed, toggleRepeat, toggleShuffle, setSleepTimer, close } = useAudioPlayer();
  const [expanded, setExpanded] = useState(false);
  // Optimistic like state, keyed to the current track so it resets on change.
  const [likedId, setLikedId] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Load the real saved state for whatever is playing. Without this the heart
  // renders empty for an already-saved episode and the first press unsaves it.
  const playingId = store.currentTrack?.id;
  useEffect(() => {
    if (!playingId) return;
    let cancelled = false;
    isSaved(playingId).then((saved) => {
      if (!cancelled) setLikedId(saved ? playingId : null);
    });
    return () => {
      cancelled = true;
    };
  }, [playingId]);

  // Every hook must run on every render. Bailing out before these useCallbacks
  // meant React saw 9 hooks with no track and 11 once one started playing —
  // "Rendered more hooks than during the previous render".
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      seek(percentage * store.duration);
    },
    [seek, store.duration],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value));
    },
    [setVolume],
  );

  const toggleLike = useCallback(async () => {
    const id = usePlayerStore.getState().currentTrack?.id;
    if (!id) return;
    // Optimistic flip; revert on error.
    setLikedId((prev) => (prev === id ? null : id));
    const res = await toggleSave(id);
    if ('error' in res && res.error) {
      setLikedId((prev) => (prev === id ? null : id));
      toast.error(res.error === 'Please sign in' ? 'Sign in to save episodes' : res.error);
    } else if ('saved' in res) {
      setLikedId(res.saved ? id : null);
      toast.success(res.saved ? 'Saved to your library' : 'Removed from your library');
    }
  }, []);

  // Safe to bail out now that all hooks have run.
  if (!store.currentTrack) return null;

  const track = store.currentTrack;
  const progress = store.duration > 0 ? (store.currentTime / store.duration) * 100 : 0;
  const liked = likedId === track.id;

  return (
    <>
      {/* Backdrop when expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Player */}
      <motion.div
        layout
        className={cn(
          'fixed z-50 transition-all duration-500',
          expanded
            ? 'inset-x-0 bottom-0 rounded-t-3xl'
            : 'bottom-0 left-0 right-0 md:bottom-4 md:left-4 md:right-4 md:w-auto md:max-w-4xl md:mx-auto rounded-t-2xl md:rounded-2xl'
        )}
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--card) / 0.94) 0%, hsl(var(--background) / 0.97) 100%)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: '1px solid hsl(var(--glow) / 0.28)',
          boxShadow: '0 0 60px hsl(var(--glow) / 0.22), 0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Compact Player */}
        {!expanded && (
          <div className="p-3 flex items-center gap-3">
            {/* Thumbnail */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setExpanded(true)}
              className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 glow-primary"
            >
              {track.thumbnail_url ? (
                <Image src={track.thumbnail_url} alt={track.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/30 flex items-center justify-center text-xl">🧘</div>
              )}
              {store.isPlaying && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="audio-wave scale-75">
                    {[1,2,3].map(n => <div key={n} className="audio-wave-bar" />)}
                  </div>
                </div>
              )}
            </motion.button>

            {/* Info */}
            {/* A real <button>: keyboard and screen-reader support for free,
                rather than re-implementing them on a div with role="button". */}
            <button
              type="button"
              className="flex-1 min-w-0 text-left cursor-pointer"
              onClick={() => setExpanded(true)}
              aria-label={`Expand player: ${track.title}`}
            >
              <span className="block text-foreground font-bold text-sm truncate">{track.title}</span>
              <span className="block text-foreground/50 text-xs truncate">
                {track.instructor_name ?? BRAND.shortName}
              </span>
            </button>

            {/* Controls */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Like — hidden on the narrowest screens to keep the bar tidy */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={toggleLike}
                className={cn(
                  'hidden sm:flex p-2 transition-colors',
                  liked ? 'text-[hsl(var(--aura-4))]' : 'text-foreground/60 hover:text-foreground',
                )}
                aria-label={liked ? 'Remove from library' : 'Save to library'}
                aria-pressed={liked}
              >
                <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={skipPrev}
                className="p-2 text-foreground/70 hover:text-foreground transition-colors"
                aria-label="Previous"
              >
                <SkipBack className="w-4 h-4" fill="currentColor" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={store.isPlaying ? pause : resume}
                className="w-10 h-10 bg-primary rounded-full flex items-center justify-center glow-primary"
                aria-label={store.isPlaying ? 'Pause' : 'Play'}
              >
                {store.isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : store.isPlaying ? (
                  <Pause className="w-4 h-4 text-white" fill="white" />
                ) : (
                  <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
                )}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={skipNext}
                className="p-2 text-foreground/70 hover:text-foreground transition-colors"
                aria-label="Next"
              >
                <SkipForward className="w-4 h-4" fill="currentColor" />
              </motion.button>

              {/* Cancel — stop and dismiss the player */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={close}
                className="p-2 text-foreground/60 hover:text-foreground transition-colors"
                aria-label="Close player"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground/10 rounded-b-2xl">
              <div
                className="h-full bg-primary rounded-b-2xl transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Expanded Player */}
        {expanded && (
          <div className="p-6 md:p-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setExpanded(false)}
                className="p-2 text-foreground/60 hover:text-foreground transition-colors"
              >
                <ChevronDown className="w-6 h-6" />
              </motion.button>
              <div className="text-center">
                <p className="text-foreground/50 text-xs font-semibold uppercase tracking-widest">Now Playing</p>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowQueue(!showQueue)}
                  className={cn('p-2 transition-colors', showQueue ? 'text-primary' : 'text-foreground/60 hover:text-foreground')}
                  aria-label="Queue"
                >
                  <List className="w-6 h-6" />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={close}
                  className="p-2 text-foreground/60 hover:text-foreground transition-colors"
                  aria-label="Close player"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>
            </div>

            {/* Artwork */}
            <motion.div
              animate={{ scale: store.isPlaying ? 1 : 0.9 }}
              transition={{ duration: 0.5 }}
              className={cn(
                'w-64 h-64 md:w-80 md:h-80 mx-auto rounded-3xl overflow-hidden mb-8 shadow-2xl',
                store.isPlaying && 'glow-primary-lg'
              )}
            >
              {track.thumbnail_url ? (
                <Image src={track.thumbnail_url} alt={track.title} width={320} height={320} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-9xl"
                  style={{ background: 'linear-gradient(135deg, hsl(247,83%,30%) 0%, hsl(270,60%,20%) 100%)' }}
                >
                  🧘
                </div>
              )}
            </motion.div>

            {/* Track Info */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-foreground mb-1">{track.title}</h2>
              <p className="text-foreground/50">{track.instructor_name ?? BRAND.shortName}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div
                className="h-2 bg-foreground/10 rounded-full cursor-pointer group relative"
                onClick={handleSeek}
                onKeyDown={(e) => {
                  // Arrow keys nudge by 5s so the bar is usable without a mouse.
                  if (e.key === 'ArrowRight') seek(Math.min(store.currentTime + 5, store.duration));
                  if (e.key === 'ArrowLeft') seek(Math.max(store.currentTime - 5, 0));
                }}
                tabIndex={0}
                role="slider"
                aria-label="Seek"
                aria-valuenow={store.currentTime}
                aria-valuemin={0}
                aria-valuemax={store.duration}
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-100 relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-foreground rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-foreground/40 mt-2">
                <span>{formatTime(store.currentTime)}</span>
                <span>{formatTime(store.duration)}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-6 mb-8">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={toggleShuffle}
                className={cn('p-2 transition-colors', store.isShuffle ? 'text-primary' : 'text-foreground/50 hover:text-foreground')}
                aria-label="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={skipPrev}
                className="p-3 text-foreground/70 hover:text-foreground transition-colors"
              >
                <SkipBack className="w-7 h-7" fill="currentColor" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={store.isPlaying ? pause : resume}
                className="w-20 h-20 bg-primary rounded-full flex items-center justify-center glow-primary-lg"
              >
                {store.isLoading ? (
                  <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : store.isPlaying ? (
                  <Pause className="w-9 h-9 text-white" fill="white" />
                ) : (
                  <Play className="w-9 h-9 text-white ml-1" fill="white" />
                )}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={skipNext}
                className="p-3 text-foreground/70 hover:text-foreground transition-colors"
              >
                <SkipForward className="w-7 h-7" fill="currentColor" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={toggleRepeat}
                className={cn('p-2 transition-colors', store.isRepeat ? 'text-primary' : 'text-foreground/50 hover:text-foreground')}
                aria-label="Repeat"
              >
                <Repeat className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Secondary Controls */}
            <div className="flex items-center justify-between mb-4">
              {/* Volume */}
              <div className="flex items-center gap-2 flex-1">
                <button type="button" onClick={toggleMute} className="text-foreground/50 hover:text-foreground transition-colors">
                  {store.isMuted || store.volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={store.isMuted ? 0 : store.volume}
                  onChange={handleVolumeChange}
                  className="flex-1 h-1 accent-primary cursor-pointer"
                  aria-label="Volume"
                />
              </div>

              <div className="flex items-center gap-3 ml-4">
                {/* Playback Speed */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowSleepMenu(false); }}
                    className={cn('flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors', showSpeedMenu ? 'text-primary bg-primary/10' : 'text-foreground/50 hover:text-foreground')}
                  >
                    <Gauge className="w-3 h-3" />
                    {store.playbackSpeed}x
                  </button>
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-xl p-2 shadow-2xl min-w-[100px]"
                      >
                        {PLAYBACK_SPEEDS.map((speed) => (
                          <button
                            type="button"
                            key={speed}
                            onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                            className={cn(
                              'block w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors',
                              store.playbackSpeed === speed ? 'bg-primary text-white' : 'text-foreground hover:bg-accent'
                            )}
                          >
                            {speed}x
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Sleep Timer */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); }}
                    className={cn('flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors', (showSleepMenu || store.sleepTimerEndsAt) ? 'text-primary bg-primary/10' : 'text-foreground/50 hover:text-foreground')}
                  >
                    <Timer className="w-3 h-3" />
                    {store.sleepTimerEndsAt
                      ? `${Math.ceil((store.sleepTimerEndsAt - Date.now()) / 60000)}m`
                      : 'Sleep'}
                  </button>
                  <AnimatePresence>
                    {showSleepMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-xl p-2 shadow-2xl min-w-[120px]"
                      >
                        <button
                          type="button"
                          onClick={() => { setSleepTimer(null); setShowSleepMenu(false); }}
                          className="block w-full text-left px-3 py-1.5 text-sm rounded-lg text-foreground hover:bg-accent"
                        >
                          Off
                        </button>
                        {SLEEP_TIMER_OPTIONS.map((min) => (
                          <button
                            type="button"
                            key={min}
                            onClick={() => { setSleepTimer(min); setShowSleepMenu(false); }}
                            className={cn(
                              'block w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors',
                              store.sleepTimerMinutes === min ? 'bg-primary text-white' : 'text-foreground hover:bg-accent'
                            )}
                          >
                            {min} minutes
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Queue */}
            <AnimatePresence>
              {showQueue && store.queue.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-foreground/10 pt-4 mt-4"
                >
                  <p className="text-foreground/50 text-xs font-semibold uppercase tracking-widest mb-3">Up Next</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
                    {store.queue.slice(store.queueIndex + 1, store.queueIndex + 6).map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/5 transition-colors">
                        <span className="text-foreground/30 text-xs w-4 text-right">{i + 1}</span>
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                          {t.thumbnail_url ? (
                            <Image src={t.thumbnail_url} alt={t.title} width={32} height={32} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-primary/20 flex items-center justify-center text-xs">🧘</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground text-xs font-medium truncate">{t.title}</p>
                          <p className="text-foreground/40 text-xs truncate">{t.instructor_name}</p>
                        </div>
                        <span className="text-foreground/30 text-xs">{formatTime(t.duration_seconds)}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </>
  );
}
