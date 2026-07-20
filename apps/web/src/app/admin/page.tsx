import Link from 'next/link';
import { Heart, MessageCircle, Play, ListMusic, Mic2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatDuration } from '@/lib/podcast';

export const dynamic = 'force-dynamic';

interface EngagementRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  duration_seconds: number;
  play_count: number;
  favorite_count: number;
  comment_count: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Heart;
  label: string;
  value: number | string;
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

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { data: trackRows },
    { count: playlistCount },
    { count: savesTotal },
    { count: commentsTotal },
  ] = await Promise.all([
    supabase
      .from('tracks')
      .select('id, title, slug, status, duration_seconds, play_count, favorite_count, comment_count')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('playlists').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    // Counted from the source tables, not the denormalised columns, so this
    // still reads true if a counter trigger ever drifts.
    supabase.from('favorites').select('id', { count: 'exact', head: true }),
    supabase.from('comments').select('id', { count: 'exact', head: true }),
  ]);

  const tracks = (trackRows ?? []) as EngagementRow[];
  const published = tracks.filter((t) => t.status === 'published').length;
  const plays = tracks.reduce((sum, t) => sum + (t.play_count ?? 0), 0);

  const ranked = [...tracks].sort(
    (a, b) =>
      (b.favorite_count ?? 0) +
      (b.comment_count ?? 0) -
      ((a.favorite_count ?? 0) + (a.comment_count ?? 0)),
  );

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Engagement across every session. Saves and likes are the same action here — one heart both
        saves a session to a listener&apos;s library and counts as a like.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-10">
        <StatCard
          icon={Mic2}
          label="Episodes"
          value={tracks.length}
          hint={`${published} published`}
        />
        <StatCard icon={ListMusic} label="Playlists" value={playlistCount ?? 0} />
        <StatCard
          icon={Heart}
          label="Saves / likes"
          value={savesTotal ?? 0}
          hint="across all episodes"
        />
        <StatCard
          icon={MessageCircle}
          label="Comments"
          value={commentsTotal ?? 0}
          hint="incl. replies"
        />
        <StatCard icon={Play} label="Plays" value={plays} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-foreground">Engagement by episode</h2>
        <Link
          href="/admin/comments"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
        >
          Moderate comments
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {ranked.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <p className="text-foreground font-bold mb-1">No episodes yet</p>
          <p className="text-muted-foreground text-sm mb-6">
            Upload your first session to start seeing engagement.
          </p>
          <Link
            href="/admin/upload"
            className="press inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-full font-semibold glow-primary"
          >
            Upload a podcast
          </Link>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Episode</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Saves</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">
                    Comments
                  </th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Plays</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/podcast/${t.slug}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {t.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDuration(t.duration_seconds)} ·{' '}
                        <span className={t.status === 'published' ? 'text-primary' : ''}>
                          {t.status}
                        </span>
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Heart className="w-3.5 h-3.5 text-muted-foreground" />
                        {t.favorite_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                        {t.comment_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {t.play_count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
