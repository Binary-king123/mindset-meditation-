import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { BRAND } from '@/lib/brand';

const COLUMNS: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
  {
    heading: 'Listen',
    links: [
      { href: '/#sessions', label: 'All sessions' },
      { href: '/playlists', label: 'Playlists' },
      { href: '/saved', label: 'Your library' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/auth/login', label: 'Sign in' },
      { href: '/auth/register', label: 'Create account' },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-auto border-t border-border/70 bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Gradient hairline along the top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        aria-hidden
      />
      <div
        className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-25 pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(var(--aura-1)/0.55), transparent 70%)' }}
        aria-hidden
      />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] gap-10 md:gap-8">
          <div>
            <Logo textClassName="text-base" />
            <p className="text-sm text-muted-foreground mt-4 max-w-xs leading-relaxed">
              {BRAND.tagline}. Guided meditations for sleep, stress, focus, and clarity — streamed
              whenever you need them.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mb-4">
                {col.heading}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {year} {BRAND.name}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Made for quieter minds.</p>
        </div>
      </div>
    </footer>
  );
}
