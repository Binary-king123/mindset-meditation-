import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronLeft, Heart, ListMusic } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { EpisodeRow, type EpisodeItem } from '@/components/podcast/episode-row';
import { PlaylistPlayButton } from '@/components/playlist/playlist-play-button';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createClient } from '@/lib/supabase/server';
import { PODCAST_SELECT, formatPlaylistMeta, type EpisodeSummary } from '@/lib/podcast';
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
    .filter(Boolean) as EpisodeSummary[];

  return (
    <div className="min-h-screen flex flex-col stream-shell">
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

            <div className="flex flex-col md:flex-row gap-8 md:gap-10 stream-panel rounded-[2rem] p-6 md:p-8">
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
                      <ListMusic className="w-20 h-20 text-foreground/90" />
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
                    className="text-2xl sm:text-3xl md:text-5xl font-black text-foreground mb-3 leading-tight text-balance"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                  >
                    {playlist.title}
                  </h1>
                </Reveal>

                <Reveal delay={0.14}>
                  <p className="text-foreground/60 mb-5">
                    {formatPlaylistMeta(tracks.length, playlist.total_duration_seconds)}
                  </p>
                </Reveal>

                {playlist.description && (
                  <Reveal delay={0.18}>
                    <p className="text-foreground/72 leading-relaxed mb-6 max-w-xl">
                      {playlist.description}
                    </p>
                  </Reveal>
                )}

                {tracks.length > 0 && (
                  <Reveal delay={0.22}>
                    <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
                      <PlaylistPlayButton tracks={tracks} />
                      <Link
                        href="/playlists?tab=saved"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-foreground/10 bg-foreground/5 text-foreground font-semibold"
                      >
                        <Heart className="w-4 h-4" />
                        Saved
                      </Link>
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
              <div className="stream-card rounded-3xl p-16 text-center">
                <p className="text-foreground font-bold text-lg mb-2">This playlist is empty</p>
                <p className="text-muted-foreground text-sm">
                  Sessions added to it will show up here.
                </p>
              </div>
            </Reveal>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-4">
                <Reveal>
                  <h2
                    className="text-2xl font-black text-foreground"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                  >
                    Episodes
                  </h2>
                </Reveal>
                <Reveal>
                  <span className="text-sm text-muted-foreground">
                    {tracks.length} episode{tracks.length === 1 ? '' : 's'}
                  </span>
                </Reveal>
              </div>
              {/* Spotify-style row list — the whole playlist is the queue, so
                  skip-next follows its order. */}
              <RevealGroup stagger={0.04} className="space-y-2.5">
                {(tracks as unknown as EpisodeItem[]).map((t) => (
                  <RevealItem key={t.id}>
                    <EpisodeRow podcast={t} queue={tracks as unknown as EpisodeItem[]} />
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
