import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Upload, ListMusic, ArrowLeft, MessageCircle, BarChart3 } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { checkAdmin } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin/playlists', label: 'Manage', icon: ListMusic },
  { href: '/admin/upload', label: 'Upload', icon: Upload },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/comments', label: 'Comments', icon: MessageCircle },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    if (admin.reason === 'unauthenticated') redirect('/auth/login?redirect=/admin');
    if (admin.reason === 'forbidden') redirect('/');
    redirect('/auth/verify?redirect=/admin');
  }

  return (
    <div className="min-h-screen stream-shell">
      <header className="border-b border-white/10 bg-[hsl(252,38%,7%,0.92)] backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 min-h-20 py-3 flex flex-col gap-4 md:h-20 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-6 overflow-x-auto">
            <Link href="/admin" className="font-black text-lg whitespace-nowrap text-white">
              {BRAND.shortName} <span className="text-primary">admin</span>
            </Link>
            <nav className="flex items-center gap-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium text-white/65 hover:text-white hover:bg-white/5 whitespace-nowrap"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-white/65 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to site
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
