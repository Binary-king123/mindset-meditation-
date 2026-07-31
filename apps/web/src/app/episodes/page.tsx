/**
 * Every published episode, newest first.
 *
 * "Latest Episodes" on the homepage used to send "View all" to /playlists,
 * which answers a different question: a playlist is a series, an episode is a
 * session, and someone who just looked at three episodes and pressed "view all"
 * wants more episodes. There was nowhere for that to go — this is it.
 *
 * It also earns its keep for search: a single indexable page that links to every
 * episode gives a crawler one hop to the whole catalogue, rather than relying on
 * the sitemap alone.
 *
 * Public data only, so it uses the cookie-less client and renders as ISR —
 * reading cookies here would force dynamic rendering on every request.
 */
import type { Metadata } from 'next';
import { Headphones } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player-lazy';
import { PodcastCard } from '@/components/podcast/podcast-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createPublicClient } from '@/lib/supabase/public';
import { PODCAST_SELECT, type EpisodeSummary } from '@/lib/podcast';
import { JsonLd, pageMetadata, itemListLd, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'All Guided Meditation Episodes',
  description:
    'Every guided meditation session, newest first. Browse the full catalogue for sleep, stress relief, focus and mindfulness — free to stream on any device.',
  path: '/episodes',
  keywords: [
    'meditation episodes',
    'guided meditation sessions',
    'sleep meditation',
    'mindfulness episodes',
  ],
  index: true,
});

export const revalidate = 300;

export default async function EpisodesPage() {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from('tracks')
    .select(PODCAST_SELECT)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(200);

  const episodes = (data ?? []) as EpisodeSummary[];

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd
        data={[
          itemListLd(
            episodes.map((e) => ({ name: e.title, path: `/podcast/${e.slug}` })),
            'All episodes',
          ),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Episodes', path: '/episodes' },
          ]),
        ]}
      />
      <Navbar />

      <main className="flex-1 pt-28 pb-20 px-4 md:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
              The full catalogue
            </p>
            <h1 className="mt-3 text-3xl font-black text-foreground sm:text-4xl lg:text-5xl">
              All Episodes
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Every guided meditation session, newest first. Tap any card to open the episode and
              start listening.
            </p>
          </Reveal>

          {episodes.length > 0 ? (
            <RevealGroup
              stagger={0.05}
              className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
            >
              {episodes.map((episode) => (
                <RevealItem key={episode.id}>
                  {/* queue = the whole list, so pressing play on any card lets
                      the player continue through the rest of the catalogue. */}
                  <PodcastCard podcast={episode} queue={episodes} />
                </RevealItem>
              ))}
            </RevealGroup>
          ) : (
            <div className="mt-10 rounded-2xl border border-border bg-card/40 p-10 text-center">
              <Headphones className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-bold text-foreground">
                The first episodes are on their way
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Follow the show on your favourite app and the next release will land in your feed
                automatically.
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
      <AudioPlayer />
    </div>
  );
}
