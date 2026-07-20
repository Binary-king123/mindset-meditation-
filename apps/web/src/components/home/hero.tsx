'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { Play, Sparkles, ArrowDown } from 'lucide-react';
import { BRAND } from '@/lib/brand';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Deterministic pseudo-random so the server and client render identical stars —
 * Math.random() here would desync hydration.
 */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pre-rounded to fixed precision: full-precision floats serialize differently
 * on the server than the client sets them, which trips a hydration mismatch.
 */
const STARS = Array.from({ length: 44 }, (_, i) => ({
  left: `${(seeded(i, 1) * 100).toFixed(3)}%`,
  top: `${(seeded(i, 2) * 100).toFixed(3)}%`,
  size: `${(1 + seeded(i, 3) * 1.6).toFixed(2)}px`,
  delay: `${(seeded(i, 4) * 4).toFixed(2)}s`,
  duration: `${(2.4 + seeded(i, 5) * 3).toFixed(2)}s`,
}));

const HEADLINE_A = ['Transform', 'your', 'mind,'];
const HEADLINE_B = ['transform', 'your', 'life.'];

function Word({ word, index }: { word: string; index: number }) {
  return (
    <motion.span
      className="inline-block mr-[0.25em]"
      initial={{ opacity: 0, y: '0.5em', filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, delay: 0.25 + index * 0.08, ease: EASE }}
    >
      {word}
    </motion.span>
  );
}

function Orb({
  className,
  color,
  parallax,
  depth,
  duration,
  delay = 0,
}: {
  className: string;
  color: string;
  parallax: { x: MotionValue<number>; y: MotionValue<number> };
  depth: number;
  duration: number;
  delay?: number;
}) {
  const x = useTransform(parallax.x, (v) => v * depth);
  const y = useTransform(parallax.y, (v) => v * depth);
  return (
    <motion.div
      className={`absolute rounded-full ${className}`}
      style={{ x, y, background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
      animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.8, 0.45] }}
      transition={{ duration, delay, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    />
  );
}

export function Hero({
  sessionCount,
  categoryCount,
}: {
  sessionCount: number;
  categoryCount: number;
}) {
  const ref = useRef<HTMLElement>(null);

  // Pointer parallax — springs keep it buttery instead of twitchy.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 60, damping: 20, mass: 0.6 });
  const py = useSpring(rawY, { stiffness: 60, damping: 20, mass: 0.6 });

  // Content drifts up and fades as you scroll past — a proper parallax exit.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  const handlePointer = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    rawX.set(((e.clientX - rect.left) / rect.width - 0.5) * 100);
    rawY.set(((e.clientY - rect.top) / rect.height - 0.5) * 100);
  };

  const stats = [
    { value: sessionCount > 0 ? `${sessionCount}` : '—', label: 'Guided sessions' },
    { value: categoryCount > 0 ? `${categoryCount}` : '—', label: 'Themes to explore' },
    { value: '1 min', label: 'Free preview' },
    { value: '24/7', label: 'On demand' },
  ];

  return (
    <section
      ref={ref}
      onPointerMove={handlePointer}
      onPointerLeave={() => {
        rawX.set(0);
        rawY.set(0);
      }}
      className="aurora-bg grain relative overflow-hidden min-h-[92vh] flex items-center justify-center px-4 py-28"
    >
      {/* Drifting colour orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <Orb
          className="top-[12%] left-[8%] w-[34rem] h-[34rem]"
          color="hsla(258,90%,68%,0.5)"
          parallax={{ x: px, y: py }}
          depth={0.35}
          duration={9}
        />
        <Orb
          className="bottom-[6%] right-[6%] w-[30rem] h-[30rem]"
          color="hsla(190,90%,58%,0.4)"
          parallax={{ x: px, y: py }}
          depth={-0.28}
          duration={11}
          delay={1.5}
        />
        <Orb
          className="top-[40%] right-[26%] w-[24rem] h-[24rem]"
          color="hsla(320,80%,66%,0.32)"
          parallax={{ x: px, y: py }}
          depth={0.5}
          duration={13}
          delay={3}
        />
      </div>

      {/* Stars — plain spans on a CSS animation, not 44 motion components */}
      <div className="absolute inset-0 pointer-events-none">
        {STARS.map((s) => (
          <span
            key={`star-${s.left}-${s.top}`}
            className="twinkle absolute rounded-full bg-white"
            style={
              {
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                '--twinkle-delay': s.delay,
                '--twinkle-duration': s.duration,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Breathing rings behind the headline */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        {[0, 1, 2].map((i) => (
          <span
            key={`ring-${i}`}
            className="absolute rounded-full border border-white/10 pulse-ring"
            style={{
              width: `${26 + i * 12}rem`,
              height: `${26 + i * 12}rem`,
              animationDelay: `${i * 1.3}s`,
            }}
          />
        ))}
      </div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 max-w-4xl mx-auto text-center"
      >
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-semibold text-white/85 mb-7"
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
          {BRAND.name}
        </motion.div>

        {/* Tagline as the headline */}
        <h1
          className="text-[2.75rem] leading-[1.05] sm:text-6xl md:text-7xl font-black text-white mb-6 text-balance"
          style={{ fontFamily: 'var(--font-outfit)' }}
        >
          <span className="block">
            {HEADLINE_A.map((w, i) => (
              <Word key={w} word={w} index={i} />
            ))}
          </span>
          <span className="block text-gradient">
            {HEADLINE_B.map((w, i) => (
              <Word key={w} word={w} index={i + HEADLINE_A.length} />
            ))}
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
          className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed text-balance"
        >
          Guided meditations for sleep, stress, and focus. Press play, breathe, and let a few
          quiet minutes a day compound into real change.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.88, ease: EASE }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            href="#sessions"
            className="shine press group inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-white text-[hsl(252,45%,8%)] font-bold text-base glow-primary-lg"
          >
            <span className="grid place-items-center w-7 h-7 rounded-full bg-[hsl(252,45%,8%)] text-white transition-transform duration-300 group-hover:scale-110">
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            </span>
            Start listening
          </Link>
          <Link
            href="/auth/register"
            className="press inline-flex items-center gap-2 px-8 py-4 rounded-full glass text-white font-bold text-base hover:bg-white/20 transition-colors duration-300"
          >
            Create free account
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-4 max-w-2xl mx-auto"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span
                  className="block text-2xl md:text-3xl font-black text-white"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  {s.value}
                </span>
                <span className="block text-xs text-white/50 font-medium mt-1.5">{s.label}</span>
              </dd>
            </div>
          ))}
        </motion.dl>
      </motion.div>

      {/* Scroll cue */}
      <motion.a
        href="#sessions"
        aria-label="Scroll to sessions"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/40 hover:text-white/80 transition-colors"
      >
        <motion.span
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          className="block"
        >
          <ArrowDown className="w-5 h-5" />
        </motion.span>
      </motion.a>

      {/* Blend into the page below */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-background pointer-events-none" />
    </section>
  );
}
