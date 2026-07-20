import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AudioPlayer } from '@/components/player/audio-player';
import { PodcastCard, type CardPodcast } from '@/components/podcast/podcast-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/reveal';
import { createClient } from '@/lib/supabase/server';
import { PODCAST_SELECT } from '@/lib/podcast';

export const metadata: Metadata = { title: 'Your library' };
export const dynamic = 'force-dynamic';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-28 px-4 md:px-8 max-w-7xl mx-auto w-full pb-32">{children}</main>
      <Footer />
      <AudioPlayer />
    </div>
  );
}

function PageHeader({ count }: { count?: number }) {
  return (
    <Reveal>
      <div className="relative overflow-hidden rounded-3xl glass-card p-8 md:p-10 mb-10">
        <div
          className="absolute -top-20 -right-10 w-72 h-72 rounded-full blur-3xl opacity-40 float-slow pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(var(--aura-4)/0.55), transparent 70%)' }}
          aria-hidden
        />
        <div className="relative flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl grid place-items-center bg-primary/15 text-primary shrink-0 breathe">
            <Heart className="w-6 h-6" fill="currentColor" />
          </span>
          <div>
            <h1
              className="text-3xl md:text-4xl font-black text-foreground"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              Your <span className="text-gradient">library</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {count === undefined
                ? 'Sessions you save live here.'
                : count === 0
                  ? 'Sessions you save live here.'
                  : `${count} session${count === 1 ? '' : 's'} saved for whenever you need them.`}
            </p>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <PageHeader />
        <Reveal direction="scale">
          <div className="glass-card rounded-3xl p-16 text-center">
            <p className="text-foreground font-bold text-lg mb-2">Sign in to see your library</p>
            <p className="text-muted-foreground text-sm mb-7">
              Save any session with the heart and it will be waiting here.
            </p>
            <Link
              href="/auth/login"
              className="shine press inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-full font-bold glow-primary"
            >
              Sign in
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>
      </Shell>
    );
  }

  const { data } = await supabase
    .from('favorites')
    .select(`created_at, track:tracks(${PODCAST_SELECT})`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const list = ((data ?? []) as Array<{ track: unknown }>)
    .map((r) => r.track)
    .filter(Boolean) as CardPodcast[];

  return (
    <Shell>
      <PageHeader count={list.length} />
      {list.length === 0 ? (
        <Reveal direction="scale">
          <div className="glass-card rounded-3xl p-16 text-center">
            <p className="text-foreground font-bold text-lg mb-2">Nothing saved yet</p>
            <p className="text-muted-foreground text-sm mb-7">
              Tap the heart on any session to keep it here.
            </p>
            <Link
              href="/#sessions"
              className="shine press inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-full font-bold glow-primary"
            >
              Browse sessions
              <ArrowRight className="w-4 h-4" />
            </Link>
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
    </Shell>
  );
}
