// Next.js middleware: refreshes the Supabase auth session on every request (so
// Server Components always see a valid session) and gates /admin/* on THREE
// conditions — signed in, holding the admin role, and having passed the
// verification-code second factor.
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_COOKIE } from '@/lib/admin-verify';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<any, 'podcast'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'podcast' },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token and refreshes cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAdminPage = path.startsWith('/admin');
  // Admin API routes verify the caller themselves; gating here as well means a
  // single missed check inside a handler can't expose one.
  const isAdminApi = path.startsWith('/api/admin');

  if (isAdminPage || isAdminApi) {
    if (!user) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }

    const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });
    if (role !== 'admin' && role !== 'super_admin') {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // The verification-code second factor is enforced in the Node runtime —
    // app/admin/layout.tsx for pages, and each /api/admin route — because the
    // signing secret is NOT available inside Edge middleware. Next does not
    // inline non-public env vars into the Edge bundle, so doing the HMAC here
    // throws at runtime in a standalone build.
    // A cheap presence check still short-circuits the obvious case.
    if (!request.cookies.get(ADMIN_COOKIE)) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Admin verification required' }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/auth/verify';
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|woff2?)$).*)',
  ],
};
