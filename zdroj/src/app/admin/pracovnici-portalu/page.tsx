'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminListPortalWorkers,
  nestAdminPortalWorkerAction,
  type PortalWorkerRow,
} from '@/lib/nest-client';

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Čeká na schválení',
  APPROVED: 'Schválen',
  REJECTED: 'Zamítnut',
  SUSPENDED: 'Pozastaven',
};

export default function AdminPortalWorkersPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<PortalWorkerRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!apiAccessToken) return;
    const data = await nestAdminListPortalWorkers(apiAccessToken);
    setItems(data.items);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  async function act(userId: string, action: 'approve' | 'reject' | 'suspend' | 'activate') {
    if (!apiAccessToken) return;
    setBusyId(userId);
    setError(null);
    const r = await nestAdminPortalWorkerAction(apiAccessToken, userId, action);
    setBusyId(null);
    if (!r.ok) setError(r.error ?? 'Akce selhala');
    else await refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Link href="/admin" className="text-sm font-semibold text-[#e85d00] hover:underline">
            ← Administrace
          </Link>
          <h1 className="mt-1 text-xl font-bold">Pracovníci portálu</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {items.map((w) => (
          <div key={w.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-zinc-900">{w.name}</p>
            <p className="text-sm text-zinc-600">
              {w.email} · {w.phone} · WA {w.whatsappVerified ? '✓' : '✗'} · e-mail{' '}
              {w.emailVerified ? '✓' : '✗'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Registrace: {new Date(w.registeredAt).toLocaleString('cs-CZ')} · Klienti:{' '}
              {w.referredClientCount} · Provize: {w.totalCommission.toLocaleString('cs-CZ')} Kč ·{' '}
              {STATUS_LABEL[w.status] ?? w.status}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === w.id}
                onClick={() => void act(w.id, 'approve')}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Schválit
              </button>
              <button
                type="button"
                disabled={busyId === w.id}
                onClick={() => void act(w.id, 'reject')}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-800"
              >
                Zamítnout
              </button>
              <button
                type="button"
                disabled={busyId === w.id}
                onClick={() => void act(w.id, 'suspend')}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold"
              >
                Pozastavit
              </button>
              <button
                type="button"
                disabled={busyId === w.id}
                onClick={() => void act(w.id, 'activate')}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold"
              >
                Aktivovat
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
