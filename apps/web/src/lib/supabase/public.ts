// Anonymous, cookie-less Supabase client for public data.
//
// The cookie-reading client in ./server.ts makes its caller dynamic — Next
// treats any cookies() access as a signal that the page cannot be cached. The
// homepage is the one page search engines index, so it must stay cacheable;
// everything it reads (published episodes, categories, the show record) is
// public under RLS anyway, so no session is needed to fetch it.
//
// Safe to share across requests precisely because it carries no session.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { PodcastClient, PodcastDatabase } from '@/lib/supabase/types';

let client: PodcastClient | undefined;

export function createPublicClient(): PodcastClient {
  if (!client) {
    client = createSupabaseClient<PodcastDatabase, 'podcast'>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: 'podcast' },
        // No session to persist or refresh — this client is never a user.
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return client;
}
