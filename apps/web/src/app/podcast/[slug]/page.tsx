import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronLeft, Clock, MessageCircle, Heart } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { PlayButton } from '@/components/podcast/play-button';
import { LikeButton } from '@/components/podcast/like-button';
import { ShareButton } from '@/components/podcast/share-button';
import { Comments, type CommentItem } from '@/components/podcast/comments';
import { commentAuthorName, type CommentRow } from '@/lib/comments';
import {PodcastCard} from '@/components/podcast/podcast-card';

import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { PlatformButtons } from '@/components/podcast/platform-buttons';
import { createClient } from '@/lib/supabase/server';
import { PODCAST_SELECT, formatDuration, type EpisodeSummary } from '@/lib/podcast';
import { BRAND } from '@/lib/brand';
import { getShow } from '@/lib/show';
import { parsePlatformLinks, resolvePlatformLinks } from '@/lib/platforms';
import { JsonLd, pageMetadata, episodeLd, breadcrumbLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('tracks')
    .select('title, short_description, description, thumbnail_url, created_at, duration_seconds')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return { title: 'Session not found' };

  const minutes = Math.max(1, Math.round((data.duration_seconds ?? 0) / 60));
  return pageMetadata({
    // "· Guided Meditation" gives every episode page a keyword-bearing title
    // instead of a bare episode name nobody searches for.
    title: `${data.title} · ${minutes}-Min Guided Meditation`,
    description:
      data.short_description ||
      data.description ||
      `A ${minutes}-minute guided meditation from ${BRAND.name}. ${BRAND.tagline}.`,
    path: `/podcast/${slug}`,
    image: data.thumbnail_url,
    type: 'article',
    publishedTime: data.created_at ?? undefined,
  });
}

/**
 * Other episodes from the same playlist. Replaces the old same-category lookup:
 * with categories gone, the series an episode belongs to is both the only
 * grouping and the stronger signal — people who liked part 3 want part 4.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped podcast schema client
async function relatedFromPlaylist(supabase: any, trackId: string) {
  const { data: membership } = await supabase
    .from('playlist_tracks')
    .select('playlist_id')
    .eq('track_id', trackId)
    .maybeSingle();
  if (!membership?.playlist_id) return { data: [] };

  const { data: siblings } = await supabase
    .from('playlist_tracks')
    .select(`position, track:tracks(${PODCAST_SELECT})`)
    .eq('playlist_id', membership.playlist_id)
    .neq('track_id', trackId)
    .order('position', { ascending: true })
    .limit(4);

  return {
    data: ((siblings ?? []) as Array<{ track: unknown }>)
      .map((row) => row.track)
      .filter(Boolean)
      // Drafts are filtered here rather than in the query: the join makes a
      // nested .eq() awkward, and a playlist holds at most a handful of rows.
      .filter((t) => (t as { status?: string }).status === 'published'),
  };
}

export default async function PodcastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: podcast } = await supabase
    .from('tracks')
    .select(PODCAST_SELECT)
    .eq('slug', slug)
    .maybeSingle();
  if (!podcast) notFound();

  // biome-ignore lint/suspicious/noExplicitAny: untyped podcast schema row
  const p = podcast as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: commentRows }, savedRes, { data: relatedRows }, { data: viewerRole }] =
    await Promise.all([
      supabase
        .from('comments')
        .select(
          'id, body, created_at, user_id, parent_id, author:profiles(full_name, username, email)',
        )
        .eq('track_id', p.id)
        .order('created_at', { ascending: false })
        .limit(200),
      user
        ? supabase
            .from('favorites')
            .select('id')
            .eq('track_id', p.id)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      relatedFromPlaylist(supabase, p.id),
      user
        ? supabase.rpc('get_user_role', { p_user_id: user.id })
        : Promise.resolve({ data: null }),
    ]);

  const viewerIsAdmin = viewerRole === 'admin' || viewerRole === 'super_admin';

  // Which comment authors are staff — drives the "Host" badge.
  // Reads profiles.role directly; the roles/user_roles join tables were
  // collapsed into that column in migration 021.
  const authorIds = [
    ...new Set(((commentRows ?? []) as Array<{ user_id: string }>).map((c) => c.user_id)),
  ];
  const { data: staffRows } = authorIds.length
    ? await supabase.from('profiles').select('id, role').in('id', authorIds)
    : { data: [] };

  const staffIds = new Set(
    ((staffRows ?? []) as Array<{ id: string; role?: string | null }>)
      .filter((r) => r.role === 'admin' || r.role === 'super_admin')
      .map((r) => r.id),
  );

  const comments: CommentItem[] = ((commentRows ?? []) as unknown as CommentRow[]).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    parent_id: c.parent_id ?? null,
    author: commentAuthorName(c.author),
    mine: !!user && c.user_id === user.id,
    isAdmin: staffIds.has(c.user_id),
  }));

  const related = (relatedRows ?? []) as unknown as EpisodeSummary[];

  // This episode's own links win; anything left blank falls back to the
  // show-wide link, so most episodes need no per-episode setup at all.
  const platforms = resolvePlatformLinks(
    (await getShow()).platformLinks,
    parsePlatformLinks(p.platform_links),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd
        data={[
          episodeLd({
            title: p.title,
            slug: p.slug,
            description: p.short_description || p.description,
            durationSeconds: p.duration_seconds,
            thumbnailUrl: p.thumbnail_url,
            createdAt: p.created_at,
            hostName: p.instructor_name,
            platforms,
          }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Episodes', path: '/#episodes' },
            { name: p.title, path: `/podcast/${p.slug}` },
          ]),
        ]}
      />
      <Navbar />

      <main className="flex-1 pb-40">
        {/* Cinematic header — artwork bled out behind the metadata */}
        <header className="relative overflow-hidden pt-28 pb-12 px-4 md:px-8">
          <div className="absolute inset-0 -z-10" aria-hidden>
            {p.thumbnail_url ? (
              <Image
                src={p.thumbnail_url}
                alt=""
                fill
                priority
                className="object-cover scale-110 blur-2xl opacity-40"
                sizes="100vw"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background:
                    'linear-gradient(140deg, hsl(var(--aura-1)/0.55), hsl(var(--aura-2)/0.3) 60%, transparent 80%)',
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
          </div>

          <div className="max-w-5xl mx-auto w-full">
            <Reveal>
              <Link
                href="/#episodes"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
              >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                All episodes
              </Link>
            </Reveal>

            <div className="flex flex-col md:flex-row gap-8 md:gap-10">
              <Reveal direction="scale" className="shrink-0 mx-auto md:mx-0">
                <div className="relative w-56 md:w-64 aspect-square rounded-3xl overflow-hidden glow-primary-lg">
                  {p.thumbnail_url ? (
                    <Image
                      src={p.thumbnail_url}
                      alt={p.title}
                      fill
                      priority
                      className="object-cover"
                      sizes="256px"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-7xl"
                      style={{
                        background:
                          'linear-gradient(140deg, hsl(var(--aura-1)) 0%, hsl(var(--aura-2)) 60%, hsl(var(--aura-4)) 100%)',
                      }}
                    >
                      <span className="w-1/3 aspect-square rounded-full border-2 border-foreground/50 grid place-items-center">
                        <span className="w-1/3 aspect-square rounded-full bg-foreground/90" />
                      </span>
                    </div>
                  )}
                </div>
              </Reveal>

              <div className="flex-1 text-center md:text-left">
                <Reveal delay={0.1}>
                  <h1
                    className="text-2xl sm:text-3xl md:text-5xl font-black text-foreground mb-3 leading-tight text-balance"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                  >
                    {p.title}
                  </h1>
                </Reveal>

                {p.instructor_name && (
                  <Reveal delay={0.14}>
                    <p className="text-muted-foreground mb-5">
                      with <span className="text-foreground font-semibold">{p.instructor_name}</span>
                    </p>
                  </Reveal>
                )}

                <Reveal delay={0.18}>
                  <div className="flex items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground mb-7">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {formatDuration(p.duration_seconds)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Heart className="w-4 h-4" />
                      {p.favorite_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      {p.comment_count ?? 0}
                    </span>
                  </div>
                </Reveal>

                <Reveal delay={0.22}>
                  <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
                    <PlayButton podcast={p} />
                    <LikeButton
                      trackId={p.id}
                      initialSaved={!!savedRes.data}
                      initialCount={p.favorite_count ?? 0}
                    />
                    <ShareButton title={p.title} path={`/podcast/${p.slug}`} />
                  </div>
                </Reveal>

                {platforms.length > 0 && (
                  <Reveal delay={0.26}>
                    <div className="mt-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                        Also listen on
                      </p>
                      <PlatformButtons
                        platforms={platforms}
                        variant="compact"
                        className="justify-center md:justify-start"
                      />
                    </div>
                  </Reveal>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="px-4 md:px-8 max-w-5xl mx-auto w-full">
          {p.description && (
            <Reveal>
              <section className="glass-card rounded-3xl p-7 md:p-8 mb-14">
                <h2 className="font-bold text-foreground mb-3 text-lg">About this session</h2>
                <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {p.description}
                </p>
              </section>
            </Reveal>
          )}

          {related.length > 0 && (
            <section className="mb-16">
              <Reveal>
                <h2
                  className="text-2xl font-black text-foreground mb-6"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  More like this
                </h2>
              </Reveal>
              <RevealGroup
                stagger={0.07}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5"
              >
                {related.map((r) => (
                  <RevealItem key={r.id}>
                    <PodcastCard podcast={r} queue={related} />
                  </RevealItem>
                ))}
              </RevealGroup>
            </section>
          )}

          <section>
            <Reveal>
              <h2
                className="text-2xl font-black text-foreground mb-6"
                style={{ fontFamily: 'var(--font-outfit)' }}
              >
                Reflections
              </h2>
            </Reveal>
            <Comments
              trackId={p.id}
              initial={comments}
              canComment={!!user}
              isAdmin={viewerIsAdmin}
            />
          </section>
        </div>
      </main>

      <Footer />
      <AudioPlayer />
    </div>
  );
}
