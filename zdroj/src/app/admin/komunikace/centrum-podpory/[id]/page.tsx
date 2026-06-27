'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminGetSupportTicket,
  nestAdminReplySupportTicket,
  nestAdminUpdateSupportTicket,
} from '@/lib/support-tickets-api';
import { nestAdminListPortalWorkers, type PortalWorkerRow } from '@/lib/nest-client';
import type { SupportTicket } from '@/lib/support-tickets';
import {
  SUPPORT_TICKET_STATUSES,
  supportCategoryLabel,
  supportStatusLabel,
} from '@/lib/support-tickets';

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

export default function AdminSupportTicketDetailPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [workers, setWorkers] = useState<PortalWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken || !id) return;
    setLoading(true);
    const [t, w] = await Promise.all([
      nestAdminGetSupportTicket(apiAccessToken, id),
      nestAdminListPortalWorkers(apiAccessToken),
    ]);
    setTicket(t);
    setWorkers(w.items ?? []);
    setLoading(false);
    if (!t) setError('Ticket nenalezen.');
  }, [apiAccessToken, id]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  async function onStatusChange(status: string) {
    if (!apiAccessToken || !ticket) return;
    setBusy(true);
    const r = await nestAdminUpdateSupportTicket(apiAccessToken, ticket.id, {
      status,
    });
    setBusy(false);
    if (r.ticket) setTicket(r.ticket);
    else setError('Stav se nepodařilo uložit.');
  }

  async function onAssignChange(assignedToId: string) {
    if (!apiAccessToken || !ticket) return;
    setBusy(true);
    const r = await nestAdminUpdateSupportTicket(apiAccessToken, ticket.id, {
      assignedToId: assignedToId || null,
    });
    setBusy(false);
    if (r.ticket) setTicket(r.ticket);
    else setError('Přiřazení se nepodařilo uložit.');
  }

  async function sendReply(isInternal: boolean) {
    if (!apiAccessToken || !ticket) return;
    const body = isInternal ? internalNote.trim() : reply.trim();
    if (!body) return;
    setBusy(true);
    const r = await nestAdminReplySupportTicket(apiAccessToken, ticket.id, body, isInternal);
    setBusy(false);
    if (r.ticket) {
      setTicket(r.ticket);
      if (isInternal) setInternalNote('');
      else setReply('');
    } else {
      setError('Odpověď se nepodařilo odeslat.');
    }
  }

  if (loading) {
    return <div className="px-4 py-12 text-center text-zinc-500">Načítám ticket…</div>;
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-red-700">{error ?? 'Ticket nenalezen.'}</p>
        <Link href="/admin/komunikace/centrum-podpory" className="mt-4 inline-block text-orange-600 hover:underline">
          ← Zpět na seznam
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/admin/komunikace/centrum-podpory"
        className="text-sm text-orange-600 hover:underline"
      >
        ← Centrum podpory
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-zinc-500">{ticket.publicId}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">{ticket.subject}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {supportCategoryLabel(ticket.category)} · vytvořeno {formatWhen(ticket.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={ticket.status}
            disabled={busy}
            onChange={(e) => void onStatusChange(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            {SUPPORT_TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={ticket.assignedToId ?? ''}
            disabled={busy}
            onChange={(e) => void onAssignChange(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">Nepřiřazeno</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-zinc-900">Kontakt</h2>
          <dl className="mt-2 space-y-1 text-zinc-700">
            <div>
              <dt className="text-xs text-zinc-500">Jméno</dt>
              <dd>
                {ticket.firstName} {ticket.lastName ?? ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Telefon</dt>
              <dd>{ticket.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">WhatsApp</dt>
              <dd>{ticket.whatsapp}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">E-mail</dt>
              <dd>{ticket.email}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-zinc-900">Meta</h2>
          <dl className="mt-2 space-y-1 text-zinc-700">
            <div>
              <dt className="text-xs text-zinc-500">Stav</dt>
              <dd>{supportStatusLabel(ticket.status)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Uživatel</dt>
              <dd>
                {ticket.isRegistered && ticket.user ? (
                  <Link href={`/profil/${ticket.user.id}`} className="text-[#e85d00] hover:underline">
                    {ticket.user.name} ({ticket.user.email})
                  </Link>
                ) : (
                  'Neregistrovaný návštěvník'
                )}
              </dd>
            </div>
            {ticket.ipAddress ? (
              <div>
                <dt className="text-xs text-zinc-500">IP</dt>
                <dd className="font-mono text-xs">{ticket.ipAddress}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900">Historie komunikace</h2>
        <ul className="mt-4 space-y-3">
          {ticket.messages
            .filter((m) => !m.isInternalNote)
            .map((m) => (
              <li
                key={m.id}
                className={`rounded-2xl border p-4 ${
                  m.authorType === 'STAFF'
                    ? 'border-orange-200 bg-orange-50/60'
                    : m.authorType === 'SYSTEM'
                      ? 'border-zinc-200 bg-zinc-50'
                      : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-800">
                    {m.authorType === 'STAFF'
                      ? `Podpora${m.authorName ? `: ${m.authorName}` : ''}`
                      : m.authorType === 'CUSTOMER'
                        ? `${ticket.firstName} (zákazník)`
                        : 'Systém'}
                  </span>
                  <time>{formatWhen(m.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{m.body}</p>
              </li>
            ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Odpověď zákazníkovi</h2>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          placeholder="Napište odpověď…"
        />
        <button
          type="button"
          disabled={busy || !reply.trim()}
          onClick={() => void sendReply(false)}
          className="mt-3 rounded-full bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Odeslat odpověď
        </button>
      </section>

      <section className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Interní poznámka (vidí jen pracovníci)</h2>
        <textarea
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="Poznámka pro tým…"
        />
        <button
          type="button"
          disabled={busy || !internalNote.trim()}
          onClick={() => void sendReply(true)}
          className="mt-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50"
        >
          Uložit poznámku
        </button>
        {ticket.messages.some((m) => m.isInternalNote) ? (
          <ul className="mt-4 space-y-2 border-t border-zinc-200 pt-4">
            {ticket.messages
              .filter((m) => m.isInternalNote)
              .map((m) => (
                <li key={m.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <span className="text-xs text-amber-800">{formatWhen(m.createdAt)}</span>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
