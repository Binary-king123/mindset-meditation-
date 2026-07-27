import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  Flower2,
  Play,
  Radio,
  ShieldCheck,
  Signal,
} from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { NowPlayingCard } from '@/components/home/now-playing-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createPublicClient } from '@/lib/supabase/public';
import {
  PODCAST_SELECT,
  formatDuration,
  type DatedEpisode,
  type EpisodeSummary,
} from '@/lib/podcast';
import { getShow } from '@/lib/show';
import { type ResolvedPlatform, HARDCODED_PLATFORMS } from '@/lib/platforms';
import {
  JsonLd,
  pageMetadata,
  organizationLd,
  webSiteLd,
  podcastSeriesLd,
  siteNavigationLd,
  breadcrumbLd,
} from '@/lib/seo';

export const revalidate = 300;

const SEO_DESCRIPTION =
  'Official website of The Mindset Meditation podcast. Listen free on our website or choose Spotify, Apple Podcasts, Amazon Music, YouTube Music, and more.';

/** The four promises under the hero copy. Icons carry the meaning, not decoration. */
const HERO_PROOF = [
  { icon: BadgeCheck, label: '100% Free', detail: 'Always' },
  { icon: ShieldCheck, label: 'No Interruptions', detail: 'Ad-light' },
  { icon: Signal, label: 'High Quality', detail: 'Crystal clear' },
  { icon: Radio, label: 'Listen Anywhere', detail: 'Your choice' },
];

const EPISODE_BADGES = ['Sleep', 'Mindfulness', 'Relaxation'];

const DEMO_EPISODES: DatedEpisode[] = [
  {
    id: 'demo-1',
    title: 'Morning Calm Meditation',
    slug: 'playlists',
    thumbnail_url: '/playlist-fallback-1.png',
    short_description: 'Ease into the day with a peaceful guided breathing session.',
    duration_seconds: 133,
    instructor_name: null,
    created_at: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'demo-2',
    title: 'Still Water Relaxation',
    slug: 'playlists',
    thumbnail_url: '/playlist-fallback-2.jpeg',
    short_description: 'Soft meditation audio inspired by quiet lakes and slow sunrise light.',
    duration_seconds: 281,
    instructor_name: null,
    created_at: '2026-07-21T00:00:00.000Z',
  },
  {
    id: 'demo-3',
    title: 'Nature Path Mindfulness',
    slug: 'playlists',
    thumbnail_url: '/playlist-fallback-3.jpeg',
    short_description: 'A grounding mindfulness practice shaped around walking, breath, and focus.',
    duration_seconds: 356,
    instructor_name: null,
    created_at: '2026-07-20T00:00:00.000Z',
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Eyebrow + heading + optional right-hand action, shared by every section. */
function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary sm:text-xs">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-foreground sm:text-3xl lg:text-4xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-foreground/50 sm:text-base">{subtitle}</p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="press inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-foreground/12 bg-foreground/5 px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/10 sm:self-auto sm:text-sm"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function ListenCard({ platform }: { platform: ResolvedPlatform }) {
  return (
    <a
      href={platform.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group stream-card flex h-full flex-col rounded-2xl p-4 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-[0_24px_60px_-30px_var(--brand)] sm:rounded-[1.4rem] sm:p-5"
      style={{ '--brand': platform.color } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-foreground/10 sm:h-12 sm:w-12"
          style={{ background: `linear-gradient(135deg, ${platform.color}25, transparent)` }}
        >
          <svg viewBox="0 0 24 24" fill={platform.color} className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true">
            <path d={platform.path} />
          </svg>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <h3 className="mt-4 text-sm font-black leading-snug text-foreground sm:text-base">
        {platform.label}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/55 sm:text-sm">
        Follow the official feed.
      </p>
    </a>
  );
}

function EpisodeCard({ episode, badge }: { episode: DatedEpisode; badge: string }) {
  return (
    <article className="group stream-card flex h-full flex-col overflow-hidden rounded-2xl p-3 transition-colors duration-300 hover:border-foreground/20 sm:rounded-[1.6rem] sm:p-4">
      <Link
        href={`/podcast/${episode.slug}`}
        className="relative block aspect-square w-full overflow-hidden rounded-xl border border-foreground/10 sm:rounded-2xl"
      >
        {episode.thumbnail_url ? (
          <Image
            src={episode.thumbnail_url}
            alt={episode.title}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 45vw, 380px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[hsl(var(--aura-1))] to-[hsl(var(--aura-2))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <span className="absolute bottom-2.5 left-2.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white/95 backdrop-blur-md sm:bottom-3 sm:left-3">
          {badge}
        </span>
      </Link>

      <div className="mt-3 flex flex-1 flex-col sm:mt-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/40 sm:text-[11px]">
          <span className="truncate">{formatDate(episode.created_at)}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-foreground/25" />
          <span className="shrink-0 tabular-nums">{formatDuration(episode.duration_seconds)}</span>
        </div>

        <h3 className="mt-1.5 text-sm font-black leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base lg:text-lg">
          <Link href={`/podcast/${episode.slug}`}>{episode.title}</Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground/50 sm:text-sm">
          {episode.short_description || 'A calming guided meditation session.'}
        </p>

        <Link
          href={`/podcast/${episode.slug}`}
          aria-label={`Play ${episode.title}`}
          className="press mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-foreground/8 py-1.5 pl-1.5 pr-4 text-xs font-bold text-foreground transition-colors hover:bg-primary"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-white transition-colors group-hover:bg-white group-hover:text-primary">
            <Play className="ml-0.5 h-3 w-3" fill="currentColor" />
          </span>
          Play
        </Link>
      </div>
    </article>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const show = await getShow();

  return pageMetadata({
    title: 'The Mindset Meditation | Guided Meditation, Sleep Music & Mindfulness Podcast',
    absoluteTitle: true,
    description: SEO_DESCRIPTION,
    descriptionMax: 320,
    path: '/',
    image: show.coverUrl,
    index: true,
    keywords: [
      'meditation podcast',
      'guided meditation',
      'sleep music',
      'mindfulness podcast',
      'official podcast website',
      'meditation episodes',
    ],
  });
}

export default async function HomePage() {
  const supabase = createPublicClient();

  const [show, { data: latestRows }] = await Promise.all([
    getShow(),
    supabase
      .from('tracks')
      .select(PODCAST_SELECT)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const latestEpisodes = (latestRows ?? []) as DatedEpisode[];
  // With nothing published the page still has to look finished, so it falls
  // back to demo cards — but the hero player is told it cannot stream them.
  const hasLiveEpisodes = latestEpisodes.length > 0;
  const episodesToShow = hasLiveEpisodes ? latestEpisodes : DEMO_EPISODES;
  const heroEpisode = episodesToShow[0];
  const platforms = HARDCODED_PLATFORMS;

  const heroTrack: EpisodeSummary = {
    id: heroEpisode.id,
    title: heroEpisode.title,
    slug: heroEpisode.slug,
    thumbnail_url: heroEpisode.thumbnail_url,
    short_description: heroEpisode.short_description,
    duration_seconds: heroEpisode.duration_seconds,
    instructor_name: heroEpisode.instructor_name,
  };

  return (
    <div className="stream-shell flex min-h-screen flex-col">
      <JsonLd
        data={[
          organizationLd(platforms),
          webSiteLd(),
          podcastSeriesLd({
            name: show.name,
            description: show.description,
            coverUrl: show.coverUrl,
            platforms,
            episodes: episodesToShow.map((episode) => ({
              title: episode.title,
              slug: episode.slug,
            })),
          }),
          breadcrumbLd([{ name: 'Home', path: '/' }]),
          ...(platforms.length
            ? [siteNavigationLd(platforms.map((p) => ({ name: p.label, url: p.url })))]
            : []),
        ]}
      />

      <Navbar />

      {/* The global player docks to the bottom edge, so the last section needs
          room to clear it on phones where it is full-width. */}
      <main className="flex-1 pb-28 sm:pb-32">
        {/* ============================ HERO ============================ */}
        <section
          id="home"
          className="relative overflow-hidden px-4 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-32 lg:px-8 lg:pb-20 lg:pt-36"
        >
          <div
            className="pointer-events-none absolute -left-32 -top-32 h-[26rem] w-[26rem] rounded-full bg-primary/15 blur-[130px] sm:h-[38rem] sm:w-[38rem] sm:blur-[150px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 top-24 h-[22rem] w-[22rem] rounded-full bg-[hsl(var(--aura-4)/0.14)] blur-[120px] sm:h-[32rem] sm:w-[32rem] sm:blur-[130px]"
            aria-hidden
          />

          <div className="relative z-10 mx-auto w-full max-w-7xl">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_minmax(0,25rem)] lg:gap-12 xl:gap-16">
              {/* --- Copy ---
                  Second on phones: the player is the thing people came for, so
                  it leads and the pitch follows. On lg the two sit side by side
                  and reading order returns to left-then-right. */}
              <Reveal className="order-2 min-w-0 lg:order-1">
                <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground/55">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Welcome to
                  </span>

                  <h1 className="mt-4 text-[2.25rem] font-black leading-[1.05] tracking-tight text-foreground xs:text-5xl sm:text-6xl lg:text-[4.25rem]">
                    The Mindset{' '}
                    <span className="bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent dark:from-pink-300 dark:via-purple-300 dark:to-indigo-300">
                      Meditation
                    </span>
                  </h1>

                  <p className="mt-4 text-base font-bold text-foreground/65 sm:text-lg lg:text-xl">
                    Guided Meditation, Sleep Music &amp; Mindfulness Podcast
                  </p>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-foreground/45 sm:text-base lg:mx-0">
                    Your daily space to relax, heal, and transform your mind. Listen free on our
                    website or on your favorite podcast platform.
                  </p>

                  <div className="mt-7 flex flex-col gap-3 xs:flex-row xs:justify-center lg:justify-start">
                    <Link
                      href={hasLiveEpisodes ? `/podcast/${heroEpisode.slug}` : '/playlists'}
                      className="shine press inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(147,51,234,0.32)] transition-colors hover:bg-primary/90"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
                        <Play className="ml-0.5 h-2.5 w-2.5" fill="currentColor" />
                      </span>
                      Listen on Website
                    </Link>
                    <Link
                      href="#about"
                      className="press inline-flex items-center justify-center gap-2 rounded-full border border-foreground/12 bg-foreground/5 px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10"
                    >
                      Learn More
                      <ArrowRight className="h-4 w-4 rotate-90 text-foreground/60" />
                    </Link>
                  </div>

                  {/* Four promises. A 2×2 grid on phones — the old single row
                      scrolled horizontally and clipped the last two mid-word. */}
                  <ul className="mt-9 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-foreground/8 pt-7 text-left sm:grid-cols-4 sm:gap-x-5">
                    {HERO_PROOF.map(({ icon: Icon, label, detail }) => (
                      <li key={label} className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate text-xs font-bold text-foreground/85 sm:text-[13px]">
                            {label}
                          </span>
                        </div>
                        <p className="mt-1 pl-6 text-[11px] text-foreground/40">{detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              {/* --- Now playing --- */}
              <Reveal direction="scale" className="order-1 min-w-0 lg:order-2">
                <div className="mx-auto w-full max-w-[24rem] lg:mx-0 lg:ml-auto lg:max-w-none">
                  <NowPlayingCard
                    track={heroTrack}
                    queue={hasLiveEpisodes ? latestEpisodes : []}
                    showName={show.name}
                    cover="/hero-top.png"
                    playable={hasLiveEpisodes}
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ======================= LISTEN ANYWHERE ======================= */}
        <section
          id="listen-anywhere"
          className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
        >
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[140px] sm:h-[38rem] sm:w-[38rem] sm:blur-[160px]"
            aria-hidden
          />

          <div className="relative z-10 mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading
                eyebrow="Listen Anywhere"
                title="Choose your favorite platform."
                subtitle="The same episodes, wherever you already listen."
              />
            </Reveal>

            <RevealGroup
              stagger={0.06}
              className={`mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-9 ${
                platforms.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'
              }`}
            >
              {platforms.map((platform) => (
                <RevealItem key={platform.id} className="h-full">
                  <ListenCard platform={platform} />
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ========================== EPISODES ========================== */}
        <section
          id="episodes"
          className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
        >
          <div
            className="pointer-events-none absolute -left-24 top-1/3 h-[24rem] w-[24rem] rounded-full bg-[hsl(var(--aura-2)/0.12)] blur-[130px] sm:h-[32rem] sm:w-[32rem] sm:blur-[140px]"
            aria-hidden
          />

          <div className="relative z-10 mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading
                eyebrow="Fresh This Week"
                title="Latest Episodes"
                subtitle="New meditation sessions for your mind, body and soul."
                action={{ href: '/playlists', label: 'View all' }}
              />
            </Reveal>

            {/* Phones get a snap carousel rather than a grid: three cards in two
                columns always leaves a hole, and swiping a shelf of covers is
                the gesture people already use in every music app. It becomes a
                plain three-up grid once there is room for one. */}
            <RevealGroup
              stagger={0.05}
              className="scrollbar-hide -mx-4 mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-5 sm:px-6 lg:mx-0 lg:mt-9 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {episodesToShow.slice(0, 3).map((episode, index) => (
                <RevealItem
                  key={episode.id}
                  className="w-[68vw] max-w-[19rem] shrink-0 snap-start xs:w-[58vw] sm:w-[44vw] lg:w-auto lg:max-w-none"
                >
                  <EpisodeCard episode={episode} badge={EPISODE_BADGES[index] ?? 'Meditation'} />
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ============================ ABOUT ============================ */}
        <section
          id="about"
          className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
        >
          <div
            className="pointer-events-none absolute bottom-0 right-0 h-[24rem] w-[24rem] rounded-full bg-primary/12 blur-[140px] sm:h-[32rem] sm:w-[32rem] sm:blur-[150px]"
            aria-hidden
          />

          <div className="relative z-10 mx-auto max-w-7xl">
            <Reveal>
              <div className="stream-panel overflow-hidden rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-8 lg:p-10">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-center lg:gap-10">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-foreground/8 bg-black/20 sm:aspect-[2/1] lg:aspect-[4/3]">
                    <Image
                      src="/hero-bottom.png"
                      alt="A person meditating at sunrise"
                      fill
                      sizes="(max-width: 1024px) 92vw, 320px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 text-center lg:text-left">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-gradient-to-br from-[hsl(var(--aura-4)/0.22)] to-[hsl(var(--aura-1)/0.3)] shadow-[0_0_50px_hsl(var(--glow)/0.18)] lg:mx-0">
                      <Flower2 className="h-7 w-7 text-primary" />
                    </div>

                    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-primary sm:text-xs">
                      About the Podcast
                    </p>
                    <h2 className="mt-2 text-2xl font-black leading-tight text-foreground sm:text-3xl">
                      Meditation for a Better You
                    </h2>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-foreground/55 sm:text-base lg:mx-0">
                      The Mindset Meditation Podcast is here to help you relax, improve sleep, reduce
                      stress and build a mindful life.
                    </p>

                    <ul className="mt-6 flex flex-col items-center gap-2.5 text-xs text-foreground/50 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:text-sm lg:justify-start">
                      {[
                        'New episodes every week',
                        'Trusted by thousands of listeners',
                        'Created with care for your well-being',
                      ].map((point) => (
                        <li key={point} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
      <AudioPlayer />
    </div>
  );
}
