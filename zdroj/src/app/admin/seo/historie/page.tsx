'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoHistory } from '@/lib/nest-client';

export default function AdminSeoHistoriePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setRows((await nestAdminSeoHistory(token, 100)) ?? []);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="rounded-2xl border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50">
          <tr>
            <th className="px-3 py-2 text-left">Verze</th>
            <th className="px-3 py-2 text-left">Stránka</th>
            <th className="px-3 py-2 text-left">Poznámka</th>
            <th className="px-3 py-2 text-left">Datum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const content = r.content as { pageKey?: string; title?: string } | undefined;
            return (
              <tr key={String(r.id)} className="border-b">
                <td className="px-3 py-2">v{String(r.version)}</td>
                <td className="px-3 py-2">{content?.title ?? content?.pageKey ?? '—'}</td>
                <td className="px-3 py-2">{String(r.note ?? '')}</td>
                <td className="px-3 py-2">{new Date(String(r.createdAt)).toLocaleString('cs-CZ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
