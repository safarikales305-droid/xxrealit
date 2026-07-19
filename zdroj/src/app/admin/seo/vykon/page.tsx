'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoDashboard } from '@/lib/nest-client';

export default function AdminSeoVykonPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [data, setData] = useState<Awaited<ReturnType<typeof nestAdminSeoDashboard>>>(null);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setData(await nestAdminSeoDashboard(token));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Nejlepší stránky</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.topPages ?? []).map((p) => (
            <li key={p.pageKey} className="flex justify-between">
              <span>{p.pageKey}</span>
              <span>{p.clicks} kliků · CTR {p.ctr ?? '—'}%</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Nejhorší stránky</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.worstPages ?? []).map((p) => (
            <li key={p.pageKey} className="flex justify-between">
              <span>{p.pageKey}</span>
              <span>poz. {p.position ?? '—'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
