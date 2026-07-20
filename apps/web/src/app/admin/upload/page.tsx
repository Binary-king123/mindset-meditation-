import {
  UploadForm,
  type PlaylistOption,
  type CategoryOption,
} from '@/components/admin/upload-form';
import { Cloud, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { audioBackend } from '@/lib/audio-storage';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: playlists }] = await Promise.all([
    supabase.from('categories').select('id, name, icon').is('deleted_at', null).order('sort_order'),
    supabase
      .from('playlists')
      .select('id, title')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const backend = audioBackend();

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-1">Upload a podcast</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Every episode belongs to a playlist so listeners can follow a series.
      </p>

      {/* Makes it unambiguous where the audio is going to land. */}
      <div
        className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-8 text-sm border ${
          backend === 'r2'
            ? 'bg-primary/8 border-primary/30 text-foreground'
            : 'bg-amber-500/10 border-amber-500/30 text-foreground'
        }`}
      >
        {backend === 'r2' ? (
          <Cloud className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        )}
        <p className="leading-relaxed">
          {backend === 'r2' ? (
            <>
              Audio uploads go to <strong>Cloudflare R2</strong>. Only the object key is stored in
              Supabase.
            </>
          ) : (
            <>
              <strong>Cloudflare R2 is not configured</strong>, so audio is going to the private
              Supabase Storage bucket instead. To use R2, set{' '}
              <code className="text-xs">R2_ACCOUNT_ID</code>,{' '}
              <code className="text-xs">R2_ACCESS_KEY_ID</code>,{' '}
              <code className="text-xs">R2_SECRET_ACCESS_KEY</code> and{' '}
              <code className="text-xs">R2_BUCKET</code> in the project&apos;s{' '}
              <code className="text-xs">.env</code> and restart — uploads switch over
              automatically, no code change.
            </>
          )}
        </p>
      </div>
      <UploadForm
        categories={(categories ?? []) as CategoryOption[]}
        playlists={(playlists ?? []) as PlaylistOption[]}
      />
    </div>
  );
}
