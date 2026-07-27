// Shared comment helpers used by both the listener thread and the admin
// moderation list, so the two can't drift apart.

export interface ThreadedComment {
  id: string;
  created_at: string;
  parent_id?: string | null;
}

/** The profile columns a comment query embeds to label its author. */
export interface CommentAuthor {
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
}

/**
 * A row from a comments query with the author profile embedded.
 *
 * PostgREST types an embedded to-one relation as an array in some client
 * versions and an object in others, so both are accepted here — `commentAuthor`
 * below is the one place that has to care.
 */
export interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id?: string | null;
  author?: CommentAuthor | CommentAuthor[] | null;
}

/**
 * Display name for a comment, falling back through the profile columns and
 * finally to "Listener". Shared so the listener thread and the admin moderation
 * list always label the same person the same way.
 */
export function commentAuthorName(author: CommentRow['author']): string {
  const profile = Array.isArray(author) ? author[0] : author;
  return (
    profile?.full_name || profile?.username || profile?.email?.split('@')[0] || 'Listener'
  );
}

/**
 * Locale and timezone are pinned deliberately. A bare toLocaleDateString()
 * reads the runtime's defaults, which differ between the Node server and the
 * visitor's browser — that mismatch breaks hydration.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatCommentDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

/**
 * Groups a flat comment list into one level of nesting: top-level comments in
 * the order given, each with its replies oldest-first.
 */
export function buildThreads<T extends ThreadedComment>(
  items: T[],
): Array<{ root: T; replies: T[] }> {
  const byParent = new Map<string, T[]>();
  for (const c of items) {
    if (!c.parent_id) continue;
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return items
    .filter((c) => !c.parent_id)
    .map((root) => ({ root, replies: byParent.get(root.id) ?? [] }));
}

/**
 * Removes a comment and any replies to it — mirrors the ON DELETE CASCADE on
 * comments.parent_id so local state matches the database.
 */
export function removeWithReplies<T extends ThreadedComment>(items: T[], id: string): T[] {
  return items.filter((c) => c.id !== id && c.parent_id !== id);
}
