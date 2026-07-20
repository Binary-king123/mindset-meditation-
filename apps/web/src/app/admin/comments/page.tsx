import { CommentModeration, type ModRow } from '@/components/admin/comment-moderation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminCommentsPage() {
  const supabase = await createClient();

  // Admin RLS on comments (migration 013) already exposes every comment,
  // including those on unpublished episodes.
  const { data } = await supabase
    .from('comments')
    .select(
      'id, body, created_at, user_id, parent_id, track:tracks(id, title, slug), author:profiles(full_name, username, email)',
    )
    .order('created_at', { ascending: false })
    .limit(300);

  const rows: ModRow[] = ((data ?? []) as Array<Record<string, any>>).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    parent_id: c.parent_id ?? null,
    author:
      c.author?.full_name || c.author?.username || c.author?.email?.split('@')[0] || 'Listener',
    trackId: c.track?.id ?? '',
    trackTitle: c.track?.title ?? 'Unknown episode',
    trackSlug: c.track?.slug ?? '',
  }));

  return (
    <div>
      <h1 className="text-2xl font-black text-foreground mb-1">Comments</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Every comment across all episodes. Reply as the host, or remove anything that
        doesn&apos;t belong.
      </p>
      <CommentModeration rows={rows} />
    </div>
  );
}
