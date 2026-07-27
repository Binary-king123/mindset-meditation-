// The "is this caller an admin?" check, in one place.
//
// The admin layout and every /api/admin route were each repeating the same
// three steps — fetch the user, look up the role, verify the second-factor
// cookie — which meant three Supabase round-trips per admin page view and a
// 20-line preamble that had to stay in sync across files.
//
// React's cache() collapses repeat calls within a single request, so the layout
// and a route handler running in the same render share one result.
//
// Deliberately NOT in lib/admin-verify.ts: that module is imported by Edge
// middleware, and next/headers is not available there.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_COOKIE, adminIsVerified } from '@/lib/admin-verify';

export type AdminDenial = 'unauthenticated' | 'forbidden' | 'unverified';

export interface AdminCheck {
  ok: boolean;
  userId?: string;
  reason?: AdminDenial;
}

export const checkAdmin = cache(async (): Promise<AdminCheck> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };

  const { data: role } = await supabase.rpc('get_user_role', { p_user_id: user.id });
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, userId: user.id, reason: 'forbidden' };
  }

  // Second factor, checked here rather than in middleware because the signing
  // key is a non-public env var and Next does not expose those to the Edge
  // runtime — see the note in middleware.ts.
  const store = await cookies();
  const verified = await adminIsVerified(store.get(ADMIN_COOKIE)?.value, user.id);
  if (!verified) return { ok: false, userId: user.id, reason: 'unverified' };

  return { ok: true, userId: user.id };
});

/** HTTP status + message for an API route to return on a denial. */
export const ADMIN_DENIAL_RESPONSE: Record<AdminDenial, { status: number; error: string }> = {
  unauthenticated: { status: 401, error: 'Unauthorized' },
  forbidden: { status: 403, error: 'Forbidden' },
  unverified: { status: 403, error: 'Admin verification required' },
};
