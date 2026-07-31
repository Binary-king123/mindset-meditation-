'use client';

import { BRAND } from '@/lib/brand';
import { slugify } from '@/lib/podcast';
import { SITE_URL } from '@/lib/seo';
import { buildExcerpt, buildKeywords, buildMetaDescription } from '@/lib/seo/generate';
import { cn } from '@/lib/utils';
import { RotateCcw, Search, Sparkles } from 'lucide-react';
/**
 * Live preview of the SEO metadata an upload will produce, with overrides.
 *
 * The generators in lib/seo/generate.ts are pure and import nothing
 * server-only, so the exact values that will be written to the database can be
 * computed here as the admin types — no round trip, and no chance of the
 * preview drifting from what actually gets saved.
 *
 * Everything defaults to generated. Typing in a field switches that one field
 * to the typed value; clearing it hands the field back to the generator.
 */
import { useMemo } from 'react';

export interface SeoOverrides {
  metaDescription: string;
  keywords: string;
}

const INPUT =
  'w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function SeoFields({
  title,
  playlistTitle,
  description,
  durationSeconds,
  overrides,
  onChange,
}: {
  title: string;
  playlistTitle?: string | null;
  description?: string;
  /** 0 until an audio file has been read. */
  durationSeconds: number;
  overrides: SeoOverrides;
  onChange: (next: SeoOverrides) => void;
}) {
  const generated = useMemo(() => {
    const facts = {
      title: title || 'Untitled episode',
      playlistTitle,
      durationSeconds: durationSeconds || 600,
      description,
    };
    return {
      metaDescription: buildMetaDescription(facts),
      excerpt: buildExcerpt(facts),
      keywords: buildKeywords(facts),
      slug: slugify(title || 'untitled-episode'),
    };
  }, [title, playlistTitle, description, durationSeconds]);

  const metaDescription = overrides.metaDescription || generated.metaDescription;
  const keywords = overrides.keywords
    ? overrides.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : generated.keywords;

  // Google renders roughly 155 characters; past that the tail is cut.
  const metaLength = metaDescription.length;
  const metaTooLong = metaLength > 160;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <h3 className="text-sm font-bold text-foreground">Search engine preview</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated from the title, playlist and audio length. Type in a field to override it;
            clear it to go back to generated.
          </p>
        </div>
      </div>

      {/* What the result actually looks like on Google. */}
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Search className="h-3 w-3" />
          <span className="truncate">
            {SITE_URL.replace(/^https?:\/\//, '')}/podcast/{generated.slug || 'episode'}
          </span>
        </div>
        <p className="mt-1 truncate text-[15px] font-medium text-[#1a0dab] dark:text-[#8ab4f8]">
          {title || 'Untitled episode'} | {BRAND.name}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {metaDescription}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
          Meta description
          <span
            className={cn(
              'font-mono text-[11px]',
              metaTooLong ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {metaLength}/160
          </span>
        </span>
        <textarea
          rows={2}
          className={INPUT}
          value={overrides.metaDescription}
          placeholder={generated.metaDescription}
          onChange={(e) => onChange({ ...overrides, metaDescription: e.target.value })}
        />
        {metaTooLong && (
          <span className="mt-1 block text-[11px] text-destructive">
            Google cuts this off around 160 characters.
          </span>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-foreground">
          Keywords <span className="font-normal text-muted-foreground">(comma separated)</span>
        </span>
        <textarea
          rows={2}
          className={INPUT}
          value={overrides.keywords}
          placeholder={generated.keywords.join(', ')}
          onChange={(e) => onChange({ ...overrides, keywords: e.target.value })}
        />
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {keywords.slice(0, 12).map((k) => (
            <span
              key={k}
              className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {k}
            </span>
          ))}
        </span>
      </label>

      <div>
        <span className="mb-1 block text-xs font-semibold text-foreground">Excerpt</span>
        <p className="text-xs leading-relaxed text-muted-foreground">{generated.excerpt}</p>
      </div>

      {(overrides.metaDescription || overrides.keywords) && (
        <button
          type="button"
          onClick={() => onChange({ metaDescription: '', keywords: '' })}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to generated
        </button>
      )}
    </div>
  );
}
