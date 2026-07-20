// Browser (client-component) Supabase client.
// One shared instance per browser tab. Respects RLS as the signed-in user.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// All app tables live in the dedicated "podcast" schema.
let browserClient: SupabaseClient<any, 'podcast'> | undefined;

export function createClient(): SupabaseClient<any, 'podcast'> {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<any, 'podcast'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'podcast' } },
  );
  return browserClient;
}
