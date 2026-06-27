'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminListSupportTickets,
  type AdminSupportTicketRow,
} from '@/lib/support-tickets-api';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
  supportCategoryLabel,
  supportStatusLabel,
} from '@/lib/support-tickets';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string): string {
  if (status === 'NEW') return 'bg-red-100 text-red-800';
  if (status === 'WAITING_REPLY') return 'bg-amber-100 text-amber-900';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-900';
  if (status === 'WAITING_CUSTOMER') return 'bg-purple-100 text-purple-900';
  if (status === 'RESOLVED') return 'bg-green-100 text-green-800';
  return 'bg-zinc-100 text-zinc-700';
}

export default function AdminSupportCenterPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();

  const [rows, setRows] = useState<AdminSupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const query = useMemo(() => {
    const p: Record<string, string> = {};
    if (status) p.status = status;
    if (category) p.category = category;
    if (assignedToId) p.assignedToId = assignedToId;
    if (from) p.from = from;
    if (to) p.to = to;
    if (q.trim()) p.q = q.trim();
    return p;
  }, [status, category, assignedToId, from, to, q]);

  const refresh = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoading(true);
    setError(null);
    const data = await nestAdminListSupportTickets(apiAccessToken, query);
    setRows(data);
    setLoading(false);
  }, [apiAccessToken, query]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    if (assignedToId) params.set('assignedToId', assignedToId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/admin/komunikace/centrum-podpory');
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-orange-600 hover:underline">
          ← Administrace
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Centrum podpory</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Všechny dotazy z formuláře podpory portálu. Komunikace probíhá výhradně interně — bez
          odesílání e-mailů.
        </p>
      </div>

      <form
        onSubmit={applyFilters}
        className="mb-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Stav</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">Vše</option>
            {SUPPORT_TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Kategorie</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">Vše</option>
            {SUPPORT_TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Od data</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Do data</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-3">
          <span className="font-medium text-zinc-700">
            Vyhledávání (jméno, telefon, WhatsApp, e-mail, ID)
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Např. +420, ticket ID, jméno…"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-full bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Filtrovat
          </button>
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setCategory('');
              setAssignedToId('');
              setFrom('');
              setTo('');
              setQ('');
              router.replace('/admin/komunikace/centrum-podpory');
            }}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
          >
            Reset
          </button>
        </div>
      </form>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Jméno</th>
              <th className="px-3 py-2">Telefon</th>
              <th className="px-3 py-2">WhatsApp</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Kategorie</th>
              <th className="px-3 py-2">Předmět</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Přiřazeno</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  Načítám…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  Žádné dotazy.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/admin/komunikace/centrum-podpory/${row.id}`}
                      className="font-semibold text-[#e85d00] hover:underline"
                    >
                      {row.publicId}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {formatWhen(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {row.firstName} {row.lastName ?? ''}
                    {row.isRegistered ? (
                      <span className="ml-1 text-[10px] text-green-700">✓ účet</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.phone}</td>
                  <td className="px-3 py-2">{row.whatsapp}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{supportCategoryLabel(row.category)}</td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={row.subject}>
                    {row.subject}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                    >
                      {supportStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {row.assignedTo?.name ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
