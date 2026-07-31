'use client';

import { addComment, deleteComment } from '@/app/actions';
import {
  type CommentRow,
  buildThreads,
  commentAuthorName,
  formatCommentDate,
  removeWithReplies,
} from '@/lib/comments';
import { CornerDownRight, ExternalLink, MessageCircle, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

export interface ModRow {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  author: string;
  trackId: string;
  trackTitle: string;
  trackSlug: string;
}

export function CommentModeration({ rows }: { rows: ModRow[] }) {
  const [items, setItems] = useState<ModRow[]>(rows);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [pending, startTransition] = useTransition();

  const threads = useMemo(() => buildThreads(items), [items]);

  function submitReply(e: FormEvent, root: ModRow) {
    e.preventDefault();
    const body = replyText.trim();
    if (!body) return;

    startTransition(async () => {
      const res = await addComment(root.trackId, body, root.id);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      const c = res.comment as CommentRow;
      setItems((prev) => [
        {
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          parent_id: root.id,
          author: commentAuthorName(c.author),
          trackId: root.trackId,
          trackTitle: root.trackTitle,
          trackSlug: root.trackSlug,
        },
        ...prev,
      ]);
      setReplyText('');
      setReplyTo(null);
      toast.success('Reply posted');
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteComment(id);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      setItems((prev) => removeWithReplies(prev, id));
      toast.success('Comment deleted');
    });
  }

  if (threads.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-foreground font-bold mb-1">No comments yet</p>
        <p className="text-muted-foreground text-sm">
          Listener comments will show up here as they come in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {threads.map(({ root, replies }) => (
        <div key={root.id} className="glass-card rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <Link
              href={`/podcast/${root.trackSlug}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              {root.trackTitle}
              <ExternalLink className="w-3 h-3" />
            </Link>
            <time dateTime={root.created_at} className="text-xs text-muted-foreground shrink-0">
              {formatCommentDate(root.created_at)}
            </time>
          </div>

          <p className="text-sm font-semibold text-foreground">{root.author}</p>
          <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words leading-relaxed mt-1">
            {root.body}
          </p>

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => {
                setReplyTo(replyTo === root.id ? null : root.id);
                setReplyText('');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              {replyTo === root.id ? 'Cancel' : 'Reply as host'}
            </button>
            <button
              type="button"
              onClick={() => remove(root.id)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>

          {(replies.length > 0 || replyTo === root.id) && (
            <div className="mt-4 ml-2 pl-4 border-l-2 border-border space-y-3">
              {replies.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{r.author}</p>
                    <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words leading-relaxed mt-0.5">
                      {r.body}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <time dateTime={r.created_at} className="text-xs text-muted-foreground">
                      {formatCommentDate(r.created_at)}
                    </time>
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      disabled={pending}
                      aria-label="Delete reply"
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {replyTo === root.id && (
                <form onSubmit={(e) => submitReply(e, root)} className="flex gap-2 pt-1">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={2000}
                    placeholder={`Reply to ${root.author}…`}
                    className="flex-1 px-4 py-2.5 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    // biome-ignore lint/a11y/noAutofocus: revealed by an explicit Reply click
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={pending || !replyText.trim()}
                    aria-label="Post reply"
                    className="press px-4 py-2.5 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
