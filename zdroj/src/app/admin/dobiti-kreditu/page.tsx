'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreditTopUpConfirm,
  nestAdminCreditTopUpReject,
  nestAdminCreditTopUpReverse,
  nestAdminCreditTopUpsList,
  type CreditTopUpAdminDto,
} from '@/lib/nest-client';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká na potvrzení',
  CONFIRMED: 'Potvrzeno',
  REJECTED: 'Zamítnuto',
  EXPIRED: 'Expirováno',
  REVERSED: 'Odečteno',
};

export default function AdminCreditTopUpsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<CreditTopUpAdminDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const list = await nestAdminCreditTopUpsList(token);
    if (!list) {
      setLoadError('Nepodařilo se načíst transakce.');
      setRows([]);
      return;
    }
    setRows(list);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(
    id: string,
    fn: (t: string, id: string, block?: boolean) => Promise<{ ok: boolean; error?: string }>,
    blockAccount = false,
  ) {
    if (!token) return;
    setBusyId(id);
    setMsg(null);
    const r = await fn(token, id, blockAccount);
    setBusyId(null);
    if (!r.ok) {
      setMsg(r.error ?? 'Akce selhala.');
      return;
    }
    setMsg('Hotovo.');
    await refresh();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dobití kreditů</h1>
          <p className="mt-1 text-sm text-zinc-600">Pending platby, potvrzení a odečtení kreditu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/nastaveni-plateb-kreditu" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
            Nastavení plateb
          </Link>
          <Link href="/admin" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
            Admin
          </Link>
        </div>
      </div>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      {msg ? <p className="mb-4 text-sm text-green-700">{msg}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Uživatel</th>
              <th className="px-3 py-2">Částka</th>
              <th className="px-3 py-2">VS</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Vytvořeno</th>
              <th className="px-3 py-2">Deadline</th>
              <th className="px-3 py-2">QR</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold text-zinc-900">{r.userName || '—'}</div>
                  <div className="text-xs text-zinc-500">{r.userEmail}</div>
                </td>
                <td className="px-3 py-2">{r.amount.toLocaleString('cs-CZ')} Kč</td>
                <td className="px-3 py-2 font-mono text-xs">{r.variableSymbol}</td>
                <td className="px-3 py-2">{STATUS_LABELS[r.status] ?? r.status}</td>
                <td className="px-3 py-2 text-xs">
                  {new Date(r.createdAt).toLocaleString('cs-CZ')}
                </td>
                <td className="px-3 py-2 text-xs">
                  {new Date(r.expiresAt).toLocaleString('cs-CZ')}
                </td>
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.qrImageUrl} alt="" width={64} height={64} className="rounded border" />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {r.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, nestAdminCreditTopUpConfirm)}
                          className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Potvrdit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, nestAdminCreditTopUpReject)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Zamítnout
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, nestAdminCreditTopUpReject, true)}
                          className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
                        >
                          Zamítnout + blok
                        </button>
                      </>
                    ) : null}
                    {r.status === 'PENDING' || r.status === 'CONFIRMED' ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, nestAdminCreditTopUpReverse)}
                        className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Odečíst kredit
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">Žádné transakce.</p>
        ) : null}
      </div>
    </main>
  );
}
