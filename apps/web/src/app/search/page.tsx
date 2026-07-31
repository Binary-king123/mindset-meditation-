import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX, Search as SearchIcon } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player-lazy';
import { EpisodeRow, type EpisodeItem } from '@/components/podcast/episode-row';
import { SearchBox } from '@/components/search/search-box';
import { createPublicClient } from '@/lib/supabase/public';
import { pageMetadata, JsonLd, breadcrumbLd } from '@/lib/seo';
import { BRAND } from '@/lib/brand';

// Results depend entirely on ?q, so there is nothing to cache per-path.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Search meditations',
    description: `Search every guided meditation on ${BRAND.name} by title, theme or series.`,
    path: '/search',
    // A search results page is thin, duplicate-prone content — exactly what
    // Google asks you not to index. The SearchAction in the WebSite schema
    // still points here; that is about the sitelinks box, not indexing.
    noIndex: true,
  });
}

type SearchRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  published_at: string | null;
  created_at: string;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  let results: EpisodeItem[] = [];
  let failed = false;

  if (query) {
    const supabase = createPublicClient();
    // Ranked by ts_rank in SQL — see podcast.search_tracks in fullschema.sql.
    const { data, error } = await supabase.rpc('search_tracks', {
      p_query: query,
      p_limit: 30,
    });
    failed = Boolean(error);
    results = ((data ?? []) as SearchRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      thumbnail_url: r.thumbnail_url,
      short_description: r.excerpt ?? r.short_description,
      duration_seconds: r.duration_seconds,
      created_at: r.published_at ?? r.created_at,
    }));
  }

  return (
    <div className="stream-shell flex min-h-screen flex-col">
      <JsonLd
        data={[breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Search', path: '/search' }])]}
      />
      <Navbar />

      <main className="flex-1 px-4 pb-28 pt-24 sm:px-6 sm:pb-32 sm:pt-32 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-3xl font-black text-foreground sm:text-4xl">
            Search <span className="text-primary">meditations</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Search by title, theme or series — try “sleep”, “breathing” or “morning”.
          </p>

          <div className="mt-6">
            <SearchBox initialQuery={query} autoFocus />
          </div>

          {query && (
            <p className="mt-6 text-sm text-muted-foreground">
              {failed
                ? 'Search is unavailable right now.'
                : `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query}”`}
            </p>
          )}

          {query && !failed && results.length === 0 && (
            <div className="mt-10 rounded-2xl border border-border bg-card/40 p-10 text-center">
              <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-bold text-foreground">Nothing matched that</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Try a single word, or a different theme. Every episode is also grouped into a
                series you can browse.
              </p>
              <Link
                href="/playlists"
                className="press mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white"
              >
                Browse all series
              </Link>
            </div>
          )}

          {!query && (
            <div className="mt-10 rounded-2xl border border-border bg-card/40 p-10 text-center">
              <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Type something above to search the catalogue.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="mt-6 space-y-2">
              {results.map((episode) => (
                <li key={episode.id}>
                  <EpisodeRow podcast={episode} queue={results} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <Footer />
      <AudioPlayer />
    </div>
  );
}
