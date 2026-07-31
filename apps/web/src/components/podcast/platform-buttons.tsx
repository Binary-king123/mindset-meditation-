// The "listen elsewhere" buttons. One component serves the homepage hero, the
// platform strip further down, the episode page and the footer — the variant
// only changes size and chrome, never the link logic.
import { cn } from '@/lib/utils';
import type { ResolvedPlatform } from '@/lib/platforms';

export function PlatformButtons({
  platforms,
  variant = 'hero',
  className,
}: {
  platforms: ResolvedPlatform[];
  /** hero: pills under the CTA. compact: smaller pills. list: full-width rows. */
  variant?: 'hero' | 'compact' | 'list';
  className?: string;
}) {
  if (platforms.length === 0) return null;

  return (
    <ul
      className={cn(
        'flex items-center gap-2 sm:gap-2.5 justify-center sm:justify-start',
        variant === 'hero' && 'justify-center',
        variant === 'list' && 'flex-col items-stretch',
        className,
      )}
    >
      {platforms.map((platform) => (
        <li key={platform.id}>
          <a
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Listen on ${platform.label} (opens in a new tab)`}
            style={{ '--brand': platform.color } as React.CSSProperties}
            className={cn(
              'press inline-flex items-center justify-center rounded-full border font-semibold transition-all duration-300 hover:-translate-y-0.5',
              'border-border bg-card/70 backdrop-blur text-foreground',
              'hover:border-[var(--brand)] hover:shadow-[0_10px_28px_-12px_var(--brand)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              variant === 'compact'
                ? 'p-2.5 sm:px-4 sm:py-2.5 gap-0 sm:gap-2 text-sm'
                : 'p-3.5 sm:px-5 sm:py-3 gap-0 sm:gap-2.5 text-sm',
              variant === 'list' && 'w-full px-5 py-3.5 gap-2.5',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="var(--brand)"
              aria-hidden="true"
              focusable="false"
              // `w-5.5`/`h-5.5` are not on Tailwind's spacing scale (it jumps
              // 5 → 6), so those classes compiled to nothing and the icon had
              // no size below `sm` — where the label is hidden and the icon is
              // the entire button. Arbitrary values, which do exist.
              className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px] shrink-0"
            >
              <path d={platform.path} />
            </svg>
            <span className={variant === 'list' ? 'inline' : 'hidden sm:inline'}>
              {platform.label}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
