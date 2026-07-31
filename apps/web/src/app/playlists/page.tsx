import type { Metadata } from 'next';
import Link from 'next/link';
import { ListMusic, ArrowRight, Heart } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player-lazy';
import { PlaylistCard } from '@/components/playlist/playlist-card';
import {PodcastCard} from '@/components/podcast/podcast-card';

import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createClient } from '@/lib/supabase/server';
import {
  PLAYLIST_SELECT,
  PODCAST_SELECT,
  type PlaylistSummary,
  type EpisodeSummary,
} from '@/lib/podcast';
import { JsonLd, pageMetadata, itemListLd, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Guided Meditation Playlists & Series',
  description:
    'Browse guided meditation playlists for sleep, stress, focus and mindfulness. Follow a full series start to finish, or dip into a single session whenever you need it.',
  path: '/playlists',
  keywords: ['meditation playlist', 'meditation series', 'guided meditation course'],
});

export const dynamic = 'force-dynamic';

export default async function PlaylistsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab === 'saved' ? 'saved' : 'playlists';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch Playlists
  const { data: playlistsData } = await supabase
    .from('playlists')
    .select(PLAYLIST_SELECT)
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const playlists = (playlistsData ?? []) as PlaylistSummary[];
  // Real playlists only. This used to pad the list up to three with hardcoded
  // demo entries that all carried slug 'playlists', so every one of them linked
  // to /playlist/playlists — a 404 — and fed the same dead URL to the ItemList
  // structured data on this page.
  const playlistsToShow = playlists;

  // Fetch Saved sessions (Favorites)
  let savedTracks: EpisodeSummary[] = [];
  if (user) {
    const { data: favoritesData } = await supabase
      .from('favorites')
      .select(`created_at, track:tracks(${PODCAST_SELECT})`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    savedTracks = ((favoritesData ?? []) as Array<{ track: unknown }>)
      .map((r) => r.track)
      .filter(Boolean) as EpisodeSummary[];
  }

  return (
    <div className="min-h-screen flex flex-col stream-shell">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Playlists', path: '/playlists' },
          ]),
          ...(playlistsToShow.length
            ? [
                itemListLd(
                  // The `slug === 'playlists'` special case that used to be
                  // here existed only to stop demo playlists emitting a dead
                  // /playlist/playlists URL. Every row is real now.
                  playlistsToShow.map((p) => ({ name: p.title, path: `/playlist/${p.slug}` })),
                  'Guided meditation playlists',
                ),
              ]
            : []),
        ]}
      />
      <Navbar />
      <main className="flex-1 pt-28 px-4 md:px-8 max-w-7xl mx-auto w-full pb-32">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] stream-panel p-8 md:p-10 mb-10">
            <div
              className="absolute -top-20 -right-10 w-72 h-72 rounded-full blur-3xl opacity-40 float-slow pointer-events-none"
              style={{
                background:
                  activeTab === 'saved'
                    ? 'radial-gradient(circle, hsl(var(--aura-4)/0.55), transparent 70%)'
                    : 'radial-gradient(circle, hsl(var(--aura-2)/0.55), transparent 70%)',
              }}
              aria-hidden
            />
            <div className="relative flex items-center gap-4">
              <span className="w-14 h-14 rounded-2xl grid place-items-center bg-primary/15 text-primary shrink-0 breathe violet-glow">
                {activeTab === 'saved' ? <Heart className="w-6 h-6" fill="currentColor" /> : <ListMusic className="w-6 h-6" />}
              </span>
              <div>
                <h1
                  className="text-2xl sm:text-3xl md:text-4xl font-black text-foreground"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  {activeTab === 'saved' ? (
                    <>Your <span className="text-gradient">library</span></>
                  ) : (
                    <>Browse <span className="text-gradient">playlists</span></>
                  )}
                </h1>
                <p className="text-foreground/60 text-xs sm:text-sm mt-1 max-w-lg">
                  {activeTab === 'saved'
                    ? user
                      ? `${savedTracks.length} session${savedTracks.length === 1 ? '' : 's'} saved for whenever you need them.`
                      : 'Sessions you save live here.'
                    : playlists.length === 0
                      ? 'Series of sessions, grouped to follow start to finish.'
                      : `${playlists.length} series to follow start to finish, with episodes, likes, comments and queue playback.`}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Tab Toggle */}
        <div className="flex gap-2 border-b border-foreground/10 pb-4 mb-8">
          <Link
            href="/playlists?tab=playlists"
            className={`px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all border ${
              activeTab === 'playlists'
                ? 'bg-primary text-white border-primary shadow-[0_4px_12px_rgba(147,51,234,0.3)]'
                : 'text-foreground/60 hover:text-foreground border-foreground/10 hover:bg-foreground/5'
            }`}
          >
            Playlists
          </Link>
          <Link
            href="/playlists?tab=saved"
            className={`px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all border ${
              activeTab === 'saved'
                ? 'bg-primary text-white border-primary shadow-[0_4px_12px_rgba(147,51,234,0.3)]'
                : 'text-foreground/60 hover:text-foreground border-foreground/10 hover:bg-foreground/5'
            }`}
          >
            Saved Sessions {user ? `(${savedTracks.length})` : ''}
          </Link>
        </div>

        {activeTab === 'saved' ? (
          !user ? (
            <Reveal direction="scale">
              <div className="stream-card rounded-3xl p-16 text-center">
                <p className="text-foreground font-bold text-lg mb-2">Sign in to see your library</p>
                <p className="text-muted-foreground text-sm mb-7">
                  Save any session with the heart and it will be waiting here.
                </p>
                <Link
                  href="/auth/login"
                  className="shine press inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-full font-bold glow-primary"
                >
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </Reveal>
          ) : savedTracks.length === 0 ? (
            <Reveal direction="scale">
              <div className="stream-card rounded-3xl p-16 text-center">
                <p className="text-foreground font-bold text-lg mb-2">Nothing saved yet</p>
                <p className="text-muted-foreground text-sm mb-7">
                  Tap the heart on any session to keep it here.
                </p>
                <Link
                  href="/#episodes"
                  className="shine press inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-full font-bold glow-primary"
                >
                  Browse sessions
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </Reveal>
          ) : (
            <RevealGroup
              stagger={0.06}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
            >
              {savedTracks.map((p) => (
                <RevealItem key={p.id}>
                  <PodcastCard podcast={p} queue={savedTracks} />
                </RevealItem>
              ))}
            </RevealGroup>
          )
        ) : playlistsToShow.length === 0 ? (
          <Reveal direction="scale">
            <div className="stream-card rounded-3xl p-16 text-center">
              <p className="text-foreground font-bold text-lg mb-2">No playlists yet</p>
              <p className="text-muted-foreground text-sm mb-7">
                Playlists appear here once sessions have been published into them.
              </p>
              <Link
                href="/#episodes"
                className="shine press inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-full font-bold glow-primary"
              >
                Browse sessions
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <RevealGroup
            stagger={0.06}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
          >
            {playlistsToShow.map((p) => (
              <RevealItem key={p.id}>
                <PlaylistCard playlist={p} />
              </RevealItem>
            ))}
          </RevealGroup>
        )}
      </main>
      <Footer />
      <AudioPlayer />
    </div>
  );
}
