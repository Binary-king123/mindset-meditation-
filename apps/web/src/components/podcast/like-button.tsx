'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    <motion.button
      type="button"
      onClick={onClick}
      disabled={pending}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={cn(
        'relative flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold transition-colors disabled:opacity-60',
        saved ? 'bg-primary text-white glow-primary' : 'glass-card hover:border-primary/40',
      )}
      aria-pressed={saved}
    >
      <span className="relative grid place-items-center w-5 h-5">
        {/* Burst ring the moment it's saved */}
        <AnimatePresence>
          {saved && (
            <motion.span
              key="burst"
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border-2 border-current"
            />
          )}
        </AnimatePresence>
        <motion.span
          key={saved ? 'on' : 'off'}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          className="grid place-items-center"
        >
          <Heart className={cn('w-5 h-5', saved && 'fill-current')} />
        </motion.span>
      </span>
      {saved ? 'Saved' : 'Save'}
      {count > 0 ? ` · ${count}` : ''}
    </motion.button>
  );
}
