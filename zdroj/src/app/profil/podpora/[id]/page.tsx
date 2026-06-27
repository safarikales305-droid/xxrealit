'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchMySupportTicket,
  postMySupportMessage,
} from '@/lib/support-tickets-api';
import type { SupportTicket } from '@/lib/support-tickets';
import { supportCategoryLabel, supportStatusLabel } from '@/lib/support-tickets';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ProfilPodporaDetailPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken || !id) return;
    setLoading(true);
    const t = await fetchMySupportTicket(apiAccessToken, id);
    setTicket(t);
    setLoading(false);
    if (!t) setError('Dotaz nenalezen.');
  }, [apiAccessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/prihlaseni?redirect=${encodeURIComponent(`/profil/podpora/${id}`)}`);
    }
  }, [isAuthenticated, isLoading, router, id]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken || !ticket || !message.trim()) return;
    setBusy(true);
    setError(null);
    const r = await postMySupportMessage(apiAccessToken, ticket.id, message.trim());
    setBusy(false);
    if (r.ticket) {
      setTicket(r.ticket);
      setMessage('');
    } else {
      setError('Zprávu se nepodařilo odeslat.');
    }
  }

  if (isLoading || !isAuthenticated) {
    return <div className="px-4 py-12 text-center text-zinc-500">Načítám…</div>;
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-red-700">{error ?? 'Dotaz nenalezen.'}</p>
        <Link href="/profil/podpora" className="mt-4 inline-block text-[#e85d00] hover:underline">
          ← Zpět
        </Link>
      </div>
    );
  }

  const canReply = ticket.status !== 'CLOSED';

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <Link href="/profil/podpora" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Moje komunikace s podporou
        </Link>

        <div className="mt-4">
          <p className="font-mono text-xs text-zinc-500">{ticket.publicId}</p>
          <h1 className="mt-1 text-xl font-bold">{ticket.subject}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {supportCategoryLabel(ticket.category)} · {supportStatusLabel(ticket.status)}
          </p>
        </div>

        <ul className="mt-8 space-y-3">
          {ticket.messages
            .filter((m) => !m.isInternalNote)
            .map((m) => (
              <li
                key={m.id}
                className={`rounded-2xl border p-4 ${
                  m.authorType === 'STAFF'
                    ? 'border-orange-200 bg-orange-50/80'
                    : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex justify-between gap-2 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-800">
                    {m.authorType === 'STAFF' ? 'Podpora' : 'Vy'}
                  </span>
                  <time>{formatWhen(m.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{m.body}</p>
              </li>
            ))}
        </ul>

        {canReply ? (
          <form onSubmit={(e) => void onSend(e)} className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="block text-sm font-semibold text-zinc-900">Pokračovat v konverzaci</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
              className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Napište zprávu podpoře…"
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Odeslat
            </button>
          </form>
        ) : (
          <p className="mt-8 text-sm text-zinc-500">Tento dotaz je uzavřený. Pro nový problém použijte formulář podpory.</p>
        )}
      </div>
    </div>
  );
}
