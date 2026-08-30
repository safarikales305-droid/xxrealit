'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import { nestAdminNewsAuditLog, type NewsAuditLogRow } from '@/lib/news-editorial-client';
import { nestEditorialReelJobs, type EditorialReelJobRow } from '@/lib/editorial-center-client';

export default function RedakceHistoriePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [audit, setAudit] = useState<NewsAuditLogRow[]>([]);
  const [reels, setReels] = useState<EditorialReelJobRow[]>([]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAdminNewsAuditLog(apiAccessToken, { limit: 40 }),
      nestEditorialReelJobs(apiAccessToken),
    ]).then(([a, r]) => {
      if (a) setAudit(a);
      if (r) setReels(r.slice(0, 20));
    });
  }, [apiAccessToken]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Historie" subtitle="Audit log redakce a Facebook Reel jobů.">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Facebook Reels</h2>
        <ul className="divide-y rounded-xl border border-zinc-200 bg-white">
          {reels.map((j) => (
            <li key={j.id} className="px-4 py-3 text-sm">
              <span className="font-medium">{j.title ?? j.id}</span>
              <span className="ml-2 text-xs text-zinc-500">{j.status}</span>
              <span className="ml-2 text-xs text-zinc-400">{new Date(j.createdAt).toLocaleString('cs-CZ')}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Audit log</h2>
        <ul className="divide-y rounded-xl border border-zinc-200 bg-white">
          {audit.map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <span className="font-mono text-xs text-orange-700">{row.event}</span>
              <p className="mt-1 text-zinc-800">{row.message}</p>
              <p className="text-xs text-zinc-500">{new Date(row.createdAt).toLocaleString('cs-CZ')}</p>
            </li>
          ))}
        </ul>
      </section>
    </EditorialCenterShell>
  );
}
