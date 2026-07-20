import type { Metadata } from 'next';
import Link from 'next/link';
import { ListMusic, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { PlaylistCard } from '@/components/playlist/playlist-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createClient } from '@/lib/supabase/server';
import { PLAYLIST_SELECT, type PlaylistSummary } from '@/lib/podcast';
import { JsonLd, pageMetadata, itemListLd, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Guided Meditation Playlists & Series',
  description:
    'Browse guided meditation playlists for sleep, stress, focus and mindfulness. Follow a full series start to finish, or dip into a single session whenever you need it.',
  path: '/playlists',
  keywords: ['meditation playlist', 'meditation series', 'guided meditation course'],
});

export const dynamic = 'force-dynamic';

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('playlists')
    .select(PLAYLIST_SELECT)
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const playlists = (data ?? []) as PlaylistSummary[];

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Playlists', path: '/playlists' },
          ]),
          ...(playlists.length
            ? [
                itemListLd(
                  playlists.map((p) => ({ name: p.title, path: `/playlist/${p.slug}` })),
                  'Guided meditation playlists',
                ),
              ]
            : []),
        ]}
      />
      <Navbar />
      <main className="flex-1 pt-28 px-4 md:px-8 max-w-7xl mx-auto w-full pb-32">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl glass-card p-8 md:p-10 mb-10">
            <div
              className="absolute -top-20 -right-10 w-72 h-72 rounded-full blur-3xl opacity-40 float-slow pointer-events-none"
              style={{ background: 'radial-gradient(circle, hsl(var(--aura-2)/0.55), transparent 70%)' }}
              aria-hidden
            />
            <div className="relative flex items-center gap-4">
              <span className="w-14 h-14 rounded-2xl grid place-items-center bg-primary/15 text-primary shrink-0 breathe">
                <ListMusic className="w-6 h-6" />
              </span>
              <div>
                <h1
                  className="text-3xl md:text-4xl font-black text-foreground"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  Browse <span className="text-gradient">playlists</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {playlists.length === 0
                    ? 'Series of sessions, grouped to follow start to finish.'
                    : `${playlists.length} series to follow start to finish.`}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {playlists.length === 0 ? (
          <Reveal direction="scale">
            <div className="glass-card rounded-3xl p-16 text-center">
              <p className="text-foreground font-bold text-lg mb-2">No playlists yet</p>
              <p className="text-muted-foreground text-sm mb-7">
                Playlists appear here once sessions have been published into them.
              </p>
              <Link
                href="/#sessions"
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
            {playlists.map((p) => (
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
