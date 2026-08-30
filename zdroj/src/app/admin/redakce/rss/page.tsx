'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell, StatusDot } from '@/components/admin/redakce/EditorialCenterShell';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';
import type { NewsSourceRow } from '@/lib/news-editorial-client';

export default function RedakceRssPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [sources, setSources] = useState<NewsSourceRow[]>([]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken || !API_BASE_URL) return;
    void fetch(`${API_BASE_URL}/admin/news-editorial/sources`, {
      headers: { Accept: 'application/json', ...nestAuthHeaders(apiAccessToken) },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: NewsSourceRow[]) =>
        setSources(rows.filter((s) => s.type !== 'YOUTUBE_CHANNEL')),
      );
  }, [apiAccessToken]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="RSS / Aktuality" subtitle="Přehled RSS a webových zdrojů pro AI redakci.">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">📰 Zdroj</th>
              <th className="px-4 py-3">Kategorie</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Dnes</th>
              <th className="px-4 py-3">Celkem</th>
              <th className="px-4 py-3">Poslední sync</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.category ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusDot active={s.enabled} label={s.enabled ? 'Aktivní' : 'Vypnuto'} />
                </td>
                <td className="px-4 py-3">{s.stats.itemsToday}</td>
                <td className="px-4 py-3">{s.stats.itemsTotal}</td>
                <td className="px-4 py-3 text-xs text-zinc-600">
                  {s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleString('cs-CZ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorialCenterShell>
  );
}
