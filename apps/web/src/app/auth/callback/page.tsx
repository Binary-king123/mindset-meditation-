'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.push('/');
        router.refresh();
      }
    });

    // Handle code exchange for OAuth and magic link
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.push('/auth/login?error=callback_failed');
        }
      });
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg">
      <div className="text-center text-white">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-lg font-semibold">Signing you in...</p>
        <p className="text-white/60 text-sm mt-2">Please wait a moment</p>
      </div>
    </div>
  );
}
