'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The search input. A real `<form method=GET>` submitting to /search, so it
 * works before hydration and a submitted query lands in the URL — which is
 * what makes results shareable and what the WebSite SearchAction promises.
 */
export function SearchBox({
  initialQuery = '',
  autoFocus = false,
  compact = false,
  className,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  /** Navbar variant: smaller, no submit button. */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <search className={cn('relative flex items-center', className)}>
      <form
        action="/search"
        method="get"
        onSubmit={onSubmit}
        className="relative flex w-full items-center"
      >
        <Search
          className={cn(
            'pointer-events-none absolute left-3 text-muted-foreground',
            compact ? 'h-4 w-4' : 'h-5 w-5',
          )}
        />
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: only set on /search, where the input is the page's purpose
          autoFocus={autoFocus}
          placeholder={compact ? 'Search…' : 'Search meditations…'}
          aria-label="Search meditations"
          className={cn(
            'w-full rounded-full border border-border bg-card/60 text-foreground',
            'placeholder:text-muted-foreground focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            // The native clear affordance duplicates the button below.
            '[&::-webkit-search-cancel-button]:appearance-none',
            compact ? 'py-2 pl-9 pr-8 text-sm' : 'py-3.5 pl-11 pr-11 text-base',
          )}
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className={cn(
              'absolute right-3 grid place-items-center rounded-full text-muted-foreground',
              'transition-colors hover:text-foreground',
              compact ? 'h-5 w-5' : 'h-6 w-6',
            )}
          >
            <X className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        )}
      </form>
    </search>
  );
}
