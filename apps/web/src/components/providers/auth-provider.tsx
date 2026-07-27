'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { AuthUser, UserRole } from '@mindset/types';
import { useRouter } from 'next/navigation';
import { clearAdminVerification } from '@/app/auth/actions';

// Sign-in and sign-up live in server actions (see app/auth/actions.ts) so a
// username can be resolved to an email without exposing it to the browser.
// This provider only exposes session state and sign-out.
interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await loadUserProfile(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserProfile(supabaseUser: User) {
    try {
      // One round-trip, not two. `role` is a column on profiles and the
      // profiles_select_own RLS policy already lets a user read their own row,
      // so the separate get_user_role RPC this used to make was pure latency —
      // and it sat in front of the navbar rendering on every page load.
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        role: (profile?.role as UserRole) ?? 'user',
        profile: profile ?? undefined,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    // Drop the admin second-factor cookie too, so the code is required again.
    await clearAdminVerification().catch(() => {});
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    router.push('/');
    router.refresh();
  }

  // Password reset lives in a server action (requestPasswordResetAction), not
  // here: the link is minted with the service role and delivered over our own
  // SMTP rather than Supabase's built-in sender.

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
