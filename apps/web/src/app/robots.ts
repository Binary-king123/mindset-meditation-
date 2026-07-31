import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * The homepage, every published episode and every public playlist are indexable
 * (they pass `index: true` to `pageMetadata`); everything else is held back
 * with a `noindex` meta tag from app/layout.tsx, NOT with Disallow rules here.
 *
 * The two are not interchangeable: a disallowed URL is never fetched, so Google
 * never sees the noindex on it, and any such URL already in the index stays
 * there. Internal pages are therefore left crawlable on purpose — that is what
 * lets the noindex be read and obeyed.
 *
 * What is blocked below is only what should never be fetched at all: the signed
 * media endpoints, the admin area and private user pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /api/episode-audio is deliberately NOT disallowed: it is the RSS
        // enclosure target, and blocking it would stop podcast directories
        // validating the feed.
        disallow: ['/api/stream', '/api/admin', '/admin', '/auth/callback', '/auth/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
