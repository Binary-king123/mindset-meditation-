// The podcast's public identity, assembled from the three places that own it:
//
//   name / description  → lib/brand.ts (code — one rename touches one file)
//   platform links      → podcast.show.platform_links (admin, /admin/links)
//   cover artwork       → the newest public playlist's cover (admin, /admin/playlists)
//
// Artwork is deliberately not a fourth thing to upload: playlists already carry
// covers, so the newest one doubles as the show artwork and there is only ever
// one place to change it.
//
// React's cache() collapses the queries to one per request, so callers can just
// await getShow() wherever they need it instead of threading the value down.
import { cache } from 'react';
import { createPublicClient } from '@/lib/supabase/public';
import { BRAND } from '@/lib/brand';
import { parsePlatformLinks, type PlatformLinks } from '@/lib/platforms';

export interface Show {
  name: string;
  tagline: string;
  description: string;
  coverUrl: string | null;
  platformLinks: PlatformLinks;
}

export const getShow = cache(async (): Promise<Show> => {
  const supabase = createPublicClient();

  const [{ data: show }, { data: newestCover }] = await Promise.all([
    supabase.from('show').select('platform_links').maybeSingle(),
    supabase
      .from('playlists')
      .select('thumbnail_url')
      .eq('is_public', true)
      .is('deleted_at', null)
      .not('thumbnail_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    name: BRAND.name,
    tagline: BRAND.tagline,
    description: BRAND.description,
    coverUrl: newestCover?.thumbnail_url ?? null,
    platformLinks: parsePlatformLinks(show?.platform_links),
  };
});
