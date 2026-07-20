'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ChipCategory {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export function CategoryChips({
  categories,
  active,
}: {
  categories: ChipCategory[];
  active?: string;
}) {
  const items = [{ id: '', name: 'All sessions', color: null, icon: '✦' }, ...categories];

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="flex flex-wrap gap-2"
    >
      {items.map((c) => {
        const isActive = (c.id || undefined) === active;
        const accent = c.color ?? 'hsl(var(--primary))';
        return (
          <motion.div
            key={c.id || 'all'}
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href={c.id ? `/?cat=${c.id}#sessions` : '/#sessions'}
              scroll={false}
              className={cn(
                'relative inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold',
                'press transition-all duration-300 border',
                isActive
                  ? 'text-white border-transparent shadow-lg'
                  : 'glass-card text-muted-foreground hover:text-foreground hover:-translate-y-0.5 border-border',
              )}
              style={
                isActive
                  ? { background: accent, boxShadow: `0 10px 30px -10px ${accent}` }
                  : undefined
              }
            >
              <span aria-hidden>{c.icon}</span>
              {c.name}
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
