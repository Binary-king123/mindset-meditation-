import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * Every indexable URL: the homepage, the episode and playlist indexes, each
 * public playlist and each published episode.
 *
 * Cover art rides along in the `images` field of each entry, which Next renders
 * as `<image:image>` — so this doubles as the image sitemap and there is no
 * second file to keep in step.
 *
 * Uses the cookie-less client on purpose (lib/supabase/public.ts): reading
 * cookies here would opt the route into dynamic rendering and defeat the
 * revalidate below.
 */
export const revalidate = 3600;

type EpisodeRow = {
  slug: string;
  updated_at: string;
  published_at: string | null;
  thumbnail_url: string | null;
};

type PlaylistRow = {
  slug: string | null;
  updated_at: string;
  thumbnail_url: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  const [{ data: episodeRows }, { data: playlistRows }] = await Promise.all([
    supabase
      .from('tracks')
      .select('slug, updated_at, published_at, thumbnail_url')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(5000),
    supabase
      .from('playlists')
      .select('slug, updated_at, thumbnail_url')
      .eq('is_public', true)
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .limit(1000),
  ]);

  const episodes = (episodeRows ?? []) as EpisodeRow[];
  const playlists = (playlistRows ?? []) as PlaylistRow[];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    {
      url: `${SITE_URL}/playlists`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/episodes`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  return [
    ...staticRoutes,
    ...playlists.map((p) => ({
      url: `${SITE_URL}/playlist/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      ...(p.thumbnail_url ? { images: [p.thumbnail_url] } : {}),
    })),
    ...episodes.map((e) => ({
      url: `${SITE_URL}/podcast/${e.slug}`,
      lastModified: new Date(e.published_at ?? e.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      ...(e.thumbnail_url ? { images: [e.thumbnail_url] } : {}),
    })),
  ];
}
