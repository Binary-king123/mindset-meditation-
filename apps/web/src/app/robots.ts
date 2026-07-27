import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Only the homepage is meant to appear in search results, but that is enforced
 * with `noindex` meta tags (see app/layout.tsx), NOT with Disallow rules here.
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
        disallow: ['/api/', '/admin', '/auth/callback', '/auth/reset-password', '/saved'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
