'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoAuditRun } from '@/lib/nest-client';

export default function AdminSeoChybyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [issues, setIssues] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminSeoAuditRun(token);
    setIssues((res?.issues as Array<Record<string, unknown>>) ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="mb-3 text-sm text-zinc-600">SEO chyby z posledního auditu (meta, H1, canonical, OG, schema).</p>
      <ul className="space-y-2 text-sm">
        {issues.map((i, idx) => (
          <li key={idx} className="rounded border border-red-100 bg-red-50 px-3 py-2">
            <span className="font-mono text-xs">{String(i.pageKey)}</span> — {String(i.message)}
          </li>
        ))}
        {!issues.length ? <li className="text-zinc-500">Žádné chyby nebo audit ještě neproběhl.</li> : null}
      </ul>
    </div>
  );
}
