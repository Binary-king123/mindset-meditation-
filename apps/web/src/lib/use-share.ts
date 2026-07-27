'use client';

// Shared "share this link" behaviour: native share sheet where the browser has
// one (mobile), clipboard copy everywhere else, with a short-lived `copied`
// flag for the confirmation state.
//
// Extracted so the episode page's share button and the demo card in the
// how-it-works section behave identically instead of each having their own copy.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useShare({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, unmounting mid-confirmation leaves a timer that calls
  // setState on a dead component.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const share = useCallback(async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

    // Native sheet: text + url, never a file payload — we share the page, not
    // the audio.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: `Listen to "${title}"`, url });
        return;
      } catch (err) {
        // Dismissing the sheet is not an error worth surfacing.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link');
    }
  }, [title, path]);

  return { share, copied };
}
