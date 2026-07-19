'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoRedirectCreate, nestAdminSeoRedirectDelete, nestAdminSeoRedirectsList } from '@/lib/nest-client';

export default function AdminSeoRedirectsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setRows((await nestAdminSeoRedirectsList(token)) ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    if (!token || !fromPath || !toPath) return;
    await nestAdminSeoRedirectCreate(token, { fromPath, toPath, reason: 'admin' });
    setFromPath('');
    setToPath('');
    void refresh();
  }

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border bg-white p-4">
        <input value={fromPath} onChange={(e) => setFromPath(e.target.value)} placeholder="/stara-url" className="rounded border px-3 py-2 text-sm" />
        <input value={toPath} onChange={(e) => setToPath(e.target.value)} placeholder="/nova-url" className="rounded border px-3 py-2 text-sm" />
        <button type="button" onClick={() => void add()} className="rounded bg-orange-600 px-3 py-2 text-sm text-white">
          Přidat 301
        </button>
      </div>
      <table className="w-full rounded-2xl border bg-white text-sm">
        <thead className="border-b bg-zinc-50">
          <tr>
            <th className="px-3 py-2 text-left">Z</th>
            <th className="px-3 py-2 text-left">Na</th>
            <th className="px-3 py-2 text-left">Akce</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className="border-b">
              <td className="px-3 py-2 font-mono text-xs">{String(r.fromPath)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(r.toPath)}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => void nestAdminSeoRedirectDelete(token, String(r.id)).then(() => refresh())}
                >
                  Smazat
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
