import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDelta, type Delta } from '@/lib/analytics';

/**
 * One headline figure.
 *
 * `hint` is not decoration — several of these numbers mean something narrower
 * than their label suggests (retention is capped by the preview gate, accounts
 * are registrations rather than followers), and the hint is where that gets
 * said instead of being left for someone to misread.
 */
export function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
  change,
  hint,
  footer,
  children,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: 'primary' | 'violet' | 'cyan' | 'emerald' | 'amber';
  change?: Delta;
  hint?: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const accents = {
    primary: 'bg-primary/10 text-primary',
    violet: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  } as const;

  return (
    <div className="glass-card rounded-[2rem] p-5 border border-border flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </span>
        <span className={cn('p-2 rounded-xl shrink-0', accents[accent])}>{icon}</span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <p
          className="text-3xl font-black text-foreground leading-none"
          style={{ fontFamily: 'var(--font-outfit)' }}
        >
          {value}
        </p>
        {change ? <DeltaBadge change={change} /> : null}
      </div>

      {hint ? <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
      {children}
      {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
    </div>
  );
}

function DeltaBadge({ change }: { change: Delta }) {
  // A rise in plays is good; this component is only used for metrics where that
  // holds, so up is always green here.
  const tone =
    change.direction === 'up'
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
      : change.direction === 'down'
        ? 'text-rose-700 dark:text-rose-400 bg-rose-500/10'
        : 'text-muted-foreground bg-muted';

  const Icon =
    change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold mb-0.5',
        tone,
      )}
      title="Compared with the previous period of the same length"
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {formatDelta(change)}
    </span>
  );
}
