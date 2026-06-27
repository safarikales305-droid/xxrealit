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

const ACTION_LABEL: Record<string, string> = {
  approve: 'Schválen',
  reject: 'Zamítnut',
  suspend: 'Pozastaven',
  activate: 'Aktivován',
};

function actionsForStatus(status: string): Array<'approve' | 'reject' | 'suspend' | 'activate'> {
  switch (status) {
    case 'PENDING_APPROVAL':
      return ['approve', 'reject'];
    case 'APPROVED':
      return ['suspend', 'reject'];
    case 'REJECTED':
      return ['approve'];
    case 'SUSPENDED':
      return ['activate', 'reject'];
    default:
      return ['approve', 'reject', 'suspend', 'activate'];
  }
}

export default function AdminPortalWorkersPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<PortalWorkerRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const data = await nestAdminListPortalWorkers(apiAccessToken);
    setItems(data.items);
    if (data.error) setListError(data.error);
    setLoadingList(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function act(userId: string, action: 'approve' | 'reject' | 'suspend' | 'activate') {
    setBusyId(userId);
    const r = await nestAdminPortalWorkerAction(apiAccessToken, userId, action);
    setBusyId(null);
    if (!r.ok) {
      setToast({ type: 'err', msg: r.error ?? 'Akce selhala' });
      return;
    }
    setToast({ type: 'ok', msg: `Pracovník ${ACTION_LABEL[action] ?? 'aktualizován'}.` });
    await refresh();
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
        {toast ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              toast.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {toast.msg}
          </p>
        ) : null}
        {listError ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{listError}</p>
        ) : null}
        {loadingList ? (
          <p className="text-sm text-zinc-600">Načítám pracovníky…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-600">Žádní pracovníci portálu.</p>
        ) : null}
        {items.map((w) => {
          const actions = actionsForStatus(w.status);
          return (
            <div key={w.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">
                    <Link
                      href={`/admin/pracovnici-portalu/${w.id}`}
                      className="hover:text-[#e85d00] hover:underline"
                    >
                      {w.name}
                    </Link>
                  </p>
                  <p className="text-sm text-zinc-600">
                    {w.email} · {w.phone}
                    {w.city ? ` · ${w.city}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Registrace: {new Date(w.registeredAt).toLocaleString('cs-CZ')} · WA{' '}
                    {w.whatsappVerified ? '✓' : '✗'} · e-mail {w.emailVerified ? '✓' : '✗'} · Klienti:{' '}
                    {w.referredClientCount} · Obrat: {(w.clientsTurnover ?? 0).toLocaleString('cs-CZ')} Kč
                    · Provize: {w.totalCommission.toLocaleString('cs-CZ')} Kč ·{' '}
                    <strong>{STATUS_LABEL[w.status] ?? w.status}</strong>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/pracovnici-portalu/${w.id}`}
                  className="rounded-lg border border-[#e85d00] px-3 py-1.5 text-sm font-semibold text-[#e85d00]"
                >
                  Detail / nastavení
                </Link>
                {actions.includes('approve') ? (
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => void act(w.id, 'approve')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Schválit
                  </button>
                ) : null}
                {actions.includes('reject') ? (
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => void act(w.id, 'reject')}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-800 disabled:opacity-50"
                  >
                    Zamítnout
                  </button>
                ) : null}
                {actions.includes('suspend') ? (
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => void act(w.id, 'suspend')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Pozastavit
                  </button>
                ) : null}
                {actions.includes('activate') ? (
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => void act(w.id, 'activate')}
                    className="rounded-lg border border-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-800 disabled:opacity-50"
                  >
                    Aktivovat
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
