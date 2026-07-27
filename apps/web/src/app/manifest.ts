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
    // Icons point at the generated apple-icon route; /icon-192.png never
    // existed and 404'd on every shortcut.
    shortcuts: [
      {
        name: 'Browse episodes',
        short_name: 'Episodes',
        description: 'Browse the latest podcast episodes',
        url: '/#episodes',
        icons: [{ src: '/apple-icon', sizes: '180x180' }],
      },
      {
        name: 'Your library',
        short_name: 'Saved',
        description: 'Your saved episodes',
        url: '/saved',
        icons: [{ src: '/apple-icon', sizes: '180x180' }],
      },
    ],
  };
}
