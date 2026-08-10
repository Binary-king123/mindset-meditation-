// The admin analytics dashboard.
//
// Everything shown here is aggregated in Postgres by the four functions added
// in migration 035. The page used to pull up to 10,000 play_events rows and
// reduce them in JS, which silently produced wrong per-episode retention once a
// quarter exceeded that cap; the work now happens where the rows are.
//
// A note on honesty, because this page has a history of it. It previously
// displayed "Ads Played" and "Est. Ad Revenue" derived from arithmetic on the
// play count, and labelled the registered-account total "Followers" — this
// product has no follow relationship and no ads schema. Every figure below maps
// to something the database actually records, and where a metric means less
// than its name suggests, the card says so rather than leaving it to be
// misread.
import Link from 'next/link';
import {
  BarChart3,
  Bookmark,
  Clock,
  Eye,
  Globe,
  MessageCircle,
  Percent,
  UserPlus,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/admin/analytics/stat-card';
import { TrendChart } from '@/components/admin/analytics/trend-chart';
import { Breakdown } from '@/components/admin/analytics/breakdown';
import { RangeTabs } from '@/components/admin/analytics/range-tabs';
import { formatDuration } from '@/lib/podcast';
import {
  compact,
  delta,
  formatFullDay,
  formatListenTime,
  num,
  parseRangeDays,
  share,
  type DashboardStats,
  type ReachData,
  type TimeseriesRow,
  type TrackStatsRow,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

// The daily series is capped regardless of the reporting window. "All time" is
// 3,650 buckets, which is both slow to compute and unreadable at chart width;
// the cards still report the full window, and the chart says what it covers.
const MAX_CHART_DAYS = 90;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = parseRangeDays(daysParam);
  const chartDays = Math.min(days, MAX_CHART_DAYS);

  const supabase = await createClient();

  // The session client, not the admin client: these functions are SECURITY
  // DEFINER but gate on podcast.is_admin(), which resolves auth.uid(). Called
  // with the service role there is no JWT, so they would raise 'Forbidden'.
  const [stats, seriesRes, tracksRes, reachRes] = await Promise.all([
    supabase.rpc('get_admin_dashboard', { p_days: days }),
    supabase.rpc('get_admin_timeseries', { p_days: chartDays }),
    supabase.rpc('get_admin_track_stats', { p_days: days }),
    supabase.rpc('get_admin_reach', { p_days: days }),
  ]);

  const { data: statsRaw } = stats;
  const { data: seriesRaw } = seriesRes;
  const { data: tracksRaw } = tracksRes;
  const { data: reachRaw } = reachRes;

  // Every figure on this page comes from those four functions. If they are not
  // in the database yet, each call returns null and the page would render a
  // full set of zeros — indistinguishable from a show nobody has listened to.
  // Say which it is instead.
  const rpcError = [stats.error, seriesRes.error, tracksRes.error, reachRes.error].find(Boolean);

  const s = (statsRaw ?? {}) as Partial<DashboardStats>;
  const series = (seriesRaw ?? []) as TimeseriesRow[];
  const tracks = (tracksRaw ?? []) as TrackStatsRow[];
  const reach = (reachRaw ?? {}) as ReachData;

  const plays = num(s.plays);
  const listeners = num(s.listeners);
  const listenedSeconds = num(s.listened_seconds);
  const signedInPlays = num(s.signed_in_plays);
  const anonPlays = num(s.anon_plays);
  const repeatListeners = num(s.listeners_repeat);
  const newListeners = num(s.listeners_new);

  const rangeLabel = days >= 3650 ? 'all time' : `the last ${days} days`;

  return (
    <div className="space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-black text-foreground mb-2"
            style={{ fontFamily: 'var(--font-outfit)' }}
          >
            Overall <span className="text-gradient">Analytics</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Audience, engagement and reach across {rangeLabel}. Changes compare against the
            preceding period of the same length.
          </p>
        </div>
        <RangeTabs active={days} />
      </header>

      {rpcError ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm"
        >
          <p className="font-bold text-foreground mb-1">Analytics functions are not installed.</p>
          <p className="text-muted-foreground leading-relaxed">
            Every number below will read zero until{' '}
            <code className="font-mono text-xs">migrations/035_analytics_reach_and_dashboard.sql</code>{' '}
            is run against this database. Postgres said:{' '}
            <span className="text-foreground">{rpcError.message}</span>
          </p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Headline figures                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="Headline metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Plays"
          value={compact(plays)}
          icon={<Eye className="w-4 h-4" />}
          accent="primary"
          change={delta(plays, num(s.plays_prev))}
          hint={`${num(s.plays_today)} today · ${num(s.plays_yesterday)} yesterday · ${compact(num(s.plays_total))} all time`}
        />

        <StatCard
          label="Unique listeners"
          value={compact(listeners)}
          icon={<Users className="w-4 h-4" />}
          accent="violet"
          change={delta(listeners, num(s.listeners_prev))}
          hint={`${compact(newListeners)} new to the show · ${compact(repeatListeners)} came back for more than one session`}
        />

        <StatCard
          label="Time listened"
          value={formatListenTime(listenedSeconds)}
          icon={<Clock className="w-4 h-4" />}
          accent="cyan"
          change={delta(listenedSeconds, num(s.listened_seconds_prev))}
          hint={`${formatListenTime(num(s.avg_listen_seconds))} average per play · ${formatListenTime(num(s.listened_seconds_total))} all time`}
        />

        <StatCard
          label="Saved sessions"
          value={compact(num(s.saves))}
          icon={<Bookmark className="w-4 h-4" />}
          accent="emerald"
          change={delta(num(s.saves), num(s.saves_prev))}
          hint={`${compact(num(s.saves_total))} saves all time`}
        />

        <StatCard
          label="Comments"
          value={compact(num(s.comments))}
          icon={<MessageCircle className="w-4 h-4" />}
          accent="amber"
          change={delta(num(s.comments), num(s.comments_prev))}
          hint={`${compact(num(s.comments_total))} comments all time`}
        />

        <StatCard
          label="Registered listeners"
          value={compact(num(s.accounts_total))}
          icon={<UserPlus className="w-4 h-4" />}
          accent="violet"
          change={delta(num(s.accounts), num(s.accounts_prev))}
          hint={`${num(s.accounts)} signed up in this period. These are accounts, not followers — the app has no follow feature.`}
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Trend                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="glass-card rounded-[2.5rem] p-6 border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">Daily activity</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {days > MAX_CHART_DAYS
              ? `Last ${MAX_CHART_DAYS} days — the cards above cover ${rangeLabel}`
              : `Last ${chartDays} days`}
          </p>
        </div>
        <TrendChart rows={series} />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Audience composition and listening depth                          */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="Audience" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card rounded-[2rem] p-5 border border-border">
          <h3 className="text-sm font-bold text-foreground mb-4">Signed in vs anonymous</h3>
          <SplitBar
            a={{ label: 'Signed in', value: signedInPlays, className: 'bg-primary' }}
            b={{ label: 'Anonymous', value: anonPlays, className: 'bg-purple-400' }}
          />
          <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
            Counted per play, not per person. Anonymous listeners are capped at a 60-second
            preview, so they can never contribute much listening time.
          </p>
        </div>

        <div className="glass-card rounded-[2rem] p-5 border border-border">
          <h3 className="text-sm font-bold text-foreground mb-4">New vs returning</h3>
          <SplitBar
            a={{ label: 'New', value: newListeners, className: 'bg-cyan-500' }}
            b={{
              label: 'Returning',
              value: Math.max(listeners - newListeners, 0),
              className: 'bg-emerald-500',
            }}
          />
          <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
            &ldquo;New&rdquo; means first ever play, not first play this period. Clearing browser
            storage makes an anonymous listener look new again.
          </p>
        </div>

        <div className="glass-card rounded-[2rem] p-5 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground">Listening depth</h3>
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Percent className="w-4 h-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center gap-4">
            <RetentionRing pct={num(s.retention)} />
            <div className="min-w-0">
              <p
                className="text-2xl font-black text-foreground leading-none"
                style={{ fontFamily: 'var(--font-outfit)' }}
              >
                {num(s.retention)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                average of each episode heard
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                {num(s.completion)}% of plays reached 90%
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
            The 60-second preview limit for signed-out listeners caps this figure. On a 20-minute
            session that is a 5% ceiling, so read it alongside the signed-in share.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Reach                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="Reach">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold text-foreground">Reach</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Breakdown
            title="Traffic source"
            entries={reach.referrer}
            emptyLabel="No plays recorded in this period."
          />
          <Breakdown title="Device" entries={reach.device} />
          <Breakdown title="Operating system" entries={reach.os} />
          <Breakdown title="Browser" entries={reach.browser} />
          <Breakdown title="Language" entries={reach.language} />
          <Breakdown
            title="Country"
            entries={s.has_geo ? reach.country : undefined}
            emptyLabel="Country needs a CDN in front of the app to supply a geo header. This deployment has none, so location is not recorded."
          />
        </div>

        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          Reach data is recorded from the request that starts each play, and only from the point
          this was added — earlier plays show as &ldquo;Unknown&rdquo; because the information was
          never captured and cannot be reconstructed. Device, browser and OS come from the
          user-agent; traffic source is the referring hostname only, never the full URL.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Per-episode                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="Episode performance" className="space-y-4">
        <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
          Episode performance
        </h2>

        {tracks.length === 0 ? (
          <div className="glass-card rounded-[2rem] p-12 text-center text-muted-foreground">
            No episodes uploaded yet.
          </div>
        ) : (
          <div className="glass-card rounded-[2rem] overflow-hidden border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th scope="col" className="px-5 py-3">Session</th>
                    <th scope="col" className="px-5 py-3 text-right">Plays</th>
                    <th scope="col" className="px-5 py-3 text-right">Listeners</th>
                    <th scope="col" className="px-5 py-3 text-right">Time listened</th>
                    <th scope="col" className="px-5 py-3">Retention</th>
                    <th scope="col" className="px-5 py-3 text-right">Saves</th>
                    <th scope="col" className="px-5 py-3 text-right">Comments</th>
                    <th scope="col" className="px-5 py-3 text-right">Last played</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tracks.map((t) => {
                    const retention = num(t.retention);
                    return (
                      <tr key={t.track_id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <Link
                            href={`/podcast/${t.slug}`}
                            className="font-bold text-foreground hover:text-primary transition-colors"
                          >
                            {t.title}
                          </Link>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {formatDuration(t.duration_seconds)}
                            {t.status !== 'published' ? ` · ${t.status}` : ''}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">
                          {num(t.plays)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          {num(t.listeners)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          {formatListenTime(num(t.listened_seconds))}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-20 h-2 rounded-full bg-muted overflow-hidden shrink-0">
                              <span
                                className="block h-full bg-gradient-to-r from-primary to-purple-500 rounded-full"
                                style={{ width: `${Math.min(retention, 100)}%` }}
                              />
                            </span>
                            <span className="font-semibold text-foreground tabular-nums">
                              {retention}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          {num(t.saves)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          {num(t.comments)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatFullDay(t.last_played_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Saves and comments are counted within {rangeLabel}, so they will read lower than the
          all-time totals shown on an episode page. {num(s.tracks_published)} published,{' '}
          {num(s.tracks_draft)} draft, {formatDuration(num(s.catalog_seconds))} of audio in the
          catalogue.
        </p>
      </section>
    </div>
  );
}

/** Two complementary values as one bar, with a legend that names both. */
function SplitBar({
  a,
  b,
}: {
  a: { label: string; value: number; className: string };
  b: { label: string; value: number; className: string };
}) {
  const total = a.value + b.value;
  const aPct = share(a.value, total);

  if (total === 0) {
    return <p className="text-xs text-muted-foreground py-4">No plays recorded in this period.</p>;
  }

  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="presentation">
        <span className={a.className} style={{ width: `${aPct}%` }} />
        <span className={b.className} style={{ width: `${100 - aPct}%` }} />
      </div>
      <dl className="flex justify-between gap-4 mt-3">
        {[a, b].map((seg) => (
          <div key={seg.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`w-2 h-2 rounded-full shrink-0 ${seg.className}`} aria-hidden="true" />
              {seg.label}
            </dt>
            <dd
              className="text-lg font-black text-foreground leading-tight tabular-nums"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              {compact(seg.value)}
              <span className="text-[11px] font-semibold text-muted-foreground ml-1.5">
                {share(seg.value, total).toFixed(0)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Circular gauge for average retention. r=16 → circumference 100.53. */
function RetentionRing({ pct }: { pct: number }) {
  const circumference = 100.53;
  const clamped = Math.max(0, Math.min(pct, 100));
  return (
    <svg width="72" height="72" viewBox="0 0 40 40" className="-rotate-90 shrink-0" role="presentation" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="3.5" />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="transparent"
        stroke="hsl(var(--primary))"
        strokeWidth="3.5"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (circumference * clamped) / 100}
        strokeLinecap="round"
      />
    </svg>
  );
}
