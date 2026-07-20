'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { Trash2, Send, CornerDownRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { addComment, deleteComment } from '@/app/actions';
import { buildThreads, formatCommentDate, removeWithReplies } from '@/lib/comments';
import { cn } from '@/lib/utils';

export interface CommentItem {
  id: string;
  body: string;
  created_at: string;
  author: string;
  mine: boolean;
  parent_id?: string | null;
  /** Author is staff — renders the "Host" badge. */
  isAdmin?: boolean;
}

function Avatar({ name, isAdmin }: { name: string; isAdmin?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 w-8 h-8 rounded-full grid place-items-center text-xs font-bold',
        isAdmin ? 'bg-primary text-white' : 'bg-primary/15 text-primary',
      )}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function Comments({
  trackId,
  initial,
  canComment,
  isAdmin = false,
}: {
  trackId: string;
  initial: CommentItem[];
  canComment: boolean;
  isAdmin?: boolean;
}) {
  const [items, setItems] = useState<CommentItem[]>(initial);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [pending, startTransition] = useTransition();

  const threads = useMemo(() => buildThreads(items), [items]);

  function post(body: string, parentId: string | null, onDone: () => void) {
    startTransition(async () => {
      const res = await addComment(trackId, body, parentId);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      setItems((prev) => [res.comment as CommentItem, ...prev]);
      onDone();
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    post(body, null, () => setText(''));
  }

  function submitReply(e: FormEvent, parentId: string) {
    e.preventDefault();
    const body = replyText.trim();
    if (!body) return;
    post(body, parentId, () => {
      setReplyText('');
      setReplyTo(null);
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
    });
  }

  const inputClass =
    'flex-1 px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all';

  function CommentBody({ c, isReply = false }: { c: CommentItem; isReply?: boolean }) {
    return (
      <div className={cn('glass-card rounded-xl p-4', isReply && 'bg-card/50')}>
        <div className="flex items-start gap-3">
          <Avatar name={c.author} isAdmin={c.isAdmin} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm text-foreground truncate">{c.author}</span>
                {c.isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                    <ShieldCheck className="w-3 h-3" />
                    Host
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <time dateTime={c.created_at} className="text-xs text-muted-foreground">
                  {formatCommentDate(c.created_at)}
                </time>
                {(c.mine || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={pending}
                    aria-label="Delete comment"
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words leading-relaxed">
              {c.body}
            </p>

            {!isReply && canComment && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyText('');
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
              >
                <CornerDownRight className="w-3.5 h-3.5" />
                {replyTo === c.id ? 'Cancel' : 'Reply'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {canComment ? (
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="Share how this session landed…"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            aria-label="Post comment"
            className="press px-4 py-3 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">Sign in to join the conversation.</p>
      )}

      <div className="space-y-4">
        {threads.length === 0 && (
          <p className="text-muted-foreground text-sm">No comments yet. Be the first!</p>
        )}

        {threads.map(({ root, replies }) => (
          <div key={root.id}>
            <CommentBody c={root} />

            {(replies.length > 0 || replyTo === root.id) && (
              <div className="mt-2 ml-5 pl-4 border-l-2 border-border space-y-2">
                {replies.map((r) => (
                  <CommentBody key={r.id} c={r} isReply />
                ))}

                {replyTo === root.id && (
                  <form onSubmit={(e) => submitReply(e, root.id)} className="flex gap-2 pt-1">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={2000}
                      placeholder={`Reply to ${root.author}…`}
                      className={inputClass}
                      // biome-ignore lint/a11y/noAutofocus: revealed by an explicit Reply click
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={pending || !replyText.trim()}
                      aria-label="Post reply"
                      className="press px-4 py-3 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 shrink-0"
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
    </div>
  );
}
