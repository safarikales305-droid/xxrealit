'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSocialFacebookConnections,
  type AdminFacebookConnectionRow,
} from '@/lib/nest-client';

export default function AdminFacebookConnectionsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<AdminFacebookConnectionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const data = await nestAdminSocialFacebookConnections(token);
    if (!data) {
      setLoadError('Nepodařilo se načíst Facebook propojení.');
      setRows([]);
      return;
    }
    setRows(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Facebook propojení</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Přehled profesionálních účtů s propojenou Facebook stránkou.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
          >
            ← Administrace
          </Link>
        </div>

        {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Uživatel</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">FB stránka</th>
                <th className="px-4 py-3">Sync</th>
                <th className="px-4 py-3">Importů</th>
                <th className="px-4 py-3">Poslední sync</th>
                <th className="px-4 py-3">Chyba</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    Žádná propojení.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.userId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{r.userName || '—'}</div>
                      <div className="text-xs text-zinc-500">{r.email}</div>
                    </td>
                    <td className="px-4 py-3">{r.role}</td>
                    <td className="px-4 py-3">
                      {r.connected ? (
                        <>
                          <div className="font-medium">{r.pageName}</div>
                          <div className="text-xs text-zinc-500">{r.pageId}</div>
                        </>
                      ) : (
                        <span className="text-zinc-400">Nepřipojeno</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.syncEnabled ? (
                        <span className="text-emerald-700">Zapnuto</span>
                      ) : (
                        <span className="text-zinc-500">Vypnuto</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.importedCount}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString('cs-CZ') : '—'}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-red-700">
                      {r.lastSyncError || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
