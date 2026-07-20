import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Moon,
  Brain,
  Heart,
  Sparkles,
  Play,
  Bookmark,
  MessageCircle,
  Quote,
  ArrowRight,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { PodcastCard, type CardPodcast } from '@/components/podcast/podcast-card';
import { Hero } from '@/components/home/hero';
import { Marquee } from '@/components/home/marquee';
import { CategoryChips, type ChipCategory } from '@/components/home/category-chips';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { PlaylistCard } from '@/components/playlist/playlist-card';
import { createClient } from '@/lib/supabase/server';
import { PODCAST_SELECT, PLAYLIST_SELECT, type PlaylistSummary } from '@/lib/podcast';
import { BRAND } from '@/lib/brand';
import { JsonLd, pageMetadata, faqLd, itemListLd, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  // Kept to ~56 chars so Google renders it whole, keyword first, brand last.
  title: 'Guided Meditation for Sleep & Stress | Mindset Meditation',
  absoluteTitle: true,
  description:
    'Free guided meditations for sleep, anxiety, stress and focus. Stream calming sessions, save your favourites, and build a daily mindfulness habit that sticks.',
  path: '/',
  keywords: [
    'guided meditation',
    'free guided meditation',
    'sleep meditation',
    'meditation for anxiety',
    'mindfulness',
    'breathwork',
  ],
});

export const dynamic = 'force-dynamic';

// Real answers to what people actually search — and the source for the
// FAQPage schema, which is what earns the expandable FAQ block in Google.
const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'What is the best meditation for sleep?',
    answer:
      'Body scans and slow breathwork work best at night because they move attention away from thought and into physical sensation. Start with a 10-minute wind-down session in the Sleep & Relaxation category, lying down, with the sleep timer set so the audio stops on its own.',
  },
  {
    question: 'How long should I meditate each day?',
    answer:
      'Ten minutes a day, done consistently, beats an hour once a week. Consistency is what builds the habit, so pick a length you will actually repeat — even three minutes counts on a busy day.',
  },
  {
    question: 'Does meditation actually help with anxiety and stress?',
    answer:
      'Mindfulness and breath-focused practices are widely used to reduce day-to-day stress and calm a racing mind, and are the basis of programmes like mindfulness-based stress reduction. They are a supportive practice, not a substitute for medical care — speak to a doctor about persistent or severe anxiety.',
  },
  {
    question: 'Do I need any experience to start meditating?',
    answer:
      'No. Every session is guided from start to finish, so you simply follow the voice. A wandering mind is not failure — noticing that it wandered and coming back is the practice itself.',
  },
  {
    question: `Is ${BRAND.name} free to use?`,
    answer:
      'You can preview any session for free, and creating an account lets you save sessions to your library, follow full playlists, and pick up where you left off.',
  },
];

const BENEFITS: Array<{ icon: LucideIcon; title: string; text: string; tint: string }> = [
  {
    icon: Moon,
    title: 'Sleep deeper',
    text: 'Wind-down sessions that quiet a racing mind so you drift off faster and stay there.',
    tint: 'var(--aura-1)',
  },
  {
    icon: Brain,
    title: 'Focus & clarity',
    text: 'Short guided resets that clear mental clutter and put you back in control of your attention.',
    tint: 'var(--aura-2)',
  },
  {
    icon: Heart,
    title: 'Feel calmer',
    text: 'Breathwork and mindfulness that lower stress and anxiety in a way you can actually feel.',
    tint: 'var(--aura-4)',
  },
  {
    icon: Sparkles,
    title: 'Build a habit',
    text: 'A few minutes a day, saved to your library, compounding quietly into real change.',
    tint: 'var(--aura-3)',
  },
];

const STEPS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Play,
    title: 'Press play',
    text: 'Pick a session that matches your mood. A free 1-minute preview lets you feel it before you commit.',
  },
  {
    icon: Bookmark,
    title: 'Save it',
    text: 'Tap the heart to keep sessions in your library and return to them whenever you need to.',
  },
  {
    icon: MessageCircle,
    title: 'Reflect',
    text: 'Leave a note on how a session landed and see what the rest of the community is discovering.',
  },
];

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center = true,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? 'text-center max-w-2xl mx-auto' : 'max-w-2xl'}>
      <Reveal>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card text-[11px] font-bold uppercase tracking-[0.14em] text-primary mb-4">
          {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={0.06}>
        <h2
          className="text-3xl md:text-[2.6rem] leading-tight font-black text-foreground text-balance"
          style={{ fontFamily: 'var(--font-outfit)' }}
        >
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.12}>
          <p className="text-muted-foreground mt-4 leading-relaxed text-balance">{subtitle}</p>
        </Reveal>
      )}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let podQuery = supabase
    .from('tracks')
    .select(PODCAST_SELECT)
    .eq('status', 'published')
    .is('deleted_at', null);
  if (cat) podQuery = podQuery.eq('category_id', cat);

  const [{ data: podcasts }, { data: categories }, { count: totalSessions }, { data: playlistRows }] =
    await Promise.all([
      podQuery.order('created_at', { ascending: false }).limit(24),
      supabase
        .from('categories')
        .select('id, name, slug, color, icon')
        .is('deleted_at', null)
        .order('sort_order')
        .limit(12),
      supabase
        .from('tracks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .is('deleted_at', null),
      supabase
        .from('playlists')
        .select(PLAYLIST_SELECT)
        .eq('is_public', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

  const list = (podcasts ?? []) as unknown as CardPodcast[];
  const cats = (categories ?? []) as ChipCategory[];
  const playlists = (playlistRows ?? []) as PlaylistSummary[];

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd
        data={[
          faqLd(FAQS),
          breadcrumbLd([{ name: 'Home', path: '/' }]),
          ...(list.length
            ? [
                itemListLd(
                  list.slice(0, 12).map((p) => ({ name: p.title, path: `/podcast/${p.slug}` })),
                  'Latest meditation sessions',
                ),
              ]
            : []),
        ]}
      />
      <Navbar />
      <main className="flex-1">
        <Hero sessionCount={totalSessions ?? list.length} categoryCount={cats.length} />

        <Marquee />

        {/* Benefits */}
        <section className="relative px-4 md:px-8 py-24 max-w-7xl mx-auto">
          <div className="absolute inset-0 dot-grid pointer-events-none" aria-hidden />
          <div className="relative">
            <SectionHeading
              eyebrow="Why it works"
              title={
                <>
                  A quieter mind is a <span className="text-gradient">practice</span>, not a
                  personality
                </>
              }
              subtitle="A few minutes of guided audio a day changes how your mind feels. Here's what listeners get out of it."
            />

            <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
              {BENEFITS.map((b) => (
                <RevealItem key={b.title}>
                  <div className="gradient-ring lift glass-card rounded-2xl p-6 h-full">
                    <div
                      className="w-12 h-12 rounded-2xl grid place-items-center mb-5 text-white"
                      style={{
                        background: `linear-gradient(135deg, hsl(${b.tint}) 0%, hsl(${b.tint} / 0.55) 100%)`,
                        boxShadow: `0 12px 30px -12px hsl(${b.tint} / 0.8)`,
                      }}
                    >
                      <b.icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-foreground mb-2 text-lg">{b.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.text}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Playlists */}
        {playlists.length > 0 && (
          <section className="px-4 md:px-8 py-12 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
              <SectionHeading
                center={false}
                eyebrow="Follow a series"
                title={
                  <>
                    Curated <span className="text-gradient">playlists</span>
                  </>
                }
                subtitle="Sessions grouped into series you can work through start to finish."
              />
              <Reveal delay={0.1}>
                <Link
                  href="/playlists"
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-300"
                >
                  See all playlists
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Reveal>
            </div>
            <RevealGroup
              stagger={0.06}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
            >
              {playlists.map((p) => (
                <RevealItem key={p.id}>
                  <PlaylistCard playlist={p} />
                </RevealItem>
              ))}
            </RevealGroup>
          </section>
        )}

        {/* Sessions */}
        <section id="sessions" className="px-4 md:px-8 py-16 max-w-7xl mx-auto scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
            <SectionHeading
              center={false}
              eyebrow={user ? 'Your library' : 'Listen now'}
              title={
                user ? (
                  <>
                    Your <span className="text-gradient">meditations</span>
                  </>
                ) : (
                  <>
                    Latest <span className="text-gradient">sessions</span>
                  </>
                )
              }
              subtitle="Filter by what you need right now — sleep, stress, focus, or something in between."
            />
            {user && (
              <Reveal delay={0.1}>
                <Link
                  href="/saved"
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-300"
                >
                  View saved
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Reveal>
            )}
          </div>

          {cats.length > 0 && (
            <div className="mb-10">
              <CategoryChips categories={cats} active={cat} />
            </div>
          )}

          {list.length === 0 ? (
            <Reveal>
              <div className="glass-card rounded-3xl p-16 text-center">
                <div className="w-16 h-16 rounded-3xl bg-primary/15 text-primary grid place-items-center mx-auto mb-5 breathe">
                  <Sparkles className="w-7 h-7" />
                </div>
                <p className="text-foreground font-bold text-lg mb-1">
                  Nothing here yet{cat ? ' in this theme' : ''}
                </p>
                <p className="text-muted-foreground text-sm">
                  New sessions land regularly — check back soon.
                </p>
              </div>
            </Reveal>
          ) : (
            <RevealGroup
              stagger={0.06}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
            >
              {list.map((p) => (
                <RevealItem key={p.id}>
                  <PodcastCard podcast={p} queue={list} />
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </section>

        {/* How it works */}
        <section className="px-4 md:px-8 py-20 max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="How it works"
            title="Three steps. That's the whole thing."
          />
          <RevealGroup
            stagger={0.12}
            className="relative grid grid-cols-1 md:grid-cols-3 gap-6 mt-14"
          >
            {/* Connector line between the steps on desktop */}
            <div
              className="hidden md:block absolute top-[3.25rem] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
              aria-hidden
            />
            {STEPS.map((s, i) => (
              <RevealItem key={s.title}>
                <div className="relative gradient-ring lift glass-card rounded-3xl p-8 text-center h-full">
                  <span className="absolute top-5 right-6 text-5xl font-black text-foreground/[0.06] select-none">
                    {i + 1}
                  </span>
                  <div className="relative w-14 h-14 mx-auto rounded-2xl bg-primary/15 text-primary grid place-items-center mb-5">
                    <span className="absolute inset-0 rounded-2xl border border-primary/30 pulse-ring" />
                    <s.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-foreground mb-2 text-lg">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* FAQ — real search-intent content, and the source of the FAQ schema */}
        <section className="px-4 md:px-8 py-20 max-w-3xl mx-auto">
          <SectionHeading
            eyebrow="Questions"
            title={
              <>
                Meditation, <span className="text-gradient">answered</span>
              </>
            }
            subtitle="The things people ask most before they start a practice."
          />
          <RevealGroup stagger={0.07} className="mt-12 space-y-3">
            {FAQS.map((faq) => (
              <RevealItem key={faq.question}>
                <details className="group glass-card rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-5 md:p-6">
                    <h3 className="font-bold text-foreground text-base md:text-lg">
                      {faq.question}
                    </h3>
                    <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center bg-primary/12 text-primary transition-transform duration-300 group-open:rotate-45">
                      <Plus className="w-4 h-4" />
                    </span>
                  </summary>
                  <p className="px-5 md:px-6 pb-6 -mt-1 text-sm md:text-base text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </details>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* Pull quote */}
        <section className="px-4 md:px-8 py-16 max-w-4xl mx-auto">
          <Reveal direction="scale">
            <figure className="relative glass-card rounded-3xl p-10 md:p-14 text-center overflow-hidden">
              <div
                className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-40 float-slow pointer-events-none"
                style={{ background: 'radial-gradient(circle, hsl(var(--aura-1)/0.5), transparent 70%)' }}
                aria-hidden
              />
              <Quote className="w-8 h-8 text-primary mx-auto mb-6" />
              <blockquote
                className="text-2xl md:text-3xl font-bold text-foreground leading-snug text-balance"
                style={{ fontFamily: 'var(--font-outfit)' }}
              >
                You can't stop the waves, but you can learn to surf.
              </blockquote>
              <figcaption className="text-sm text-muted-foreground mt-5">
                Jon Kabat-Zinn — founder of mindfulness-based stress reduction
              </figcaption>
            </figure>
          </Reveal>
        </section>

        {/* Closing CTA */}
        <section className="px-4 md:px-8 pb-24">
          <Reveal direction="scale">
            <div className="aurora-bg grain relative overflow-hidden rounded-[2rem] max-w-6xl mx-auto px-6 py-20 text-center">
              <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden>
                {[0, 1].map((i) => (
                  <span
                    key={`cta-ring-${i}`}
                    className="absolute rounded-full border border-white/10 pulse-ring"
                    style={{
                      width: `${18 + i * 12}rem`,
                      height: `${18 + i * 12}rem`,
                      animationDelay: `${i * 1.5}s`,
                    }}
                  />
                ))}
              </div>
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2
                  className="text-3xl md:text-5xl font-black text-white mb-5 text-balance"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  Transform your mind,
                  <br />
                  <span className="text-gradient">transform your life.</span>
                </h2>
                <p className="text-white/70 mb-9 text-lg leading-relaxed text-balance">
                  Start with one session today. Free to join, no downloads, just press play.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href={user ? '#sessions' : '/auth/register'}
                    className="shine press inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-[hsl(252,45%,8%)] font-bold glow-primary-lg"
                  >
                    {user ? 'Browse sessions' : 'Create free account'}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  {!user && (
                    <Link
                      href="#sessions"
                      className="press inline-flex items-center gap-2 px-8 py-4 rounded-full glass text-white font-bold hover:bg-white/20 transition-colors"
                    >
                      Listen first
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
      <AudioPlayer />
    </div>
  );
}
