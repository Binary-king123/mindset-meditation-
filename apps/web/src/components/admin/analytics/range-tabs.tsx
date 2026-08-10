import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RANGES } from '@/lib/analytics';

/**
 * The window selector.
 *
 * Plain links rather than a client component: the page is a server component
 * that reads `?days=`, so navigation already refetches with the new window and
 * a state hook would only duplicate that in JS the browser does not need.
 */
export function RangeTabs({ active }: { active: number }) {
  return (
    <nav aria-label="Reporting period" className="flex gap-1 p-1 rounded-full bg-muted/60 shrink-0">
      {RANGES.map((r) => {
        const selected = r.days === active;
        return (
          <Link
            key={r.days}
            href={`/admin/analytics?days=${r.days}`}
            scroll={false}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
