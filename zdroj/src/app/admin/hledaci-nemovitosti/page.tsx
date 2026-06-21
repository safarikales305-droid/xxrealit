'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminExportPropertySeekersCsv,
  nestAdminListPropertySeekers,
  type PropertySeekerRow,
} from '@/lib/nest-client';

export default function AdminPropertySeekersPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<PropertySeekerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const data = await nestAdminListPropertySeekers(apiAccessToken);
    setItems(data.items);
    setTotal(data.total);
    if (data.error) setListError(data.error);
    setLoadingList(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  async function exportCsv() {
    setExportBusy(true);
    const r = await nestAdminExportPropertySeekersCsv(apiAccessToken);
    setExportBusy(false);
    if (!r.ok || !r.blob) return;
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'property-seekers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-orange-600 hover:underline">
            ← Administrace
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Hledači nemovitosti</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Celkem účtů „Hledám nemovitost“: <strong>{total}</strong>
          </p>
        </div>
        <button
          type="button"
          disabled={exportBusy || loadingList}
          onClick={() => void exportCsv()}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {exportBusy ? 'Exportuji…' : 'Export CSV'}
        </button>
      </div>

      {listError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {listError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Jméno</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">WhatsApp</th>
              <th className="px-3 py-2">WA ověřeno</th>
              <th className="px-3 py-2">Marketing WA</th>
              <th className="px-3 py-2">Marketing e-mail</th>
              <th className="px-3 py-2">Sdílení</th>
              <th className="px-3 py-2">Registrace</th>
            </tr>
          </thead>
          <tbody>
            {loadingList ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  Načítám…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  Žádní hledači nemovitosti.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{row.whatsappPhone ?? row.phone}</td>
                  <td className="px-3 py-2">{row.whatsappVerified ? 'Ano' : 'Ne'}</td>
                  <td className="px-3 py-2">{row.marketingConsentWhatsApp ? 'Ano' : 'Ne'}</td>
                  <td className="px-3 py-2">{row.marketingConsentEmail ? 'Ano' : 'Ne'}</td>
                  <td className="px-3 py-2">
                    {row.shareCount}
                    {row.shareCompletedAt ? ' ✓' : ''}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(row.registeredAt).toLocaleString('cs-CZ')}
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
