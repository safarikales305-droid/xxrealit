'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoAuditRun } from '@/lib/nest-client';

export default function AdminSeoAuditPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  const run = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminSeoAuditRun(token);
    setResult(res);
    setBusy(false);
  }, [token]);

  if (!token || user?.role !== 'ADMIN') return null;

  const summary = (result?.summary ?? {}) as Record<string, number>;
  const issues = (result?.issues ?? []) as Array<{ type: string; pageKey: string; message: string; severity: string }>;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Kontrola meta tagů, H1, OG, schema, canonical, robots a duplicit.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Audit běží…' : 'Spustit audit'}
      </button>

      {result ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-bold">{v}</p>
                <p className="text-zinc-600">{k}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold">Nalezené problémy ({issues.length})</h3>
            <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-sm">
              {issues.map((i, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className={`rounded px-1 text-xs ${i.severity === 'high' ? 'bg-red-100' : 'bg-amber-100'}`}>
                    {i.severity}
                  </span>
                  <span className="font-mono text-xs">{i.pageKey}</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
