import Link from 'next/link';
import { Eye, Users, Percent, CheckCircle2, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface Analytics {
  today: number;
  yesterday: number;
  last_7: number;
  last_15: number;
  last_30: number;
  total: number;
  unique_listeners: number;
  signed_in: number;
  retention: number;
  completion: number;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p
        className="text-3xl font-black text-foreground"
        style={{ fontFamily: 'var(--font-outfit)' }}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Period({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-xl px-4 py-3 text-center">
      <p
        className="text-2xl font-black text-foreground"
        style={{ fontFamily: 'var(--font-outfit)' }}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const [{ data: statsRaw }, { data: series }, { data: trackRows }] = await Promise.all([
    supabase.rpc('get_play_analytics', { p_days: 3650 }),
    supabase.rpc('get_play_timeseries', { p_days: 14 }),
    supabase
      .from('tracks')
      .select('id, title, slug, duration_seconds, play_count, favorite_count, comment_count')
      .is('deleted_at', null),
  ]);

  const stats = (statsRaw ?? {}) as Partial<Analytics>;
  const days = (series ?? []) as Array<{ day: string; views: number; listeners: number }>;
  const tracks = (trackRows ?? []) as Array<{
    id: string;
    title: string;
    slug: string;
    duration_seconds: number;
    play_count: number;
    favorite_count: number;
    comment_count: number;
  }>;

  // Per-episode view counts, computed here so the RPC stays a single query.
  const { data: perTrack } = await supabase
    .from('play_events')
    .select('track_id, listened_seconds, duration_seconds');

  const byTrack = new Map<string, { views: number; listened: number; total: number }>();
  for (const e of (perTrack ?? []) as Array<{
    track_id: string;
    listened_seconds: number;
    duration_seconds: number;
  }>) {
    const entry = byTrack.get(e.track_id) ?? { views: 0, listened: 0, total: 0 };
    entry.views += 1;
    entry.listened += e.listened_seconds ?? 0;
    entry.total += e.duration_seconds ?? 0;
    byTrack.set(e.track_id, entry);
  }

  const maxViews = Math.max(1, ...days.map((d) => Number(d.views)));

  const ranked = [...tracks].sort(
    (a, b) => (byTrack.get(b.id)?.views ?? 0) - (byTrack.get(a.id)?.views ?? 0),
  );

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-1">Analytics</h1>
      <p className="text-sm text-muted-foreground mb-8">
        A view is counted when a listener presses play. Retention is how much of an episode they
        actually got through.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat
          icon={Eye}
          label="Total views"
          value={stats.total ?? 0}
          hint={`${stats.signed_in ?? 0} from signed-in listeners`}
        />
        <Stat
          icon={Users}
          label="Unique listeners"
          value={stats.unique_listeners ?? 0}
          hint="by account or device"
        />
        <Stat
          icon={Percent}
          label="Retention"
          value={`${stats.retention ?? 0}%`}
          hint="avg. share of episode heard"
        />
        <Stat
          icon={CheckCircle2}
          label="Completion"
          value={`${stats.completion ?? 0}%`}
          hint="listened 90% or more"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <Period label="Today" value={stats.today ?? 0} />
        <Period label="Yesterday" value={stats.yesterday ?? 0} />
        <Period label="Last 7 days" value={stats.last_7 ?? 0} />
        <Period label="Last 15 days" value={stats.last_15 ?? 0} />
        <Period label="Last 30 days" value={stats.last_30 ?? 0} />
      </div>

      {/* 14-day trend. A plain bar chart keeps this dependency-free. */}
      <div className="glass-card rounded-2xl p-5 mb-10">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Views · last 14 days</h2>
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plays recorded yet.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-40">
            {days.map((d) => {
              const views = Number(d.views);
              const pct = Math.round((views / maxViews) * 100);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-[hsl(var(--aura-1))] to-[hsl(var(--aura-2))] transition-all duration-500 min-h-[2px]"
                      style={{ height: `${Math.max(pct, views > 0 ? 6 : 1)}%` }}
                      title={`${d.day}: ${views} views, ${d.listeners} listeners`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(d.day).getUTCDate()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="text-lg font-black text-foreground mb-4">By episode</h2>
      {ranked.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
          No episodes yet.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Episode</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Views</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                    Retention
                  </th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Saves</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                    Comments
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t) => {
                  const e = byTrack.get(t.id);
                  const retention =
                    e && e.total > 0 ? Math.round((e.listened / e.total) * 100) : 0;
                  return (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/podcast/${t.slug}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {e?.views ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          <span className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <span
                              className="block h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(retention, 100)}%` }}
                            />
                          </span>
                          <span className="text-foreground">{retention}%</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {t.favorite_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {t.comment_count ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
