'use client';

import { useCallback, useEffect, useState } from 'react';
import { listFollowUps, scanFollowUps, type AiSalesApiError } from '@/lib/ai-sales-admin-api';

type Props = { token: string };

export function AiSalesFollowUpPanel({ token }: Props) {
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listFollowUps(token);
      setTasks(rows);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Načtení follow-upů selhalo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runScan() {
    setBusy(true);
    setError(null);
    try {
      const res = await scanFollowUps(token);
      setScanResult(res);
      await load();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Sken follow-upů selhal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 text-sm">
        <p className="text-zinc-600">
          Follow-up návrhy se vytváří po 5 a 15 dnech bez odpovědi. Nikdy se neodesílají automaticky — vyžadují schválení administrátora.
        </p>
        <button type="button" disabled={busy} onClick={() => void runScan()} className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Skenuji…' : 'Skenovat a navrhnout follow-upy'}
        </button>
        {scanResult ? (
          <p className="mt-2 text-xs text-zinc-500">
            Prohledáno: {String(scanResult.scanned ?? 0)} · Vytvořeno: {String(scanResult.created ?? 0)}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Zkusit znovu</button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Načítám follow-upy…</p> : null}

      {!loading && tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-600">
          Žádné follow-up úkoly. Spusťte sken po odeslání prvních nabídek.
        </div>
      ) : null}

      <ul className="space-y-2">
        {tasks.map((t) => {
          const prospect = t.prospect as Record<string, unknown> | undefined;
          return (
            <li key={String(t.id)} className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-semibold">{String(t.title)}</p>
              <p className="text-zinc-600">{prospect?.companyName ? String(prospect.companyName) : '—'}</p>
              <p className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{String(t.description ?? '')}</p>
              <p className="mt-1 text-xs text-zinc-500">Termín: {t.dueAt ? new Date(String(t.dueAt)).toLocaleString('cs-CZ') : '—'}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
