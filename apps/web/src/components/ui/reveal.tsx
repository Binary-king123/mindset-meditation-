'use client';

/**
 * Fades content in the first time it scrolls into view.
 *
 * Previously three framer-motion components. The homepage renders ~10 of them
 * and the episode page ~8, and each mounted a motion component with its own
 * animation loop for what is a one-shot opacity-and-transform transition — work
 * the compositor does for free from CSS. This version is one IntersectionObserver
 * per element plus a class toggle; the props are unchanged, so no call site moved.
 *
 * prefers-reduced-motion is handled by the `motion-safe:` variants: the element
 * still reveals, it just arrives without the transition rather than not at all.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Direction = 'up' | 'left' | 'right' | 'scale';

/** The pre-reveal resting state for each direction. */
const HIDDEN: Record<Direction, string> = {
  up: 'translate-y-7',
  left: '-translate-x-7',
  right: 'translate-x-7',
  scale: 'scale-[0.94]',
};

/** Fires once, the first time the element approaches the viewport. */
function useInView<T extends HTMLElement>(rootMargin: string) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;

    // No IntersectionObserver (very old browsers, some crawlers): reveal
    // immediately rather than leaving the page permanently blank.
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, rootMargin]);

  return [ref, seen] as const;
}

export function Reveal({
  children,
  delay = 0,
  duration = 0.7,
  direction = 'up',
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  direction?: Direction;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px -80px 0px');

  return (
    <div
      ref={ref}
      className={cn(
        'motion-safe:transition-[opacity,transform] motion-safe:ease-smooth',
        seen ? 'opacity-100' : `opacity-0 ${HIDDEN[direction]}`,
        className,
      )}
      style={{ transitionDuration: `${duration}s`, transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/**
 * Parent that walks its <RevealItem> children in one after another.
 *
 * The stagger is published as CSS custom properties and each item reads its own
 * index via `nth-child` in globals.css — no cloneElement, no per-child state.
 */
export function RevealGroup({
  children,
  stagger = 0.09,
  delay = 0,
  className,
}: {
  children: ReactNode;
  stagger?: number;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px -60px 0px');

  return (
    <div
      ref={ref}
      data-revealed={seen ? 'true' : 'false'}
      style={
        {
          '--reveal-stagger': `${stagger}s`,
          '--reveal-delay': `${delay}s`,
        } as React.CSSProperties
      }
      className={cn('reveal-group', className)}
    >
      {children}
    </div>
  );
}

export function RevealItem({
  children,
  className,
  direction = 'up',
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
}) {
  return (
    <div className={cn('reveal-item', `reveal-item--${direction}`, className)}>{children}</div>
  );
}
