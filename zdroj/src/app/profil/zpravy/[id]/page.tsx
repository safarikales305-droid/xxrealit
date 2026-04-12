'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { dispatchMessagesChanged } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestConversationDetail,
  nestMarkConversationRead,
  nestSendConversationMessage,
  NEST_MESSAGE_BODY_MAX,
  type NestConversationDetail,
  type NestConversationDetailMessage,
} from '@/lib/nest-client';

const priceFmt = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfilZpravaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { user, isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const [detail, setDetail] = useState<NestConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const markedRead = useRef(false);

  const load = useCallback(async () => {
    if (!apiAccessToken || !id) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const d = await nestConversationDetail(apiAccessToken, id);
    setLoading(false);
    if (!d) {
      setLoadError('Konverzaci se nepodařilo načíst nebo k ní nemáte přístup.');
      setDetail(null);
      return;
    }
    setDetail(d);
  }, [apiAccessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/prihlaseni?redirect=${encodeURIComponent(`/profil/zpravy/${id}`)}`);
    }
  }, [id, isAuthenticated, isLoading, router]);

  useEffect(() => {
    markedRead.current = false;
  }, [id]);

  useEffect(() => {
    if (!apiAccessToken || !id || !detail || markedRead.current) return;
    markedRead.current = true;
    void nestMarkConversationRead(apiAccessToken, id).then((r) => {
      if (r.ok) dispatchMessagesChanged();
    });
  }, [apiAccessToken, detail, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken || !id) return;
    const trimmed = body.trim();
    if (!trimmed.length) {
      setSendError('Napište text zprávy.');
      return;
    }
    setSendBusy(true);
    setSendError(null);
    const res = await nestSendConversationMessage(apiAccessToken, id, trimmed);
    setSendBusy(false);
    if (!res.ok) {
      setSendError(res.error ?? 'Odeslání se nezdařilo.');
      return;
    }
    setBody('');
    const m: NestConversationDetailMessage = {
      id: res.message.id,
      body: res.message.body,
      senderId: res.message.senderId,
      createdAt: res.message.createdAt,
      readAt: null,
    };
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, m],
          }
        : prev,
    );
    dispatchMessagesChanged();
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  const cover = detail?.property.imageUrl
    ? nestAbsoluteAssetUrl(detail.property.imageUrl)
    : '';
  const counterpartName =
    detail?.counterpart.name?.trim() ||
    detail?.counterpart.email?.trim() ||
    'Prodejce';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#fafafa] text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/profil/zpravy"
            className="text-sm font-semibold text-[#e85d00] hover:underline"
          >
            ← Zprávy
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4 sm:px-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Načítám konverzaci…</p>
        ) : loadError || !detail ? (
          <p className="text-sm text-red-600">{loadError ?? 'Konverzace nenalezena.'}</p>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Inzerát
              </p>
              <div className="mt-2 flex gap-3">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
                    —
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900">{detail.property.title}</p>
                  <p className="text-sm font-bold text-[#e85d00]">
                    {priceFmt.format(detail.property.price)}
                  </p>
                  <p className="text-xs text-zinc-600">{detail.property.city}</p>
                  <Link
                    href={`/nemovitost/${detail.property.id}`}
                    className="mt-2 inline-block text-xs font-semibold text-[#e85d00] hover:underline"
                  >
                    Otevřít inzerát
                  </Link>
                </div>
              </div>
              <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
                Konverzace s: <span className="font-medium text-zinc-900">{counterpartName}</span>
              </p>
            </div>

            <div className="mt-4 flex-1 space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
              {detail.messages.length === 0 ? (
                <p className="text-sm text-zinc-500">Zatím žádné zprávy.</p>
              ) : (
                detail.messages.map((m) => {
                  const mine = user?.id === m.senderId;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? 'bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-white'
                            : 'bg-zinc-100 text-zinc-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            mine ? 'text-white/80' : 'text-zinc-500'
                          }`}
                        >
                          {formatWhen(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(ev) => void handleSend(ev)}
              className="mt-4 border-t border-zinc-200 bg-[#fafafa] pb-6 pt-4"
            >
              <label className="sr-only" htmlFor="thread-reply">
                Odpověď
              </label>
              <textarea
                id="thread-reply"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={NEST_MESSAGE_BODY_MAX}
                disabled={sendBusy}
                placeholder="Napište zprávu…"
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500/25 focus:ring-2 disabled:bg-zinc-50"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">
                  {body.trim().length}/{NEST_MESSAGE_BODY_MAX}
                </span>
                <button
                  type="submit"
                  disabled={sendBusy || !apiAccessToken}
                  className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {sendBusy ? 'Odesílám…' : 'Odeslat'}
                </button>
              </div>
              {sendError ? <p className="mt-2 text-sm text-red-600">{sendError}</p> : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
