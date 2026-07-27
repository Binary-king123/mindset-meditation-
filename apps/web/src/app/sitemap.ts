import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Homepage only.
 *
 * Every other route is deliberately noindex — the root layout de-indexes the
 * whole site and `/` opts back in (see app/layout.tsx). Listing a noindex URL
 * in a sitemap only spends crawl budget on a page Google is then told to drop.
 * As a side effect the sitemap no longer queries the database at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}
