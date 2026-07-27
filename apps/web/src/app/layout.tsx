import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { AudioPlayerProvider } from '@/components/providers/audio-player-provider';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
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

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} | Guided Meditation & Mindfulness Podcast`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: APP_NAME, url: APP_URL }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: 'Health & Wellness',
  formatDetection: { telephone: false, address: false, email: false },
  // De-indexed by DEFAULT. Search should only ever surface the homepage, so
  // `/` opts itself back in (see app/page.tsx) and every other route — current
  // or future — inherits noindex without anyone having to remember to add it.
  // `follow: true` keeps link equity flowing through to the homepage.
  //
  // Note this is deliberately NOT paired with a robots.txt Disallow: a
  // disallowed page can't be crawled, so Google would never read the noindex
  // and stale URLs would linger in the index. See app/robots.ts.
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
  },
  twitter: { card: 'summary_large_image' },
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
        {/* Organization / WebSite / PodcastSeries schema is emitted by the
            homepage rather than here: it needs the show record from the
            database, and reading that in the root layout would make every page
            in the app dynamic. */}
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange={false}>
          <AuthProvider>
            <AudioPlayerProvider>
              {children}
              <Toaster position="bottom-right" theme="system" richColors closeButton />
            </AudioPlayerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
