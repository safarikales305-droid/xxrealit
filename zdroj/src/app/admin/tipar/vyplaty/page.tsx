'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  TIPAR_PAYOUT_STATUS_LABEL,
  fetchAdminTiparPayouts,
  updateAdminTiparPayoutStatus,
  type TiparPayoutAdminRow,
} from '@/lib/tipar-payout-api';

const STATUS_FILTERS = ['', 'PENDING', 'APPROVED', 'REJECTED', 'PAID'] as const;

function formatKc(value: number) {
  return `${value.toLocaleString('cs-CZ')} Kč`;
}

export default function AdminTiparPayoutsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<TiparPayoutAdminRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchAdminTiparPayouts(statusFilter || undefined));
  }, [statusFilter]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    setErr(null);
    setMsg(null);
    const r = await updateAdminTiparPayoutStatus(id, status, notes[id]);
    setBusyId(null);
    if (!r.ok) {
      setErr(r.error ?? 'Akce selhala');
      return;
    }
    setMsg('Stav žádosti byl aktualizován.');
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/tipar" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Tipaři
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Žádosti o výplatu tipařů</h1>
        <p className="text-sm text-zinc-600">Schvalování a evidence výplat skutečného výdělku z tipů.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              statusFilter === s ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white'
            }`}
          >
            {s ? (TIPAR_PAYOUT_STATUS_LABEL[s] ?? s) : 'Vše'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Uživatel</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Kontakt</th>
              <th className="px-3 py-2">Účet</th>
              <th className="px-3 py-2">Částka</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{row.userName}</div>
                  <div className="text-xs text-zinc-500">{row.userEmail}</div>
                </td>
                <td className="px-3 py-3 text-xs">{row.userRole}</td>
                <td className="px-3 py-3 text-xs">{row.userPhone ?? '—'}</td>
                <td className="px-3 py-3 text-xs font-mono">{row.bankAccount ?? '—'}</td>
                <td className="px-3 py-3 font-semibold">{formatKc(row.amount)}</td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold">
                    {TIPAR_PAYOUT_STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-zinc-500">
                  {new Date(row.requestedAt).toLocaleString('cs-CZ')}
                </td>
                <td className="px-3 py-3 min-w-[220px]">
                  <textarea
                    value={notes[row.id] ?? row.adminNote ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                    rows={2}
                    placeholder="Poznámka admina"
                    className="mb-2 w-full rounded border px-2 py-1 text-xs"
                  />
                  <div className="flex flex-wrap gap-1">
                    {row.status === 'PENDING' || row.status === 'APPROVED' ? (
                      <>
                        {row.status === 'PENDING' ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void setStatus(row.id, 'APPROVED')}
                            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
                          >
                            Schválit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setStatus(row.id, 'PAID')}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Vyplaceno
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setStatus(row.id, 'REJECTED')}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Zamítnout
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400">Uzavřeno</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Žádné žádosti v tomto filtru.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
