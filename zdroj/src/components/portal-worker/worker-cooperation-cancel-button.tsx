'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchWorkerCooperationCancel,
  requestWorkerCooperationCancel,
} from '@/lib/portal-worker-communication-api';

export function WorkerCooperationCancelButton() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user || user.role !== 'PORTAL_WORKER') return;
    void fetchWorkerCooperationCancel().then((r) => {
      setPending(r.request?.status === 'PENDING');
    });
  }, [user, isLoading]);

  if (isLoading || !user || user.role !== 'PORTAL_WORKER') return null;

  async function confirm() {
    setBusy(true);
    setErr(null);
    const r = await requestWorkerCooperationCancel(reason.trim() || undefined);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Odeslání selhalo');
      return;
    }
    setOpen(false);
    setPending(true);
    router.refresh();
  }

  if (pending) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Vaše žádost o ukončení spolupráce čeká na vyřízení administrátorem.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 hover:bg-red-100"
      >
        Nemám zájem pracovat pro portál / ruším spolupráci
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">Potvrdit ukončení spolupráce</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Po potvrzení vás administrátor zkontaktuje. Do vyřízení nebudete dostávat výzvy ani hromadné zprávy.
            </p>
            <label className="mt-4 block text-sm">
              Důvod (volitelné)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Potvrdit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
