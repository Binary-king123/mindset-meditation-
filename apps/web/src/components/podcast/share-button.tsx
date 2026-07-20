'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, Check, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Shares the page LINK only — never the audio file. Uses the native share
 * sheet where available (mobile), otherwise copies the URL to the clipboard.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

    // Native sheet: text + url, no file payload.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: `Listen to "${title}"`, url });
        return;
      } catch (err) {
        // User dismissed the sheet — not an error worth surfacing.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link');
    }
  }

  return (
    <motion.button
      type="button"
      onClick={share}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={cn(
        'flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold transition-colors',
        'glass-card hover:border-primary/40',
      )}
      aria-label={`Share ${title}`}
    >
      {copied ? (
        <Check className="w-5 h-5 text-primary" />
      ) : (
        <Share2 className="w-5 h-5" />
      )}
      {copied ? 'Copied' : 'Share'}
    </motion.button>
  );
}

/** Compact variant for card footers. */
export function ShareIconButton({ title, path }: { title: string; path: string }) {
  return (
    <span className="inline-flex">
      <ShareButton title={title} path={path} />
      <span className="sr-only">
        <Link2 className="w-3 h-3" />
      </span>
    </span>
  );
}
