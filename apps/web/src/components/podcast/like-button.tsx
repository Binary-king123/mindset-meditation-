'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { toggleSave } from '@/app/actions';
import { cn } from '@/lib/utils';

export function LikeButton({
  trackId,
  initialSaved,
  initialCount,
}: {
  trackId: string;
  initialSaved: boolean;
  initialCount: number;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const prev = saved;
      setSaved(!prev);
      setCount((c) => c + (prev ? -1 : 1));
      const res = await toggleSave(trackId);
      if ('error' in res && res.error) {
        setSaved(prev);
        setCount((c) => c + (prev ? 1 : -1));
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'motion-safe:transition-transform motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.95]',
        'relative flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold transition-colors disabled:opacity-60',
        saved ? 'bg-primary text-white glow-primary' : 'glass-card hover:border-primary/40',
      )}
      aria-pressed={saved}
    >
      <span className="relative grid place-items-center w-5 h-5">
        {/* Burst ring the moment it's saved. `key` restarts the CSS animation
            on each save — without it the keyframes only ever run once. */}
        {saved && (
          <span
            key={`burst-${saved}`}
            aria-hidden
            className="like-burst absolute inset-0 rounded-full border-2 border-current"
          />
        )}
        <span key={saved ? 'on' : 'off'} className="like-pop grid place-items-center">
          <Heart className={cn('w-5 h-5', saved && 'fill-current')} />
        </span>
      </span>
      {saved ? 'Saved' : 'Save'}
      {count > 0 ? ` · ${count}` : ''}
    </button>
  );
}
