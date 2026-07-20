import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://themindsetmeditation.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/auth/callback', '/api/', '/admin', '/saved'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
