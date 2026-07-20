'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;

const VARIANTS: Record<string, Variants> = {
  up: {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0 },
  },
  left: {
    hidden: { opacity: 0, x: -28 },
    show: { opacity: 1, x: 0 },
  },
  right: {
    hidden: { opacity: 0, x: 28 },
    show: { opacity: 1, x: 0 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94 },
    show: { opacity: 1, scale: 1 },
  },
};

/** Fades content in the first time it scrolls into view. */
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
  direction?: keyof typeof VARIANTS;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[direction]}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Parent that walks its <RevealItem> children in one after another. */
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
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  direction = 'up',
}: {
  children: ReactNode;
  className?: string;
  direction?: keyof typeof VARIANTS;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[direction]}
      transition={{ duration: 0.65, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
