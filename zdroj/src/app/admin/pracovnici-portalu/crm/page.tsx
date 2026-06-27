'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

type CrmClientRow = {
  id: string;
  workerId: string;
  workerName: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  whatsapp: string;
  targetRole: string;
  status: string;
  createdAt: string;
};

export default function AdminPortalWorkerCrmPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<CrmClientRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!API_BASE_URL || !apiAccessToken) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(
      `${API_BASE_URL}/admin/portal-workers/crm/clients?${params}`,
      { headers: nestAuthHeaders(apiAccessToken), cache: 'no-store' },
    );
    if (res.ok) {
      const data = (await res.json()) as { items: CrmClientRow[] };
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [apiAccessToken, q]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/pracovnici-portalu" className="text-sm text-orange-600 hover:underline">
        ← Pracovníci portálu
      </Link>
      <h1 className="mt-2 text-2xl font-bold">CRM — klienti pracovníků</h1>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void refresh();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat jméno, e-mail, telefon…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white">
          Filtrovat
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Pracovník</th>
              <th className="px-3 py-2">Klient</th>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2">Kontakt</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  Načítám…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  Žádné záznamy
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{r.workerName}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.company || '—'}</td>
                  <td className="px-3 py-2">
                    {r.phone}
                    <br />
                    {r.email}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString('cs-CZ')}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/pracovnici-portalu/crm/${r.id}`}
                      className="font-semibold text-[#e85d00] hover:underline"
                    >
                      Detail
                    </Link>
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
