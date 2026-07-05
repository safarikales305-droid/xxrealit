'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminGameLeadUpdateStatus,
  nestAdminGameLeads,
  nestAdminGameLeadsMarkSeen,
  nestAdminRegistrationGamificationDeleteLeads,
  nestAdminRegistrationGamificationExportCsv,
  type GameLeadStatus,
  type RegistrationGamificationLeadRow,
} from '@/lib/nest-client';

const STATUS_LABELS: Record<GameLeadStatus, string> = {
  NEW: 'Nový',
  SEEN: 'Zobrazený',
  CONTACTED: 'Kontaktován',
  REGISTERED: 'Registrován',
  INVALID: 'Neplatný',
};

const STATUS_CLASS: Record<GameLeadStatus, string> = {
  NEW: 'bg-red-100 text-red-800',
  SEEN: 'bg-zinc-100 text-zinc-700',
  CONTACTED: 'bg-blue-100 text-blue-800',
  REGISTERED: 'bg-emerald-100 text-emerald-800',
  INVALID: 'bg-amber-100 text-amber-800',
};

export default function AdminGamificationLeadsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [items, setItems] = useState<RegistrationGamificationLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [visitorType, setVisitorType] = useState('');
  const [statusFilter, setStatusFilter] = useState<GameLeadStatus | ''>('');
  const [registered, setRegistered] = useState<boolean | undefined>(undefined);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [markedSeen, setMarkedSeen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminGameLeads(token, {
      search: search.trim() || undefined,
      visitorType: visitorType.trim() || undefined,
      status: statusFilter || undefined,
      registered,
      skip: 0,
      take: 100,
    });
    setItems(data?.items ?? []);
    setTotal(data?.total ?? 0);
  }, [token, search, visitorType, statusFilter, registered]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN' || markedSeen) return;
    void nestAdminGameLeadsMarkSeen(token).then(() => {
      setMarkedSeen(true);
      void load();
    });
  }, [token, user?.role, markedSeen, load]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN' && markedSeen) void load();
  }, [token, user?.role, load, markedSeen]);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  async function changeStatus(id: string, status: GameLeadStatus) {
    if (!token) return;
    setBusy(true);
    await nestAdminGameLeadUpdateStatus(token, id, status);
    setBusy(false);
    void load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/admin/marketing/gamifikace-registrace" className="text-sm font-bold text-[#e85d00]">
              ← Gamifikace
            </Link>
            <h1 className="text-lg font-bold">Leady z her</h1>
          </div>
          <span className="text-sm text-zinc-600">Celkem: {total}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat…"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <select
            value={visitorType}
            onChange={(e) => setVisitorType(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">Typ (vše)</option>
            <option value="BUYER">Kupující</option>
            <option value="INVESTOR">Investor</option>
            <option value="AGENT">Makléř</option>
            <option value="DEVELOPER">Developer</option>
            <option value="MIXED">Smíšený</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as GameLeadStatus | '')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">Stav (vše)</option>
            {(Object.keys(STATUS_LABELS) as GameLeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-bold"
            onClick={() => setRegistered(registered === true ? undefined : true)}
          >
            Registrovaní
          </button>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-bold"
            onClick={() => void load()}
          >
            Obnovit
          </button>
          <button
            type="button"
            className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900"
            onClick={async () => {
              if (!token) return;
              const r = await nestAdminRegistrationGamificationExportCsv(token, {
                search: search.trim() || undefined,
                visitorType: visitorType.trim() || undefined,
                registered,
              });
              if (r.ok && r.blob) {
                const url = URL.createObjectURL(r.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'gamification-leads.csv';
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0 || !token}
            className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 disabled:opacity-50"
            onClick={async () => {
              if (!token || selectedIds.length === 0) return;
              setBusy(true);
              await nestAdminRegistrationGamificationDeleteLeads(token, selectedIds);
              setBusy(false);
              setSelected({});
              void load();
            }}
          >
            Smazat vybrané
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2"> </th>
                <th className="px-3 py-2">Jméno</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Typ</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2">Body</th>
                <th className="px-3 py-2">Zdroj</th>
                <th className="px-3 py-2">Reg.</th>
                <th className="px-3 py-2">Datum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const status = (row.status || 'NEW') as GameLeadStatus;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-100 ${status === 'NEW' ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[row.id])}
                        onChange={(e) => setSelected((p) => ({ ...p, [row.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-2">{row.fullName || row.companyName || '—'}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.phone || '—'}</td>
                    <td className="px-3 py-2">{row.visitorType}</td>
                    <td className="px-3 py-2">
                      <select
                        value={status}
                        disabled={busy}
                        onChange={(e) => void changeStatus(row.id, e.target.value as GameLeadStatus)}
                        className={`rounded-full px-2 py-1 text-xs font-bold ${STATUS_CLASS[status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as GameLeadStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.score}</td>
                    <td className="px-3 py-2 text-xs">{row.utmSource || row.visitSource || '—'}</td>
                    <td className="px-3 py-2">{row.registered ? 'Ano' : 'Ne'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {new Date(row.createdAt).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
