import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Upload,
  ListMusic,
  ArrowLeft,
  LayoutDashboard,
  MessageCircle,
  BarChart3,
} from 'lucide-react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { BRAND } from '@/lib/brand';
import { ADMIN_COOKIE, adminIsVerified } from '@/lib/admin-verify';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/admin');

  const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });
  if (role !== 'admin' && role !== 'super_admin') redirect('/');

  // Second factor. Verified here rather than in middleware: the HMAC key is a
  // non-public env var, which Next does not expose to the Edge runtime.
  const store = await cookies();
  const verified = await adminIsVerified(store.get(ADMIN_COOKIE)?.value, user.id);
  if (!verified) redirect('/auth/verify?redirect=/admin');

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-black text-lg whitespace-nowrap">
              {BRAND.shortName} <span className="text-primary">admin</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/admin"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
              <Link
                href="/admin/upload"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <Upload className="w-4 h-4" />
                Upload
              </Link>
              <Link
                href="/admin/podcasts"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <ListMusic className="w-4 h-4" />
                Manage
              </Link>
              <Link
                href="/admin/analytics"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </Link>
              <Link
                href="/admin/comments"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <MessageCircle className="w-4 h-4" />
                Comments
              </Link>
            </nav>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
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
