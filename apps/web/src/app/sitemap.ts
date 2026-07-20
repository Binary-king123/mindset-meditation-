import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://themindsetmeditation.app';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Only routes that actually exist in the app router.
  const staticPages: MetadataRoute.Sitemap = [
    { url: APP_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    {
      url: `${APP_URL}/playlists`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${APP_URL}/auth/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${APP_URL}/auth/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // App tables live in the isolated `podcast` schema, not `public`.
      { db: { schema: 'podcast' } },
    );

    const [{ data: tracks }, { data: playlists }] = await Promise.all([
      supabase
        .from('tracks')
        .select('slug, updated_at')
        .eq('status', 'published')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('playlists')
        .select('slug, updated_at')
        .eq('is_public', true)
        .is('deleted_at', null)
        .not('slug', 'is', null),
    ]);

    const trackPages: MetadataRoute.Sitemap = (tracks ?? []).map((track) => ({
      url: `${APP_URL}/podcast/${track.slug}`,
      lastModified: new Date(track.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    const playlistPages: MetadataRoute.Sitemap = (playlists ?? []).map((p) => ({
      url: `${APP_URL}/playlist/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly',
      priority: 0.85,
    }));

    return [...staticPages, ...playlistPages, ...trackPages];
  } catch {
    return staticPages;
  }
}
