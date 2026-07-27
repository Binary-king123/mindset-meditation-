// Service-role Supabase client — BYPASSES RLS. Server-side only.
// Use only for privileged operations that can't run as the user, e.g. minting
// signed URLs for private audio after an explicit authorization check.
// Never import this into a client component.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { PodcastClient, PodcastDatabase } from '@/lib/supabase/types';

let adminClient: PodcastClient | undefined;

export function createAdminClient(): PodcastClient {
  if (adminClient) return adminClient;
  // Same project URL the browser uses — there is no separate server-side URL.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for the admin client',
    );
  }
  adminClient = createSupabaseClient<PodcastDatabase, 'podcast'>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'podcast' },
  });
  return adminClient;
}
