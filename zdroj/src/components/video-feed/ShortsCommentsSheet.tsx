'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { PostComment } from '@/lib/nest-client';

type Props = {
  open: boolean;
  onClose: () => void;
  comments: PostComment[];
  loading?: boolean;
  isLoggedIn: boolean;
  initialDraft?: string;
  onDraftChange?: (text: string) => void;
  onSubmit: (text: string) => Promise<{ ok: boolean; error?: string }>;
  onRequestSignup: (draft: string) => void;
};

export function ShortsCommentsSheet({
  open,
  onClose,
  comments,
  loading,
  isLoggedIn,
  initialDraft = '',
  onDraftChange,
  onSubmit,
  onRequestSignup,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) setDraft(initialDraft);
  }, [open, initialDraft]);

  if (!open) return null;

  const updateDraft = (text: string) => {
    setDraft(text);
    onDraftChange?.(text);
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!isLoggedIn) {
      onRequestSignup(text);
      return;
    }
    setSubmitting(true);
    const res = await onSubmit(text);
    setSubmitting(false);
    if (res.ok) {
      updateDraft('');
    }
  };

  const handleFocus = () => {
    if (!isLoggedIn) {
      onRequestSignup(draft);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center lg:items-stretch lg:justify-end" data-no-swipe>
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Zavřít komentáře"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(85dvh,640px)] w-full flex-col rounded-t-2xl bg-white shadow-2xl lg:my-8 lg:mr-8 lg:h-[min(88vh,calc(100dvh-4rem))] lg:max-h-none lg:w-[min(420px,38vw)] lg:rounded-2xl"
        role="dialog"
        aria-labelledby="shorts-comments-title"
        data-no-swipe
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id="shorts-comments-title" className="text-base font-bold text-zinc-900">
            Komentáře
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Zavřít"
            data-no-swipe
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-orange-600" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Zatím žádné komentáře.</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <p className="font-semibold text-zinc-800">{c.user?.name || 'Uživatel'}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-zinc-700">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-zinc-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => updateDraft(e.target.value)}
            onFocus={handleFocus}
            rows={2}
            placeholder={isLoggedIn ? 'Napište komentář…' : 'Napište komentář…'}
            className="w-full resize-none rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-400"
            data-no-swipe
          />
          <button
            type="button"
            data-no-swipe
            disabled={submitting || !draft.trim()}
            onClick={() => void handleSubmit()}
            className="mt-2 w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isLoggedIn ? 'Odeslat' : 'Pokračovat e-mailem'}
          </button>
        </div>
      </div>
    </div>
  );
}
