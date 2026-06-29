'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchWorkerMessages,
  markWorkerMessagesRead,
  replyWorkerMessage,
  type WorkerInternalMessageRow,
} from '@/lib/portal-worker-communication-api';

export default function WorkerMessagesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [messages, setMessages] = useState<WorkerInternalMessageRow[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetchWorkerMessages();
    setMessages(r.messages ?? []);
    if (r.unreadFromAdmin) await markWorkerMessagesRead();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PORTAL_WORKER') {
      router.replace('/');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr(null);
    const r = await replyWorkerMessage(body);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Odeslání selhalo');
      return;
    }
    setText('');
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Interní zprávy</h1>
        <p className="text-sm text-zinc-600">Komunikace s administrací portálu</p>
      </div>

      <div className="flex h-[60vh] flex-col rounded-xl border border-zinc-200 bg-white">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">Zatím žádné zprávy od administrace.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.senderRole === 'WORKER'
                    ? 'ml-auto bg-orange-100'
                    : 'mr-auto bg-zinc-100'
                }`}
              >
                <p className="text-xs font-semibold text-zinc-500">
                  {m.senderName} · {new Date(m.createdAt).toLocaleString('cs-CZ')}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-zinc-200 p-3">
          {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Vaše odpověď…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void send()}
              className="self-end rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Odeslat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
