import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { AudioPlayerProvider } from '@/components/providers/audio-player-provider';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import { JsonLd, organizationLd, webSiteLd } from '@/lib/seo';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const APP_NAME = BRAND.name;
const APP_DESCRIPTION = BRAND.description;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://themindsetmeditation.app';

// Front-loads the primary keyword ("Guided Meditation") ahead of the brand,
// which is what actually gets matched in search results, and stays under the
// ~60 characters Google renders before truncating.
const DEFAULT_TITLE = 'Guided Meditation for Sleep, Stress & Focus';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${DEFAULT_TITLE} | ${APP_NAME}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    'guided meditation',
    'meditation app',
    'sleep meditation',
    'meditation for anxiety',
    'stress relief meditation',
    'mindfulness meditation',
    'breathwork',
    'meditation podcast',
    'free guided meditation',
    'meditation for focus',
    'body scan meditation',
    'morning meditation',
  ],
  authors: [{ name: APP_NAME, url: APP_URL }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: 'Health & Wellness',
  alternates: { canonical: APP_URL },
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${DEFAULT_TITLE} | ${APP_NAME}`,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${DEFAULT_TITLE} | ${APP_NAME}`,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9fe' },
    { media: '(prefers-color-scheme: dark)', color: '#08060f' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        {/* Site-wide identity graph; pages add their own page-level schema. */}
        <JsonLd data={[organizationLd(), webSiteLd()]} />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
          <AuthProvider>
            <AudioPlayerProvider>
              {children}
              <Toaster position="bottom-right" theme="dark" richColors closeButton />
            </AudioPlayerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
