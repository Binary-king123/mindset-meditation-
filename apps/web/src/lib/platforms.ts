/**
 * Every place the podcast can be listened to, in one list.
 *
 * This array is the single source of truth for: the homepage buttons, the
 * episode-page buttons, the footer, the admin form fields and the `sameAs`
 * array in the PodcastSeries JSON-LD. Adding a sixth service is one entry here
 * and nothing else — the links themselves live in the database as a JSONB map
 * keyed by `id` (podcast.show.platform_links, podcast.tracks.platform_links),
 * so no migration is needed either.
 *
 * `path` is an SVG path drawn on a 24×24 viewBox. lucide-react carries no brand
 * marks, and inline SVG is markup rather than a fetch, so the site's CSP is
 * unaffected.
 */
export interface Platform {
  id: string;
  label: string;
  /** Brand colour, used for the icon tint and hover ring. */
  color: string;
  path: string;
}



export const HARDCODED_PLATFORMS = [
  {
    id: 'spotify',
    label: 'Spotify',
    color: '#1DB954',
    url: 'https://open.spotify.com/show/6Gn5FiuA8zZhLHjRbrgEY2?si=H-LF8H6kTPCT9QAV5WzFgw&utm_source=whatsapp',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.713 1.115a.623.623 0 0 1 .206.857Zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.492c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 0 1 .255 1.072Zm.105-2.835c-3.223-1.914-8.54-2.09-11.617-1.156a.935.935 0 1 1-.542-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 1 1-.956 1.608Z',
  },
  {
    id: 'apple',
    label: 'Apple Podcasts',
    color: '#9933CC',
    url: 'https://podcasts.apple.com/us/podcast/the-mindset-meditation-podcast/id1567219233',
    path: 'M12 2a10 10 0 0 0-4.02 19.16c-.06-.7-.11-1.78.02-2.55.12-.7.79-4.45.79-4.45s-.2-.4-.2-1c0-.94.55-1.64 1.23-1.64.58 0 .86.44.86.96 0 .58-.37 1.45-.56 2.26-.16.68.34 1.23 1.01 1.23 1.21 0 2.14-1.28 2.14-3.12 0-1.63-1.17-2.77-2.85-2.77-1.94 0-3.08 1.45-3.08 2.96 0 .59.23 1.22.51 1.56a.2.2 0 0 1 .05.2c-.05.21-.16.68-.19.78-.03.12-.1.15-.23.09-.85-.4-1.38-1.64-1.38-2.64 0-2.15 1.56-4.12 4.5-4.12 2.36 0 4.2 1.68 4.2 3.93 0 2.35-1.48 4.24-3.53 4.24-.69 0-1.34-.36-1.56-.78l-.42 1.62c-.15.59-.57 1.33-.85 1.78A10 10 0 1 0 12 2Z',
  },
  {
    id: 'amazon',
    label: 'Amazon Music',
    color: '#25D1DA',
    url: 'https://music.amazon.in/podcasts/083232a0-15f0-4028-8ba7-79b9b626cf07/the-mindset-meditation-podcast',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.86 5.02c.53 0 .96.43.96.96v8.04a.96.96 0 0 1-1.92 0V7.98c0-.53.43-.96.96-.96Zm-3.2 2.4c.53 0 .96.43.96.96v3.24a.96.96 0 1 1-1.92 0v-3.24c0-.53.43-.96.96-.96Zm6.4-1.2c.53 0 .96.43.96.96v5.64a.96.96 0 1 1-1.92 0V9.18c0-.53.43-.96.96-.96Zm3.2 1.8c.53 0 .96.43.96.96v2.04a.96.96 0 1 1-1.92 0v-2.04c0-.53.43-.96.96-.96Z',
  },
  {
    id: 'youtube',
    label: 'YouTube Music',
    color: '#FF0000',
    url: 'https://music.youtube.com/playlist?list=PL1A9PtiQ9-0aghMylLfVr7VJb_6oiVyLb&si=LVvvJWpuIp3EyOw6',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18.2a8.2 8.2 0 1 1 0-16.4 8.2 8.2 0 0 1 0 16.4Zm-1.6-12.3 6 4.1-6 4.1V7.9Z',
  },
];

export const PLATFORMS = [
  {
    id: 'spotify',
    label: 'Spotify',
    color: '#1DB954',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.713 1.115a.623.623 0 0 1 .206.857Zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.492c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 0 1 .255 1.072Zm.105-2.835c-3.223-1.914-8.54-2.09-11.617-1.156a.935.935 0 1 1-.542-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 1 1-.956 1.608Z',
  },
  {
    id: 'apple',
    label: 'Apple Podcasts',
    color: '#9933CC',
    path: 'M12 2a10 10 0 0 0-4.02 19.16c-.06-.7-.11-1.78.02-2.55.12-.7.79-4.45.79-4.45s-.2-.4-.2-1c0-.94.55-1.64 1.23-1.64.58 0 .86.44.86.96 0 .58-.37 1.45-.56 2.26-.16.68.34 1.23 1.01 1.23 1.21 0 2.14-1.28 2.14-3.12 0-1.63-1.17-2.77-2.85-2.77-1.94 0-3.08 1.45-3.08 2.96 0 .59.23 1.22.51 1.56a.2.2 0 0 1 .05.2c-.05.21-.16.68-.19.78-.03.12-.1.15-.23.09-.85-.4-1.38-1.64-1.38-2.64 0-2.15 1.56-4.12 4.5-4.12 2.36 0 4.2 1.68 4.2 3.93 0 2.35-1.48 4.24-3.53 4.24-.69 0-1.34-.36-1.56-.78l-.42 1.62c-.15.59-.57 1.33-.85 1.78A10 10 0 1 0 12 2Z',
  },
  {
    id: 'amazon',
    label: 'Amazon Music',
    color: '#25D1DA',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.86 5.02c.53 0 .96.43.96.96v8.04a.96.96 0 0 1-1.92 0V7.98c0-.53.43-.96.96-.96Zm-3.2 2.4c.53 0 .96.43.96.96v3.24a.96.96 0 1 1-1.92 0v-3.24c0-.53.43-.96.96-.96Zm6.4-1.2c.53 0 .96.43.96.96v5.64a.96.96 0 1 1-1.92 0V9.18c0-.53.43-.96.96-.96Zm3.2 1.8c.53 0 .96.43.96.96v2.04a.96.96 0 1 1-1.92 0v-2.04c0-.53.43-.96.96-.96Z',
  },
  {
    id: 'youtube',
    label: 'YouTube Music',
    color: '#FF0000',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18.2a8.2 8.2 0 1 1 0-16.4 8.2 8.2 0 0 1 0 16.4Zm-1.6-12.3 6 4.1-6 4.1V7.9Z',
  },
  {
    id: 'pocketcasts',
    label: 'Pocket Casts',
    color: '#F43E37',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.4a7.6 7.6 0 0 1 7.6 7.6h-2.2A5.4 5.4 0 0 0 12 6.6V4.4Zm0 3.5a4.1 4.1 0 0 1 4.1 4.1h-1.9A2.2 2.2 0 0 0 12 9.8V7.9Zm-7.6 4.1a7.6 7.6 0 0 0 7.6 7.6v-2.2A5.4 5.4 0 0 1 6.6 12H4.4Zm3.5 0a4.1 4.1 0 0 0 4.1 4.1v-1.9A2.2 2.2 0 0 1 9.8 12H7.9Z',
  },
  {
    id: 'jiosaavn',
    label: 'JioSaavn',
    color: '#2BC5B4',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.4 5.1v6.6a2.9 2.9 0 1 1-1.8-2.7V9.2l-4.6 1v5.1a2.9 2.9 0 1 1-1.8-2.7V8.5l8.2-1.8Z',
  },
  {
    id: 'gaana',
    label: 'Gaana',
    color: '#E72C30',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3.2a6.8 6.8 0 0 1 6.8 6.8h-2.3A4.5 4.5 0 1 0 12 16.5v2.3A6.8 6.8 0 0 1 12 5.2Zm0 4.3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z',
  },
  {
    id: 'castbox',
    label: 'Castbox',
    color: '#F55B23',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.9 5.6h1.8v3.1h-1.8V7.6Zm-3 1.9h1.8v5.1H8.1V9.5Zm6 0h1.8v5.1h-1.8V9.5Zm-3 1.9h1.8v6.3h-1.8v-6.3Z',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    color: '#FC7E0F',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.6a7.4 7.4 0 0 1 4.4 13.3l-.9-1.5A5.7 5.7 0 1 0 8.5 16.4l-.9 1.5A7.4 7.4 0 0 1 12 4.6Zm0 3.1a4.3 4.3 0 0 1 2.6 7.7l-.9-1.6a2.6 2.6 0 1 0-3.4 0l-.9 1.6A4.3 4.3 0 0 1 12 7.7Zm0 3.2 1.5 8-1.5-1.4-1.5 1.4 1.5-8Z',
  },
] as const satisfies readonly Platform[];

export type PlatformId = (typeof PLATFORMS)[number]['id'];

/** `{ spotify: "https://…", apple: "https://…" }` — as stored in JSONB. */
export type PlatformLinks = Partial<Record<PlatformId, string>>;

export interface ResolvedPlatform extends Platform {
  url: string;
}

/**
 * Merges the show-wide links with an episode's overrides and drops anything
 * blank, so callers can render the result directly without null checks.
 * An episode link wins over the show link; an empty episode field means
 * "inherit", not "remove".
 */
export function resolvePlatformLinks(
  show: PlatformLinks | null | undefined,
  episode?: PlatformLinks | null,
): ResolvedPlatform[] {
  return PLATFORMS.flatMap((platform) => {
    const url = (episode?.[platform.id] || show?.[platform.id] || '').trim();
    return url ? [{ ...platform, url }] : [];
  });
}

/**
 * Narrows an untyped JSONB value to PlatformLinks, keeping only known platform
 * ids with non-empty string values. Guards against whatever a hand-edited row
 * might contain.
 */
export function parsePlatformLinks(value: unknown): PlatformLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: PlatformLinks = {};
  for (const { id } of PLATFORMS) {
    const url = raw[id];
    if (typeof url === 'string' && url.trim()) out[id] = url.trim();
  }
  return out;
}

/**
 * Only http(s) links are stored. Without this an admin could paste a
 * `javascript:` URL and every visitor's platform button would run it.
 */
export function sanitizePlatformUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
