'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  AI_CHAT_QUICK_ACTIONS,
  createAiChatSession,
  fetchAiChatConfig,
  getStoredSessionId,
  requestAiChatContact,
  sendAiChatMessage,
  storeSessionId,
  submitAiChatFeedback,
  type AiChatMessage,
  type AiChatPropertyCard,
} from '@/lib/ai-chat-api';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { AiChatLauncher } from './AiChatLauncher';
import { FLOATING_Z } from '@/lib/floating-ui-geometry';

function detectPageType(path: string): string {
  if (path === '/') return 'HOME';
  if (path.startsWith('/nemovitost/')) return 'PROPERTY_DETAIL';
  if (path.startsWith('/makler/') || path.startsWith('/makleri')) return 'PUBLIC_PROFILE';
  if (path.startsWith('/admin')) return 'ADMIN';
  if (path.startsWith('/registrace')) return 'REGISTRATION';
  if (path.match(/^\/(prodej|pronajem)-/)) return 'SEO_PAGE';
  return 'PORTAL';
}

function PropertyCard({ item, isAuthenticated }: { item: AiChatPropertyCard; isAuthenticated: boolean }) {
  const price = item.priceHidden ? null : item.priceLabel ? Number.parseInt(item.priceLabel.replace(/\D/g, ''), 10) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {item.imageUrl ? (
        <div className="relative h-28 w-full bg-zinc-100">
          <Image src={item.imageUrl} alt={item.title} fill className="object-cover" unoptimized />
        </div>
      ) : null}
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</p>
        <p className="text-xs text-zinc-500">{item.city}{item.layout ? ` · ${item.layout}` : ''}{item.area ? ` · ${item.area} m²` : ''}</p>
        {item.priceHidden ? (
          <p className="text-xs text-zinc-500">Přesnou cenu uvidíte po přihlášení.</p>
        ) : (
          <ListingPriceDisplay price={price} isAuthenticated={isAuthenticated} className="text-sm" />
        )}
        <Link href={item.path} className="inline-block text-xs font-semibold text-orange-600 underline" target="_blank">
          Zobrazit inzerát
        </Link>
      </div>
    </div>
  );
}

export function AiChatWidget() {
  const pathname = usePathname() ?? '/';
  const { apiAccessToken, user } = useAuth();
  const isAuthenticated = Boolean(user);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', consentStorage: false, consentTransfer: false, consentContact: false });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    const pageType = detectPageType(pathname);
    void fetchAiChatConfig(pageType, pathname).then((cfg) => {
      if (cfg?.enabled) setEnabled(true);
    });
  }, [pathname]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ensureSession = useCallback(async () => {
    const existing = sessionId ?? getStoredSessionId();
    if (existing) {
      setSessionId(existing);
      return existing;
    }
    const pageType = detectPageType(pathname);
    const res = await createAiChatSession(
      { sourcePageType: pageType, sourceUrl: pathname },
      apiAccessToken,
    );
    storeSessionId(res.publicSessionId);
    setSessionId(res.publicSessionId);
    setMessages([res.greeting]);
    return res.publicSessionId;
  }, [apiAccessToken, pathname, sessionId]);

  async function handleOpen() {
    setOpen(true);
    setError(null);
    try {
      await ensureSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat nelze spustit.');
    }
  }

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    try {
      const sid = await ensureSession();
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'USER', content, createdAt: new Date().toISOString(), success: true }]);
      const res = await sendAiChatMessage(sid, content, apiAccessToken);
      setMessages((m) => [...m, res.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Odeslání selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFeedback(messageId: string, rating: 'UP' | 'DOWN') {
    if (!sessionId) return;
    try {
      await submitAiChatFeedback(sessionId, { messageId, rating }, apiAccessToken);
    } catch {
      /* ignore */
    }
  }

  async function handleContactSubmit() {
    if (!sessionId) return;
    setBusy(true);
    try {
      await requestAiChatContact(sessionId, contactForm, apiAccessToken);
      setShowContact(false);
      setMessages((m) => [
        ...m,
        {
          id: `sys-${Date.now()}`,
          role: 'ASSISTANT',
          content: 'Děkujeme. Váš kontakt byl uložen a předáme ho týmu XXREALIT.',
          createdAt: new Date().toISOString(),
          success: true,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kontakt se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || pathname.startsWith('/admin')) return null;

  return (
    <>
      <AiChatLauncher onOpen={() => void handleOpen()} busy={busy} hidden={open} />

      {open ? (
        <div
          className="fixed inset-0 z-[700] flex flex-col bg-white md:inset-auto md:bottom-6 md:right-6 md:h-[min(80vh,600px)] md:w-[min(100vw-2rem,400px)] md:rounded-2xl md:border md:border-zinc-200 md:shadow-2xl"
          style={{
            zIndex: FLOATING_Z.chatPanel,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          role="dialog"
          aria-label="AI chat XXREALIT"
        >
          <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="font-semibold text-zinc-900">AI průvodce XXREALIT</p>
              <p className="text-xs text-zinc-500">{busy ? 'Odpovídám…' : 'AI je dostupná'}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" aria-label="Zavřít chat">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length <= 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {AI_CHAT_QUICK_ACTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void handleSend(label)}
                    className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-800 hover:bg-orange-100"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {messages.map((m) => (
              <div key={m.id} className={m.role === 'USER' ? 'ml-8 text-right' : 'mr-8'}>
                <div
                  className={`inline-block rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'USER' ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-800'
                  }`}
                >
                  {m.content}
                </div>
                {m.role === 'ASSISTANT' && m.structuredPayload?.type === 'properties' && m.structuredPayload.items?.length ? (
                  <div className="mt-2 space-y-2">
                    {m.structuredPayload.items.map((p) => (
                      <PropertyCard key={p.id} item={p} isAuthenticated={isAuthenticated} />
                    ))}
                  </div>
                ) : null}
                {m.role === 'ASSISTANT' && !m.id.startsWith('local-') && !m.id.startsWith('sys-') ? (
                  <div className="mt-1 flex gap-2 text-xs text-zinc-400">
                    <button type="button" onClick={() => void handleFeedback(m.id, 'UP')} aria-label="Palec nahoru">👍</button>
                    <button type="button" onClick={() => void handleFeedback(m.id, 'DOWN')} aria-label="Palec dolů">👎</button>
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <p className="text-xs text-zinc-400">AI píše…</p> : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <div ref={bottomRef} />
          </div>

          <footer className="border-t border-zinc-100 p-3">
            <button
              type="button"
              onClick={() => setShowContact(true)}
              className="mb-2 w-full rounded-lg border border-zinc-200 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Chci mluvit s člověkem
            </button>
            {showContact ? (
              <div className="mb-2 space-y-2 rounded-lg border border-zinc-200 p-2 text-xs">
                <input value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jméno" className="w-full rounded border px-2 py-1" />
                <input value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="E-mail" className="w-full rounded border px-2 py-1" />
                <input value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Telefon" className="w-full rounded border px-2 py-1" />
                <label className="flex gap-1"><input type="checkbox" checked={contactForm.consentStorage} onChange={(e) => setContactForm((f) => ({ ...f, consentStorage: e.target.checked }))} />Souhlas s uložením kontaktu</label>
                <label className="flex gap-1"><input type="checkbox" checked={contactForm.consentTransfer} onChange={(e) => setContactForm((f) => ({ ...f, consentTransfer: e.target.checked }))} />Souhlas s předáním makléři / XXREALIT</label>
                <label className="flex gap-1"><input type="checkbox" checked={contactForm.consentContact} onChange={(e) => setContactForm((f) => ({ ...f, consentContact: e.target.checked }))} />Souhlas s kontaktováním</label>
                <button type="button" onClick={() => void handleContactSubmit()} className="w-full rounded bg-orange-600 py-1.5 text-white">Odeslat kontakt</button>
              </div>
            ) : null}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Napište zprávu…"
                className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                maxLength={2000}
                disabled={busy}
                aria-label="Zpráva do AI chatu"
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Odeslat
              </button>
            </form>
          </footer>
        </div>
      ) : null}
    </>
  );
}
