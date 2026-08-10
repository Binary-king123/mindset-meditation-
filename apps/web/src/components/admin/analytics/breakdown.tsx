import { num, share, type ReachEntry } from '@/lib/analytics';

/**
 * A ranked breakdown for one reach dimension.
 *
 * Bars are scaled against the total, not against the largest entry, so a
 * dominant first row looks dominant. Scaling to the leader makes every
 * dimension's top row a full bar and hides how concentrated the traffic is.
 */
export function Breakdown({
  title,
  entries,
  emptyLabel = 'Nothing recorded yet.',
}: {
  title: string;
  entries: ReachEntry[] | undefined;
  emptyLabel?: string;
}) {
  const rows = entries ?? [];
  const total = rows.reduce((sum, e) => sum + num(e.plays), 0);

  return (
    <div className="glass-card rounded-[2rem] p-5 border border-border">
      <h3 className="text-sm font-bold text-foreground mb-4">{title}</h3>

      {rows.length === 0 || total === 0 ? (
        <p className="text-xs text-muted-foreground py-4">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((e) => {
            const pct = share(num(e.plays), total);
            return (
              <li key={e.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate" title={e.key}>
                    {e.key}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {num(e.plays)} · {pct.toFixed(0)}%
                  </span>
                </div>
                <span className="block h-1.5 rounded-full bg-muted overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary to-purple-500"
                    style={{ width: `${Math.max(pct, 1.5)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
