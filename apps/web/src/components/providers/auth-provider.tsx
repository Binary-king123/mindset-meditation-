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
  resetPassword: (email: string) => Promise<void>;
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      const { data: roleData } = await supabase
        .rpc('get_user_role', { p_user_id: supabaseUser.id });

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        role: (roleData as UserRole) ?? 'user',
        is_premium: false, // Will be updated by subscription check
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

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw new Error(error.message);
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
