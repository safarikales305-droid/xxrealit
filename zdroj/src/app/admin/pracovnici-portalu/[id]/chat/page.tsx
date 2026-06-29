'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchAdminWorkerMessages,
  markAdminWorkerMessagesRead,
  sendAdminWorkerMessage,
  type WorkerInternalMessageRow,
} from '@/lib/portal-worker-communication-api';
import { nestAdminGetWorkerDetail } from '@/lib/nest-client';

export default function AdminWorkerChatPage() {
  const params = useParams();
  const userId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [workerName, setWorkerName] = useState('');
  const [messages, setMessages] = useState<WorkerInternalMessageRow[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [detail, chat] = await Promise.all([
      nestAdminGetWorkerDetail(apiAccessToken, userId),
      fetchAdminWorkerMessages(apiAccessToken, userId),
    ]);
    if (detail.worker) setWorkerName(detail.worker.name);
    setMessages(chat.messages ?? []);
    if (chat.unreadFromWorker) {
      await markAdminWorkerMessagesRead(apiAccessToken, userId);
    }
  }, [apiAccessToken, userId]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || !userId) return;
    setBusy(true);
    setErr(null);
    const r = await sendAdminWorkerMessage(apiAccessToken, userId, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Odeslání selhalo');
      return;
    }
    setText('');
    if (r.message) {
      setMessages((prev) => [...prev, r.message as WorkerInternalMessageRow]);
    } else {
      await load();
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/admin/pracovnici-portalu/${userId}`} className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Detail pracovníka
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Chat — {workerName || 'pracovník'}</h1>
        <p className="text-sm text-zinc-600">Interní komunikace admin ↔ pracovník</p>
      </div>

      <div className="flex h-[60vh] flex-col rounded-xl border border-zinc-200 bg-white">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">Zatím žádné zprávy.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.senderRole === 'ADMIN'
                    ? 'ml-auto bg-orange-100 text-zinc-900'
                    : 'mr-auto bg-zinc-100 text-zinc-900'
                }`}
              >
                <p className="text-xs font-semibold text-zinc-500">
                  {m.senderName} · {new Date(m.createdAt).toLocaleString('cs-CZ')}
                  {!m.read && m.senderRole === 'WORKER' ? ' · nepřečteno' : ''}
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
              placeholder="Napište interní zprávu…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void send()}
              className="self-end rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Odesílám…' : 'Odeslat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
