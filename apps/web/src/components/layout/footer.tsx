import Link from 'next/link';
import { Mail, Instagram, Youtube, Twitter } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { PlatformButtons } from '@/components/podcast/platform-buttons';
import { ContactForm } from '@/components/layout/contact-form';
import { BRAND } from '@/lib/brand';
import { HARDCODED_PLATFORMS } from '@/lib/platforms';

const LISTEN_LINKS: Array<{ href: string; label: string }> = [
  { href: '/#playlists', label: 'Playlists' },
  { href: '/playlists', label: 'All series' },
  { href: '/playlists?tab=saved', label: 'Your library' },
];

const ACCOUNT_LINKS: Array<{ href: string; label: string }> = [
  { href: '/auth/login', label: 'Sign in' },
  { href: '/auth/register', label: 'Create account' },
];

export async function Footer() {
  const year = new Date().getFullYear();
  const platforms = HARDCODED_PLATFORMS;

  return (
    <footer className="relative mt-auto border-t border-border bg-background/90 backdrop-blur-sm overflow-hidden">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_1.1fr_1.4fr] gap-10 lg:gap-8">
          {/* Brand + platforms */}
          <div>
            <Logo textClassName="text-base" />
              <p className="text-sm text-foreground/60 mt-4 max-w-xs leading-relaxed">
                {BRAND.tagline}. Guided meditations for sleep, stress, focus, and clarity — streamed
                whenever you need them.
              </p>
            {platforms.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mb-3">
                  Listen on
                </h3>
                {/* justify-start: the default centres the row, which left the
                    buttons floating out of line with the "Listen on" heading
                    above them on mobile. */}
                <PlatformButtons platforms={platforms} variant="compact" className="justify-start" />
              </div>
            )}
          </div>

          {/* Listen (hidden on mobile/tablet) */}
          <div className="hidden md:block">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mb-4">
              Listen
            </h3>
            <ul className="space-y-2.5">
              {LISTEN_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-foreground/60 hover:text-primary transition-colors duration-300"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>

            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mt-6 mb-4">
              Account
            </h3>
            <ul className="space-y-2.5">
              {ACCOUNT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-foreground/60 hover:text-primary transition-colors duration-300"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact details (hidden on mobile/tablet) */}
          <div className="hidden md:block">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mb-4">
              Contact
            </h3>
            <a
              href={`mailto:${BRAND.contactEmail}`}
              className="inline-flex items-start gap-2 text-sm text-foreground/60 hover:text-primary transition-colors whitespace-nowrap"
            >
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              {BRAND.contactEmail}
            </a>
            <p className="text-xs text-foreground/50 mt-4 leading-relaxed">
              Questions, feedback or a collaboration? Send us a note.
            </p>
          </div>

          {/* Enquiry form (hidden on mobile/tablet) */}
          <div className="hidden md:block">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground mb-4">
              Get in touch
            </h3>
            <ContactForm />
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-foreground/50">
            © {year} {BRAND.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-foreground/50">
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors" aria-label="Instagram">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors" aria-label="YouTube">
              <Youtube className="w-5 h-5" />
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors" aria-label="X (formerly Twitter)">
              <Twitter className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
