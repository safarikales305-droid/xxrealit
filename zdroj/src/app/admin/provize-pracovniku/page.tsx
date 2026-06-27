'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminUpdateWorkerProfile,
  nestAdminWorkersCommissionOverview,
  type WorkerCommissionOverviewRow,
} from '@/lib/nest-client';

type RowDraft = WorkerCommissionOverviewRow & {
  draftPercent: string;
  draftMaxBonus: string;
  draftCanBonus: boolean;
  saving?: boolean;
  saved?: boolean;
  error?: string;
};

export default function AdminWorkerCommissionsPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const data = await nestAdminWorkersCommissionOverview(apiAccessToken);
    if (data.error) setLoadError(data.error);
    setRows(
      data.items.map((w) => ({
        ...w,
        draftPercent: w.commissionPercent != null ? String(w.commissionPercent) : '10',
        draftMaxBonus: String(w.maxBonusPerClient ?? 3000),
        draftCanBonus: w.canAssignBonusCredits,
      })),
    );
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  function patchRow(id: string, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: RowDraft) {
    patchRow(row.id, { saving: true, error: undefined, saved: false });
    const payload: Record<string, unknown> = {
      commissionPercent: Number(row.draftPercent) || 0,
      maxBonusPerClient: Number(row.draftMaxBonus) || 0,
      canAssignBonusCredits: row.draftCanBonus,
    };
    const r = await nestAdminUpdateWorkerProfile(apiAccessToken, row.id, payload);
    if (!r.ok) {
      patchRow(row.id, { saving: false, error: r.error ?? 'Uložení selhalo' });
      return;
    }
    patchRow(row.id, {
      saving: false,
      saved: true,
      commissionPercent: Number(row.draftPercent) || 0,
      maxBonusPerClient: Number(row.draftMaxBonus) || 0,
      canAssignBonusCredits: row.draftCanBonus,
      estimatedCommission: r.worker
        ? r.worker.estimatedCommission
        : Math.floor((row.clientsPaidTopUp * (Number(row.draftPercent) || 0)) / 100),
    });
    window.setTimeout(() => patchRow(row.id, { saved: false }), 3000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Provize pracovníků</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Provize se počítá pouze z reálně zaplacených kreditů klientů (nikoli z bonusů).
          </p>
        </div>
        <a
          href="/api/nest/admin/portal-workers/commission-overview/export"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
        >
          Export CSV
        </a>
      </div>

      {loadError ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p> : null}
      {loading ? <p className="text-sm text-zinc-600">Načítám pracovníky…</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-zinc-600">Žádní pracovníci portálu.</p>
      ) : null}

      <div className="space-y-4">
        {rows.map((w) => (
          <div key={w.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">
                  <Link href={`/admin/pracovnici-portalu/${w.id}`} className="text-[#e85d00] hover:underline">
                    {w.name}
                  </Link>
                </p>
                <p className="text-sm text-zinc-600">{w.email}</p>
              </div>
              <p className="text-xs text-zinc-500">
                Klienti: {w.clientCount} · Dobití: {w.clientsPaidTopUp.toLocaleString('cs-CZ')} Kč · Provize:{' '}
                {w.estimatedCommission.toLocaleString('cs-CZ')} Kč
                {w.isActive ? '' : ' · neaktivní'}
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-medium text-zinc-600">
                Provize (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={w.draftPercent}
                  onChange={(e) => patchRow(w.id, { draftPercent: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                Limit bonusů / klient (Kč)
                <input
                  type="number"
                  min={0}
                  value={w.draftMaxBonus}
                  onChange={(e) => patchRow(w.id, { draftMaxBonus: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={w.draftCanBonus}
                  onChange={(e) => patchRow(w.id, { draftCanBonus: e.target.checked })}
                />
                Povolit bonusové kredity
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={w.saving}
                  onClick={() => void saveRow(w)}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {w.saving ? 'Ukládám…' : 'Uložit'}
                </button>
              </div>
            </div>

            {w.saved ? <p className="mt-2 text-xs text-emerald-700">Uloženo.</p> : null}
            {w.error ? <p className="mt-2 text-xs text-red-600">{w.error}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
