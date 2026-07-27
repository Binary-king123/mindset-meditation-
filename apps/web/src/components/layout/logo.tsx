import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

/**
 * Brand mark: concentric "breath" rings around a lotus dot. Rings drift on
 * hover, which is the same motif the hero and player use.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative grid place-items-center rounded-2xl overflow-hidden shrink-0',
        'w-9 h-9 glow-primary',
        className,
      )}
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--aura-1)) 0%, hsl(var(--aura-4)) 55%, hsl(var(--aura-2)) 100%)',
      }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="w-full h-full text-white/90" fill="none" role="img">
        <title>The Mindset Meditation</title>
        <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
        <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="1.3" opacity="0.8" />
        <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  textClassName,
  href = '/',
  stacked = false,
}: {
  className?: string;
  textClassName?: string;
  href?: string;
  stacked?: boolean;
}) {
  return (
    <Link href={href} className={cn('group flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark className="transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" />
      <span className={cn('flex min-w-0 flex-col leading-none', stacked ? '' : 'justify-center')}>
        <span
          className={cn(
            // nowrap + truncate rather than wrapping: in a fixed-height navbar
            // a two-line brand name pushes the row out of alignment.
            'truncate whitespace-nowrap font-black tracking-tight text-foreground',
            textClassName ?? 'text-base',
          )}
          style={{ fontFamily: 'var(--font-outfit)' }}
        >
          The <span className="text-gradient">Mindset</span> Meditation
        </span>
        {stacked && (
          <span className="text-[11px] text-muted-foreground mt-1.5">{BRAND.tagline}</span>
        )}
      </span>
    </Link>
  );
}
