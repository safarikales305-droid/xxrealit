'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchWorkerRecruitmentTargets,
  fetchWorkerWorkGuide,
} from '@/lib/portal-worker-communication-api';

export default function WorkerGuidePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [guide, setGuide] = useState<{ enabled: boolean; steps: Array<{ sortOrder: number; title: string; body: string }> } | null>(null);
  const [targets, setTargets] = useState<Array<{ label: string; title: string; steps: string[] }>>([]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PORTAL_WORKER') {
      router.replace('/');
      return;
    }
    void (async () => {
      const [g, t] = await Promise.all([fetchWorkerWorkGuide(), fetchWorkerRecruitmentTargets()]);
      setGuide(g);
      setTargets(t.items ?? []);
    })();
  }, [user, isLoading, router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Postup práce</h1>
        <p className="text-sm text-zinc-600">Návod a náborové cíle portálu</p>
      </div>

      {guide?.enabled && guide.steps.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold">Krok za krokem</h2>
          <ol className="mt-4 space-y-4">
            {guide.steps.map((s) => (
              <li key={s.sortOrder} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-[#e85d00]">
                  {s.sortOrder + 1}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-zinc-700">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">Postup práce zatím není aktivní.</p>
      )}

      {targets.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold">Koho aktuálně hledáme</h2>
          <div className="mt-4 space-y-4">
            {targets.map((t) => (
              <div key={t.label} className="rounded-lg border border-zinc-100 p-4">
                <h3 className="font-semibold text-[#e85d00]">{t.label}</h3>
                <p className="text-sm text-zinc-600">{t.title}</p>
                <ul className="mt-2 list-inside list-disc text-sm text-zinc-700">
                  {t.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
