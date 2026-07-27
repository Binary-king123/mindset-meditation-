// Central SEO helpers: canonical URLs, page metadata and schema.org JSON-LD.
// Keeping these in one place stops titles/descriptions drifting apart across
// pages, which is what search engines penalise.
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import type { ResolvedPlatform } from '@/lib/platforms';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://themindsetmeditation.app'
).replace(/\/$/, '');

function canonical(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Titles read best at 50–60 chars; descriptions at 140–160. */
function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  type = 'website',
  publishedTime,
  keywords,
  absoluteTitle,
  noIndex,
  index,
  descriptionMax,
}: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: 'website' | 'article';
  publishedTime?: string;
  keywords?: string[];
  /** Skip the "| Brand" template — needed on `/`, which shares the root
   *  segment with the layout and so never receives the template anyway. */
  absoluteTitle?: boolean;
  noIndex?: boolean;
  /** Opt this page back INTO the index. The root layout de-indexes the whole
   *  site by default (see app/layout.tsx), so only `/` sets this. */
  index?: boolean;
  /** Raises the description cap for pages with deliberately longer copy. */
  descriptionMax?: number;
}): Metadata {
  const url = canonical(path);
  const desc = clampDescription(description, descriptionMax);
  const images = image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    ...(index
      ? {
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
        }
      : {}),
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
    description: desc,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: BRAND.name,
      type,
      locale: 'en_US',
      ...(images ? { images } : {}),
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD builders
// ---------------------------------------------------------------------------

export function organizationLd(platforms: ResolvedPlatform[] = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: BRAND.name,
    alternateName: BRAND.shortName,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description: BRAND.description,
    slogan: BRAND.tagline,
    // Tells Google the Spotify / Apple listings are this same publisher.
    ...(platforms.length ? { sameAs: platforms.map((p) => p.url) } : {}),
  };
}

/**
 * The show itself. This is the schema that makes Google understand the site is
 * a podcast rather than a generic website, and `sameAs` is what links this page
 * to the Spotify / Apple Podcasts / Amazon / YouTube Music listings of the same
 * show — without it each platform looks like an unrelated entity.
 */
export function podcastSeriesLd(show: {
  name: string;
  description: string;
  coverUrl?: string | null;
  platforms: ResolvedPlatform[];
  episodes: Array<{ title: string; slug: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    '@id': `${SITE_URL}/#podcast`,
    name: show.name,
    description: clampDescription(show.description, 300),
    url: SITE_URL,
    ...(show.coverUrl ? { image: show.coverUrl } : {}),
    ...(show.platforms.length ? { sameAs: show.platforms.map((p) => p.url) } : {}),
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en-US',
    ...(show.episodes.length
      ? {
          numberOfEpisodes: show.episodes.length,
          hasPart: show.episodes.map((e) => ({
            '@type': 'PodcastEpisode',
            name: e.title,
            url: canonical(`/podcast/${e.slug}`),
          })),
        }
      : {}),
  };
}

export function webSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BRAND.name,
    description: BRAND.description,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en-US',
    // One of the signals Google reads when deciding whether to show a search
    // box (and sitelinks) for the site. It cannot force either — that stays
    // Google's call — but it makes the site eligible.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * The off-site places to listen, marked up as site navigation. This is what
 * tells search engines the Spotify / Apple / Amazon / YouTube links form the
 * show's primary navigation — the groundwork that makes sitelink-style results
 * eligible (Google still decides the final SERP layout).
 */
export function siteNavigationLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/#listen-nav`,
    name: 'Listen to the podcast',
    itemListElement: items.map((item, i) => ({
      '@type': 'SiteNavigationElement',
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function breadcrumbLd(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: canonical(crumb.path),
    })),
  };
}

export function episodeLd(episode: {
  title: string;
  slug: string;
  description?: string | null;
  durationSeconds: number;
  thumbnailUrl?: string | null;
  createdAt?: string | null;
  hostName?: string | null;
  /** Where this specific episode can be heard off-site. */
  platforms?: ResolvedPlatform[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    url: canonical(`/podcast/${episode.slug}`),
    ...(episode.platforms?.length ? { sameAs: episode.platforms.map((p) => p.url) } : {}),
    name: episode.title,
    description: clampDescription(episode.description ?? BRAND.description),
    timeRequired: isoDuration(episode.durationSeconds),
    duration: isoDuration(episode.durationSeconds),
    ...(episode.thumbnailUrl ? { image: episode.thumbnailUrl } : {}),
    ...(episode.createdAt ? { datePublished: episode.createdAt } : {}),
    partOfSeries: { '@id': `${SITE_URL}/#podcast` },
    associatedMedia: {
      '@type': 'AudioObject',
      contentUrl: canonical(`/podcast/${episode.slug}`),
      duration: isoDuration(episode.durationSeconds),
      encodingFormat: 'audio/mpeg',
    },
    ...(episode.hostName
      ? { author: { '@type': 'Person', name: episode.hostName } }
      : { author: { '@id': `${SITE_URL}/#organization` } }),
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function playlistLd(playlist: {
  title: string;
  slug: string;
  description?: string | null;
  episodes: Array<{ title: string; slug: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    url: canonical(`/playlist/${playlist.slug}`),
    name: playlist.title,
    description: clampDescription(playlist.description ?? BRAND.description),
    publisher: { '@id': `${SITE_URL}/#organization` },
    numberOfEpisodes: playlist.episodes.length,
    hasPart: playlist.episodes.map((e) => ({
      '@type': 'PodcastEpisode',
      name: e.title,
      url: canonical(`/podcast/${e.slug}`),
    })),
  };
}


export function itemListLd(items: Array<{ name: string; path: string }>, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: canonical(item.path),
    })),
  };
}

/** Seconds → ISO-8601 duration, e.g. 930 → "PT15M30S". */
function isoDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`;
}

/**
 * SECURITY: JSON.stringify does not escape `<`, so a title containing
 * `</script>` would close this tag early and execute whatever follows — a
 * stored XSS reachable through any episode or playlist name. Escaping the
 * angle brackets and ampersand as \uXXXX keeps the JSON valid (parsers decode
 * the escapes) while making a break-out impossible.
 */
function safeJsonLd(data: object | object[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Renders a JSON-LD <script>. Next dedupes these fine in the app router. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inlined
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
