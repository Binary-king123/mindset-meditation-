/**
 * Deterministic SEO metadata generation.
 *
 * The admin uploads four things — title, audio, cover, playlist — and every
 * other field an episode needs is derived here. No API calls and no model: the
 * inputs are short and highly structured, so a template produces copy that is
 * accurate and identical on every run, which a generative model would not.
 *
 * Every function is pure. Callers apply them only when the human left the
 * corresponding field blank, so hand-written copy always wins (see
 * `app/actions.ts`).
 */
import { BRAND } from '@/lib/brand';

/**
 * Cuts at the last word boundary before `max` and appends an ellipsis, so a
 * description never ends mid-word. Returns the input untouched when it fits.
 */
function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, '')}…`;
}

/**
 * The indefinite article for a duration, chosen by sound rather than spelling:
 * "an 8-minute", "an 11-minute", "an 18-minute", but "a 15-minute".
 *
 * `spokenDuration` only ever emits 1–59 minutes or an "Nh Nm"/"N-hour" form, so
 * these three leading numbers are the complete set of vowel-sounding cases —
 * this is an exact rule over that output, not a general-English approximation.
 */
function article(duration: string): 'a' | 'an' {
  return /^(8|11|18)\b/.test(duration) ? 'an' : 'a';
}

/** "12 min" / "1 h 5 min" — reads better in prose than 12:34. */
function spokenDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins}-minute`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}h ${rest}m` : `${h}-hour`;
}

export interface EpisodeFacts {
  title: string;
  playlistTitle?: string | null;
  durationSeconds: number;
  description?: string | null;
}

/**
 * The `<meta name="description">`. Google renders roughly 155 characters, so
 * the target band is 150–160 — long enough to carry the keywords, short enough
 * not to be cut. Built from the strongest signals available, in order.
 */
export function buildMetaDescription(facts: EpisodeFacts): string {
  const { title, playlistTitle, durationSeconds } = facts;
  const length = spokenDuration(durationSeconds);

  // A human-written description is the best source when there is one.
  const human = facts.description?.trim();
  if (human) return truncateAtWord(human, 158);

  const series = playlistTitle?.trim();
  const lead = [
    `${title.trim()} — ${article(length)} ${length} guided meditation`,
    series ? ` from the ${series} series` : '',
    ` on ${BRAND.name}.`,
  ].join('');
  const tail = ' Listen free for sleep, stress relief and focus.';

  // A long title used to push the tail past the limit, leaving the description
  // ending on a dangling "Listen free for…". A complete sentence that stops
  // short of the band beats a truncated one inside it.
  if (lead.length + tail.length <= 158) return lead + tail;
  return truncateAtWord(lead, 158);
}

/**
 * A 2–3 sentence summary for cards and rich results. Prefers the real
 * description, clipped at a sentence boundary rather than a character count —
 * this replaces the old blind `.slice(0, 300)`, which cut mid-word.
 */
export function buildExcerpt(facts: EpisodeFacts): string {
  const human = facts.description?.trim();

  if (human) {
    const sentences = human.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (sentences?.length) {
      let out = '';
      for (const sentence of sentences.slice(0, 3)) {
        if (out.length + sentence.length > 300) break;
        out += sentence;
      }
      if (out.trim()) return out.trim();
    }
    return truncateAtWord(human, 297);
  }

  const series = facts.playlistTitle?.trim();
  const length = spokenDuration(facts.durationSeconds);
  const seriesClause = series ? ` from the ${series} series` : '';
  // The title keeps its own casing here — lowercasing it produced "let deep
  // sleep body scan carry you", which reads as a typo rather than a title.
  const lead = `${article(length).replace(/^a/, 'A')} ${length} guided meditation${seriesClause}.`;
  const body = `Settle in, follow the breath, and let ${facts.title.trim()} carry you.`;
  return truncateAtWord(`${lead} ${body} Free to stream on any device.`, 297);
}

/** Words carrying no search value — dropped before a title becomes keywords. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
]);

/** Always-true of this catalogue, so every episode is findable by intent. */
const BASE_KEYWORDS = ['guided meditation', 'meditation podcast', 'mindfulness'];

/**
 * Terms the title implies but rarely states. A title containing "sleep" should
 * also rank for "insomnia" and "bedtime" without the admin typing them.
 */
const INTENT_SYNONYMS: Record<string, string[]> = {
  sleep: ['sleep meditation', 'insomnia relief', 'bedtime'],
  calm: ['calming', 'relaxation'],
  relax: ['relaxation', 'stress relief'],
  stress: ['stress relief', 'anxiety relief'],
  anxiety: ['anxiety relief', 'panic relief'],
  breath: ['breathwork', 'breathing exercise'],
  breathing: ['breathwork', 'breathing exercise'],
  focus: ['concentration', 'deep work'],
  morning: ['morning routine', 'wake up'],
  night: ['night routine', 'bedtime'],
  body: ['body scan'],
  gratitude: ['gratitude practice'],
  heal: ['healing'],
};

/**
 * Keywords for the `keywords` column and the `<meta name="keywords">`.
 * Meta keywords carry no ranking weight at Google any more — the real consumer
 * is the `search_vector` weight-B lane, which is why intent synonyms matter:
 * they let a listener searching "insomnia" find an episode titled "Deep Sleep".
 */
export function buildKeywords(facts: Pick<EpisodeFacts, 'title' | 'playlistTitle'>): string[] {
  const words = `${facts.title} ${facts.playlistTitle ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const out = new Set<string>(BASE_KEYWORDS);
  if (facts.playlistTitle?.trim()) out.add(facts.playlistTitle.trim().toLowerCase());
  for (const word of words) {
    out.add(word);
    for (const synonym of INTENT_SYNONYMS[word] ?? []) out.add(synonym);
  }
  return [...out].slice(0, 25);
}

/**
 * Turns whatever an admin typed or pasted into the keywords box into a clean
 * list.
 *
 * People get their keywords from an SEO tool or a chat assistant, and what
 * comes back is usually a whole `<head>` block rather than a bare list. Pasting
 * one used to be taken literally: splitting on commas produced "keywords" like
 * `<title>Starbucks Business Story | Growth` and `entrepreneurship">`, which
 * then went into the database and the search vector.
 *
 * So: if the paste contains a keywords meta tag, that tag's content is the real
 * answer and everything around it is noise. Otherwise markup is stripped and
 * what is left is split on commas and newlines.
 */
export function parseKeywords(raw: string): string[] {
  if (!raw.trim()) return [];

  const metaTag = raw.match(/<meta[^>]*\bname=["']?keywords["']?[^>]*\bcontent=["']([^"']*)["']/i);
  const source = metaTag ? metaTag[1] : raw.replace(/<[^>]*>/g, ' ');

  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of source.split(/[,\n]/)) {
    const keyword = piece
      .replace(/<[^>]*>/g, ' ')
      .replace(/["'<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    // A "keyword" longer than this is a sentence that lost its commas, not a
    // search term worth storing.
    if (!keyword || keyword.length > 60 || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push(keyword);
    if (out.length >= 25) break;
  }
  return out;
}

/**
 * The counterpart to `parseKeywords` for the description box: the same pasted
 * `<head>` block carries a description meta tag, and the same rule applies —
 * take that tag's content if it is there, otherwise strip any stray markup.
 */
export function parseMetaDescription(raw: string): string {
  const metaTag = raw.match(
    /<meta[^>]*\bname=["']?description["']?[^>]*\bcontent=["']([^"']*)["']/i,
  );
  const source = metaTag ? metaTag[1] : raw.replace(/<[^>]*>/g, ' ');
  return source.replace(/\s+/g, ' ').trim();
}

/** Everything the generators produce, for one episode. */
export interface GeneratedMetadata {
  excerpt: string;
  metaDescription: string;
  keywords: string[];
}

export function generateEpisodeMetadata(facts: EpisodeFacts): GeneratedMetadata {
  return {
    excerpt: buildExcerpt(facts),
    metaDescription: buildMetaDescription(facts),
    keywords: buildKeywords(facts),
  };
}
