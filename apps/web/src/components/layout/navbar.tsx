'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { Menu, X, Upload, LogOut } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, signOut, loading } = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Reading-progress bar across the top of the page
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  // NB: this used to force setTheme('dark') on every mount, which pinned the
  // site to one theme and silently undid any user choice. Dark is still the
  // default — that now lives in ThemeProvider's defaultTheme (layout.tsx).

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close the mobile sheet whenever the route changes
  useEffect(() => setIsOpen(false), [pathname]);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/playlists', label: 'Playlists' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header
      className={cn(
        // Always opaque. When this was transparent at the top of the page it
        // sat over the dark hero, so in light mode the dark nav text was
        // unreadable against it.
        'fixed top-0 left-0 right-0 z-40 transition-all duration-500 ease-smooth',
        'bg-background/85 backdrop-blur-2xl border-b',
        scrolled
          ? 'border-border shadow-[0_8px_30px_-12px_hsl(var(--glow)/0.28)]'
          : 'border-border/60',
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-2 sm:gap-4">
        <Logo textClassName="text-sm sm:text-base" />

        <div className="hidden md:flex items-center gap-2">
          {links.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'relative px-4 py-2.5 text-sm font-semibold rounded-full transition-colors duration-300',
                  active ? 'text-foreground' : 'text-foreground/60 hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-foreground/10 border border-foreground/10"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{l.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle className="hidden sm:grid" />

          {!loading &&
            (user ? (
              <div className="hidden sm:flex items-center gap-2">
                {isAdmin && (
                  <Link
                    href="/admin/upload"
                    className="press shine flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold bg-primary text-white rounded-full glow-primary hover:bg-primary/90 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </Link>
                )}
                <span className="text-sm font-medium text-foreground/70 max-w-[120px] truncate">
                  {user.profile?.full_name?.split(' ')[0] ?? user.email.split('@')[0]}
                </span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="press p-2 text-foreground/60 hover:text-destructive rounded-xl transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/auth/login"
                  className="px-4 py-2 text-sm font-semibold text-foreground/75 hover:text-foreground rounded-full transition-colors hidden sm:block"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  className="press shine whitespace-nowrap px-4 sm:px-5 py-2.5 text-sm font-bold bg-primary text-white rounded-full hover:bg-primary/90 transition-colors glow-primary"
                >
                  Sign up
                </Link>
              </div>
            ))}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden press p-2 text-foreground/70 hover:text-foreground rounded-xl transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden bg-background/95 backdrop-blur-2xl border-b border-border"
          >
            <div className="px-4 py-4 space-y-1">
              {links.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.05 }}
                >
                  <Link
                    href={l.href}
                    className="block px-4 py-3 text-foreground font-semibold hover:bg-foreground/5 rounded-xl transition-colors"
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              {isAdmin && (
                <Link
                  href="/admin/upload"
                  className="block px-4 py-3 text-primary font-bold hover:bg-foreground/5 rounded-xl transition-colors"
                >
                  Upload session
                </Link>
              )}
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    setIsOpen(false);
                  }}
                  className="block w-full text-left px-4 py-3 text-destructive font-semibold hover:bg-destructive/10 rounded-xl transition-colors"
                >
                  Sign out
                </button>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="block px-4 py-3 text-foreground font-semibold hover:bg-foreground/5 rounded-xl transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth/register"
                    className="block px-4 py-3 text-primary font-bold hover:bg-foreground/5 rounded-xl transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              )}

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3 sm:hidden">
                <span className="px-4 text-sm font-semibold text-foreground/70">Appearance</span>
                <ThemeToggle />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{ scaleX: progress }}
        className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
      >
        <div className="w-full h-full bg-gradient-to-r from-[hsl(var(--aura-1))] via-[hsl(var(--aura-2))] to-[hsl(var(--aura-4))]" />
      </motion.div>
    </header>
  );
}
