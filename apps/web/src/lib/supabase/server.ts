// Server (Server Component / Server Action / Route Handler) Supabase client.
// Reads & writes the auth cookies for the current request. Respects RLS as the
// signed-in user. Create a fresh one per request — never cache across requests.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createClient(): Promise<SupabaseClient<any, 'podcast'>> {
  const cookieStore = await cookies();

  return createServerClient<any, 'podcast'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'podcast' },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
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
