import { LinksForm } from '@/components/admin/links-form';
import { getShow } from '@/lib/show';

export const dynamic = 'force-dynamic';

/**
 * Show-level "listen on" links. These are the fallback every episode inherits;
 * an episode only needs its own entry when its URL differs (edit-form.tsx).
 *
 * The form and the server action behind it already existed — this route did
 * not, so the links podcast/[slug] reads were unreachable from the UI.
 */
export default async function AdminLinksPage() {
  const { platformLinks } = await getShow();

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-1">Platform links</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Where the podcast can be listened to off-site. Episodes inherit these unless they set their
        own.
      </p>

      <LinksForm initial={platformLinks} />
    </div>
  );
}
