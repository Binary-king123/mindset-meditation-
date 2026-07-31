/**
 * The podcast RSS feed — what Apple Podcasts, Spotify and every other directory
 * actually subscribe to.
 *
 * RSS 2.0 plus the iTunes namespace, which is the de-facto podcast standard.
 * `<enclosure url>` points at /api/episode-audio/[slug] rather than a signed
 * storage URL, because a signed URL expires within the hour and a feed is read
 * for months — see that route for the reasoning.
 */
import { createPublicClient } from '@/lib/supabase/public';
import { SITE_URL } from '@/lib/seo';
import { BRAND } from '@/lib/brand';
import { getShow } from '@/lib/show';

export const revalidate = 3600;

type FeedRow = {
  title: string;
  slug: string;
  excerpt: string | null;
  short_description: string | null;
  description: string | null;
  duration_seconds: number;
  file_size_bytes: number | null;
  thumbnail_url: string | null;
  instructor_name: string | null;
  published_at: string | null;
  created_at: string;
  keywords: string[] | null;
};

/** XML has five reserved characters; an unescaped `&` in a title breaks the feed. */
function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** iTunes wants HH:MM:SS. */
function itunesDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export async function GET() {
  const supabase = createPublicClient();

  const [show, { data }] = await Promise.all([
    getShow(),
    supabase
      .from('tracks')
      .select(
        'title, slug, excerpt, short_description, description, duration_seconds, file_size_bytes, thumbnail_url, instructor_name, published_at, created_at, keywords',
      )
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(300),
  ]);

  const episodes = (data ?? []) as FeedRow[];
  const cover = show.coverUrl ?? `${SITE_URL}/hero-top.png`;
  const updated = episodes[0]?.published_at ?? episodes[0]?.created_at ?? new Date().toISOString();

  const items = episodes
    .map((e) => {
      const summary = e.excerpt || e.short_description || e.description || BRAND.description;
      const published = new Date(e.published_at ?? e.created_at).toUTCString();
      const audioUrl = `${SITE_URL}/api/episode-audio/${e.slug}`;

      return `    <item>
      <title>${xml(e.title)}</title>
      <link>${SITE_URL}/podcast/${xml(e.slug)}</link>
      <guid isPermaLink="true">${SITE_URL}/podcast/${xml(e.slug)}</guid>
      <pubDate>${published}</pubDate>
      <description>${xml(summary)}</description>
      <itunes:summary>${xml(summary)}</itunes:summary>
      <itunes:author>${xml(e.instructor_name || BRAND.name)}</itunes:author>
      <itunes:duration>${itunesDuration(e.duration_seconds)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>${
        e.thumbnail_url ? `\n      <itunes:image href="${xml(e.thumbnail_url)}" />` : ''
      }${e.keywords?.length ? `\n      <itunes:keywords>${xml(e.keywords.join(', '))}</itunes:keywords>` : ''}
      <enclosure url="${xml(audioUrl)}" type="audio/mpeg" length="${e.file_size_bytes ?? 0}" />
    </item>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(BRAND.name)}</title>
    <link>${SITE_URL}</link>
    <description>${xml(BRAND.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <itunes:author>${xml(BRAND.name)}</itunes:author>
    <itunes:summary>${xml(BRAND.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner>
      <itunes:name>${xml(BRAND.name)}</itunes:name>
      <itunes:email>${xml(BRAND.contactEmail)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${xml(cover)}" />
    <itunes:category text="Health &amp; Fitness">
      <itunes:category text="Mental Health" />
    </itunes:category>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
