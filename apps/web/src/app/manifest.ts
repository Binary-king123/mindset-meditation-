import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: `${BRAND.tagline}. ${BRAND.description}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#08060f',
    theme_color: '#8b5cf6',
    orientation: 'portrait',
    categories: ['health', 'lifestyle', 'meditation'],
    // Points at assets that actually exist: the scalable SVG in /public and the
    // generated apple-icon. The previous icon-192/512.png were 404s.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [],
    shortcuts: [
      {
        name: 'Browse sessions',
        short_name: 'Sessions',
        description: 'Browse guided meditation sessions',
        url: '/#sessions',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Your library',
        short_name: 'Saved',
        description: 'Your saved meditation sessions',
        url: '/saved',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
