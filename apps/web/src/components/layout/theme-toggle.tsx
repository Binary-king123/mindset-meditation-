'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dark ↔ light switch. Dark is the default (see ThemeProvider in layout.tsx);
 * this only ever moves between the two, never to "system".
 *
 * next-themes cannot know the stored theme until it has mounted, so the icon is
 * rendered as a neutral placeholder on the server and swapped in on the client.
 * Rendering the real icon straight away produces a hydration mismatch and a
 * visible flip on first paint.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'}
      title={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'}
      className={cn(
        'press grid h-10 w-10 shrink-0 place-items-center rounded-full',
        'border border-foreground/12 bg-foreground/5 text-foreground/70',
        'transition-colors hover:bg-foreground/10 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {/* suppressHydrationWarning: the icon intentionally differs between the
          server placeholder and the client's stored theme. */}
      <span suppressHydrationWarning>
        {mounted && !isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
    </button>
  );
}
