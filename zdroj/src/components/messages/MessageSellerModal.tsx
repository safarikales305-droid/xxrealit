'use client';

import { useEffect, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestGetOrCreateConversation,
  nestSendConversationMessage,
  NEST_MESSAGE_BODY_MAX,
} from '@/lib/nest-client';
import { dispatchMessagesChanged } from '@/hooks/use-messages-unread';
import { formatListingPriceCzk } from '@/types/property';

const PLACEHOLDER = 'Dobrý den, mám zájem o tento inzerát…';

type MessageSellerModalProps = {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  listingTitle: string;
  price: number | null;
  location: string;
  coverImageUrl: string | null;
  token: string | null;
  /** Po úspěšném odeslání (např. přesměrování na vlákno). */
  onSent?: (conversationId: string) => void;
};

export function MessageSellerModal({
  open,
  onClose,
  propertyId,
  listingTitle,
  price,
  location,
  coverImageUrl,
  token,
  onSent,
}: MessageSellerModalProps) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBody('');
      setError(null);
    }
  }, [open, propertyId]);

  if (!open) return null;

  const img = coverImageUrl ? nestAbsoluteAssetUrl(coverImageUrl) : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const trimmed = body.trim();
    if (!trimmed.length) {
      setError('Napište text zprávy.');
      return;
    }
    if (trimmed.length > NEST_MESSAGE_BODY_MAX) {
      setError(`Zpráva může mít maximálně ${NEST_MESSAGE_BODY_MAX} znaků.`);
      return;
    }
    setBusy(true);
    setError(null);
    const conv = await nestGetOrCreateConversation(token, propertyId);
    if (!conv.ok) {
      setBusy(false);
      setError(conv.error ?? 'Konverzaci se nepodařilo otevřít.');
      return;
    }
    const sent = await nestSendConversationMessage(token, conv.conversation.id, trimmed);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error ?? 'Odeslání se nezdařilo.');
      return;
    }
    dispatchMessagesChanged();
    onSent?.(conv.conversation.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-seller-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Zavřít"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-[1] w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 id="message-seller-title" className="text-base font-semibold text-zinc-900">
            Napsat prodejci
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose()}
            className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
          >
            Zavřít
          </button>
        </div>

        <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Inzerát
          </p>
          <div className="mt-2 flex gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-xs text-zinc-500">
                —
              </div>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{listingTitle}</p>
              <p className="mt-0.5 text-sm font-bold text-[#e85d00]">
                {formatListingPriceCzk(price)}
              </p>
              <p className="mt-0.5 truncate text-xs text-zinc-600">{location}</p>
            </div>
          </div>

          <form onSubmit={(ev) => void handleSubmit(ev)} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-zinc-800" htmlFor="seller-msg-body">
              Zpráva
            </label>
            <textarea
              id="seller-msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={NEST_MESSAGE_BODY_MAX}
              placeholder={PLACEHOLDER}
              disabled={busy}
              className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/25 focus:ring-2 disabled:bg-zinc-50"
            />
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                {body.trim().length}/{NEST_MESSAGE_BODY_MAX}
              </span>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !token}
              className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? 'Odesílám…' : 'Odeslat zprávu'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
