'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoSearchConsole } from '@/lib/nest-client';

export default function AdminSeoSearchConsolePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setData(await nestAdminSeoSearchConsole(token));
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || user?.role !== 'ADMIN') return null;

  const reasons = (data?.reasons ?? []) as Array<{ reason: string; count: number }>;
  const topQueries = (data?.topQueries ?? []) as Array<Record<string, unknown>>;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">{String(data?.note ?? '')}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kliknutí" value={data?.clicks} />
        <Stat label="Imprese" value={data?.impressions} />
        <Stat label="CTR" value={data?.ctr != null ? `${Number(data.ctr).toFixed(2)}%` : '—'} />
        <Stat label="Pozice" value={data?.position != null ? Number(data.position).toFixed(1) : '—'} />
      </div>
      <section className="mb-6 rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Neindexované stránky — důvody</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {reasons.map((r) => (
            <li key={r.reason} className="flex justify-between">
              <span>{r.reason}</span>
              <span>{r.count}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Top stránky</h3>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-1">Stránka</th>
              <th>Kliknutí</th>
              <th>CTR</th>
              <th>Pozice</th>
            </tr>
          </thead>
          <tbody>
            {topQueries.map((q, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 font-mono text-xs">{String(q.pageKey)}</td>
                <td>{String(q.clicks)}</td>
                <td>{q.ctr != null ? String(q.ctr) : '—'}</td>
                <td>{q.position != null ? String(q.position) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-2xl font-bold">{value != null ? String(value) : '—'}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}
