'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

type CommissionRow = {
  id: string;
  workerName: string;
  referredUserName: string;
  amount: number;
  percent: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
};

type Settings = {
  defaultPercent: number;
  minTopUpAmount: number;
  validityDays: number;
  roleRates: Array<{ role: string; percent: number }>;
};

export default function AdminWorkerCommissionsPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<CommissionRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workerFilter, setWorkerFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!apiAccessToken || !API_BASE_URL) return;
    void (async () => {
      const qs = workerFilter ? `?workerId=${encodeURIComponent(workerFilter)}` : '';
      const [listRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/portal-workers/commissions${qs}`, {
          headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
        }),
        fetch(`${API_BASE_URL}/admin/portal-workers/commission-settings`, {
          headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
        }),
      ]);
      if (listRes.ok) {
        const data = (await listRes.json()) as { items: CommissionRow[] };
        setItems(data.items ?? []);
      }
      if (settingsRes.ok) setSettings((await settingsRes.json()) as Settings);
    })();
  }, [user, isLoading, router, apiAccessToken, workerFilter]);

  async function markPaid(id: string) {
    if (!apiAccessToken || !API_BASE_URL) return;
    const res = await fetch(`${API_BASE_URL}/admin/portal-workers/commissions/${id}/mark-paid`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
    });
    if (!res.ok) setError('Označení vyplaceno selhalo');
    else setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'PAID' } : r)));
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Link href="/admin" className="text-sm font-semibold text-[#e85d00] hover:underline">
            ← Administrace
          </Link>
          <h1 className="mt-1 text-xl font-bold">Provize pracovníků</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {settings ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <p>
              Výchozí %: {settings.defaultPercent} · Min. dobití: {settings.minTopUpAmount} Kč ·
              Platnost: {settings.validityDays} dní
            </p>
            <p className="mt-2 text-zinc-600">
              Role:{' '}
              {settings.roleRates.map((r) => `${r.role} ${r.percent}%`).join(' · ')}
            </p>
          </section>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <input
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            placeholder="Filtrovat dle ID pracovníka"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          {apiAccessToken && API_BASE_URL ? (
            <a
              href={`${API_BASE_URL}/admin/portal-workers/commissions/export${workerFilter ? `?workerId=${encodeURIComponent(workerFilter)}` : ''}`}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
            >
              Export CSV
            </a>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {items.map((r) => (
          <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <p className="font-semibold">
              {r.workerName} → {r.referredUserName}
            </p>
            <p className="text-zinc-600">
              Dobití {r.amount} Kč · {r.percent}% = {r.commissionAmount} Kč · {r.status}
            </p>
            {r.status !== 'PAID' ? (
              <button
                type="button"
                onClick={() => void markPaid(r.id)}
                className="mt-2 rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white"
              >
                Označit jako vyplaceno
              </button>
            ) : null}
          </div>
        ))}
      </main>
    </div>
  );
}
