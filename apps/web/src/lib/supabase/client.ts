// Browser (client-component) Supabase client.
// One shared instance per browser tab. Respects RLS as the signed-in user.
import { createBrowserClient } from '@supabase/ssr';
// All app tables live in the dedicated "podcast" schema.
import type { PodcastClient, PodcastDatabase } from '@/lib/supabase/types';

export type { PodcastClient };

let browserClient: PodcastClient | undefined;

export function createClient(): PodcastClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<PodcastDatabase, 'podcast'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'podcast' } },
  );
  return browserClient;
}
