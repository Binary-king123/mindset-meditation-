import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronLeft, ListMusic } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { PodcastCard, type CardPodcast } from '@/components/podcast/podcast-card';
import { PlaylistPlayButton } from '@/components/playlist/playlist-play-button';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createClient } from '@/lib/supabase/server';
import { PODCAST_SELECT, formatPlaylistMeta } from '@/lib/podcast';
import { BRAND } from '@/lib/brand';
import { JsonLd, pageMetadata, playlistLd, breadcrumbLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';

async function getPlaylist(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('playlists')
    .select('id, title, slug, description, thumbnail_url, track_count, total_duration_seconds')
    .eq('slug', slug)
    .eq('is_public', true)
    .is('deleted_at', null)
    .maybeSingle();
  return data as {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    thumbnail_url: string | null;
    track_count: number;
    total_duration_seconds: number;
  } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);
  if (!playlist) return { title: 'Playlist not found' };

  const count = playlist.track_count;
  return pageMetadata({
    title: `${playlist.title} · Guided Meditation Series`,
    description:
      playlist.description ||
      `A ${count}-part guided meditation series from ${BRAND.name}. ${BRAND.tagline}.`,
    path: `/playlist/${slug}`,
    image: playlist.thumbnail_url,
  });
}

export default async function PlaylistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);
  if (!playlist) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('playlist_tracks')
    .select(`position, track:tracks(${PODCAST_SELECT})`)
    .eq('playlist_id', playlist.id)
    .order('position', { ascending: true });

  // Drafts and soft-deleted episodes are filtered out by the tracks RLS policy
  // for visitors, which surfaces here as a null embed.
  const tracks = ((rows ?? []) as Array<{ track: unknown }>)
    .map((r) => r.track)
    .filter(Boolean) as CardPodcast[];

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd
        data={[
          playlistLd({
            title: playlist.title,
            slug: playlist.slug,
            description: playlist.description,
            episodes: tracks.map((t) => ({ title: t.title, slug: t.slug })),
          }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Playlists', path: '/playlists' },
            { name: playlist.title, path: `/playlist/${playlist.slug}` },
          ]),
        ]}
      />
      <Navbar />

      <main className="flex-1 pb-40">
        <header className="relative overflow-hidden pt-28 pb-12 px-4 md:px-8">
          <div className="absolute inset-0 -z-10" aria-hidden>
            {playlist.thumbnail_url ? (
              <Image
                src={playlist.thumbnail_url}
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
                    'linear-gradient(140deg, hsl(var(--aura-1)/0.55), hsl(var(--aura-4)/0.3) 60%, transparent 100%)',
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
          </div>

          <div className="max-w-5xl mx-auto w-full">
            <Reveal>
              <Link
                href="/playlists"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
              >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                All playlists
              </Link>
            </Reveal>

            <div className="flex flex-col md:flex-row gap-8 md:gap-10">
              <Reveal direction="scale" className="shrink-0 mx-auto md:mx-0">
                <div className="relative w-56 md:w-64 aspect-square rounded-3xl overflow-hidden glow-primary-lg">
                  {playlist.thumbnail_url ? (
                    <Image
                      src={playlist.thumbnail_url}
                      alt={playlist.title}
                      fill
                      priority
                      className="object-cover"
                      sizes="256px"
                    />
                  ) : (
                    <div
                      className="w-full h-full grid place-items-center"
                      style={{
                        background:
                          'linear-gradient(140deg, hsl(var(--aura-1)) 0%, hsl(var(--aura-4)) 55%, hsl(var(--aura-2)) 100%)',
                      }}
                    >
                      <ListMusic className="w-20 h-20 text-white/90" />
                    </div>
                  )}
                </div>
              </Reveal>

              <div className="flex-1 text-center md:text-left">
                <Reveal delay={0.05}>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full mb-4 bg-primary/15 text-primary">
                    <ListMusic className="w-3.5 h-3.5" />
                    Playlist
                  </span>
                </Reveal>

                <Reveal delay={0.1}>
                  <h1
                    className="text-3xl md:text-5xl font-black text-foreground mb-3 leading-tight text-balance"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                  >
                    {playlist.title}
                  </h1>
                </Reveal>

                <Reveal delay={0.14}>
                  <p className="text-muted-foreground mb-5">
                    {formatPlaylistMeta(tracks.length, playlist.total_duration_seconds)}
                  </p>
                </Reveal>

                {playlist.description && (
                  <Reveal delay={0.18}>
                    <p className="text-foreground/80 leading-relaxed mb-6 max-w-xl">
                      {playlist.description}
                    </p>
                  </Reveal>
                )}

                {tracks.length > 0 && (
                  <Reveal delay={0.22}>
                    <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
                      <PlaylistPlayButton tracks={tracks} />
                    </div>
                  </Reveal>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="px-4 md:px-8 max-w-5xl mx-auto w-full">
          {tracks.length === 0 ? (
            <Reveal direction="scale">
              <div className="glass-card rounded-3xl p-16 text-center">
                <p className="text-foreground font-bold text-lg mb-2">This playlist is empty</p>
                <p className="text-muted-foreground text-sm">
                  Sessions added to it will show up here.
                </p>
              </div>
            </Reveal>
          ) : (
            <section>
              <Reveal>
                <h2
                  className="text-2xl font-black text-foreground mb-6"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  In this playlist
                </h2>
              </Reveal>
              <RevealGroup
                stagger={0.06}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
              >
                {tracks.map((t) => (
                  <RevealItem key={t.id}>
                    {/* queue = the whole playlist, so skip-next follows its order */}
                    <PodcastCard podcast={t} queue={tracks} />
                  </RevealItem>
                ))}
              </RevealGroup>
            </section>
          )}
        </div>
      </main>

      <Footer />
      <AudioPlayer />
    </div>
  );
}
