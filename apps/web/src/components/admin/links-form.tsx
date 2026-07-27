'use client';

// Where the podcast can be listened to off-site. One URL per app, for the show
// as a whole — individual episodes override these from the episode screen.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminUpdatePlatformLinks } from '@/app/actions';
import { PlatformLinkFields } from '@/components/admin/platform-link-fields';
import type { PlatformLinks } from '@/lib/platforms';

export function LinksForm({ initial }: { initial: PlatformLinks }) {
  const router = useRouter();
  const [links, setLinks] = useState<PlatformLinks>(initial);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await adminUpdatePlatformLinks({ platformLinks: links });
      if ('error' in res && res.error) throw new Error(res.error);
      toast.success('Links saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={save}>
      <PlatformLinkFields value={links} onChange={setLinks} />

      <button
        type="submit"
        disabled={busy}
        className="shine press px-6 py-3 bg-primary text-white rounded-full font-bold glow-primary disabled:opacity-50 flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save links
      </button>
    </form>
  );
}
