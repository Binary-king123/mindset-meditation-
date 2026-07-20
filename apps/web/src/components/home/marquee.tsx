const PHRASES = [
  'Sleep deeper',
  'Quiet the noise',
  'Breathe slower',
  'Focus sharper',
  'Let go of stress',
  'Come back to now',
  'Rest your mind',
  'Start again, gently',
];

/**
 * Slow ticker under the hero. The track holds two copies of the list so the
 * -50% translate in the `marquee` keyframe loops seamlessly.
 */
export function Marquee() {
  return (
    <div className="marquee-mask relative border-y border-border/60 bg-card/30 backdrop-blur-sm py-5 overflow-hidden">
      <div className="marquee-track gap-10">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-10 shrink-0 pr-10" aria-hidden={copy === 1}>
            {PHRASES.map((p) => (
              <span
                key={p}
                className="flex items-center gap-10 text-sm md:text-base font-semibold tracking-wide text-muted-foreground whitespace-nowrap"
              >
                {p}
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
