'use client';

import { Share2, Check } from 'lucide-react';
import { useShare } from '@/lib/use-share';
import { cn } from '@/lib/utils';

/**
 * Shares the page LINK only — never the audio file. Uses the native share
 * sheet where available (mobile), otherwise copies the URL to the clipboard.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const { share, copied } = useShare({ title, path });

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        'motion-safe:transition-transform motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97] flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold transition-colors',
        'glass-card hover:border-primary/40',
      )}
      aria-label={`Share ${title}`}
    >
      {copied ? <Check className="w-5 h-5 text-primary" /> : <Share2 className="w-5 h-5" />}
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}
