// Server (Server Component / Server Action / Route Handler) Supabase client.
// Reads & writes the auth cookies for the current request. Respects RLS as the
// signed-in user. Create a fresh one per request — never cache across requests.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SESSION_ONLY_COOKIE, applySessionOnly, type CookieOptions } from '@/lib/supabase/cookie-options';
import type { PodcastClient, PodcastDatabase } from '@/lib/supabase/types';

export async function createClient(): Promise<PodcastClient> {
  const cookieStore = await cookies();
  // Set when the user signed in without "Remember me" — see cookie-options.ts.
  const sessionOnly = cookieStore.get(SESSION_ONLY_COOKIE)?.value === '1';

  return createServerClient<PodcastDatabase, 'podcast'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'podcast' },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, applySessionOnly(options, sessionOnly));
            }
          } catch {
            // Called from a Server Component (cookies are read-only there).
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
