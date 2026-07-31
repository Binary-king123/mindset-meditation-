'use client';

/**
 * A styled stand-in for `window.confirm()`.
 *
 * The native dialog is chrome the browser draws, not the page — on Chrome it's
 * literally prefixed with "localhost:3100 says", which reads as a security
 * warning rather than part of this app. It also can't be themed, sized, or
 * given a real destructive-action button, and it blocks the JS thread while
 * open. This renders in the page itself, in a portal so it is never clipped by
 * a parent's overflow, and matches whichever theme is active.
 */
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. Off for a plain yes/no. */
  danger?: boolean;
  /** Disables both buttons and swaps the confirm label for a spinner. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Read through a ref inside the Escape handler rather than depending on
  // `busy`/`onCancel` directly: those change on every keystroke-adjacent
  // render, and re-running the effect each time would refocus the cancel
  // button out from under whatever the admin is doing.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };

  useEffect(() => {
    if (!open) return;
    // Cancel is the default focus target: a destructive dialog should not let
    // a stray Enter press confirm it.
    cancelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <button
        type="button"
        aria-label={cancelLabel}
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm motion-safe:animate-[fadeIn_0.15s_ease-out]"
      />
      <div
        className={cn(
          'glass-card relative w-full max-w-sm rounded-2xl border border-border p-6 shadow-2xl',
          'motion-safe:animate-[dialogIn_0.18s_ease-out]',
        )}
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="font-bold text-foreground leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="press rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-accent/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'press flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60',
              danger ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
