'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  TIPAR_PAYOUT_STATUS_LABEL,
  fetchTiparPayoutHistory,
  fetchTiparPayoutSummary,
  requestTiparPayout,
  type TiparPayoutHistoryItem,
  type TiparPayoutSummary,
} from '@/lib/tipar-payout-api';

function formatKc(value: number) {
  return `${value.toLocaleString('cs-CZ')} Kč`;
}

export function TiparEarningsSection() {
  const [summary, setSummary] = useState<TiparPayoutSummary | null>(null);
  const [history, setHistory] = useState<TiparPayoutHistoryItem[]>([]);
  const [amount, setAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, h] = await Promise.all([fetchTiparPayoutSummary(), fetchTiparPayoutHistory()]);
    setSummary(s);
    setHistory(h);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!summary) {
    return <p className="text-sm text-zinc-500">Načítám výdělek z tipů…</p>;
  }

  const maxAmount = summary.availableForPayout;
  const canPayout = summary.canRequest;

  async function submitPayout() {
    const parsed = Math.trunc(Number(amount));
    if (!parsed || parsed <= 0) {
      setErr('Zadejte platnou částku.');
      return;
    }
    if (parsed > maxAmount) {
      setErr(`Maximálně lze vyplatit ${formatKc(maxAmount)}.`);
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await requestTiparPayout(parsed);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Žádost selhala');
      return;
    }
    setAmount('');
    setShowForm(false);
    setMsg(r.message ?? 'Žádost o výplatu byla odeslána.');
    await load();
  }

  return (
    <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <h2 className="text-lg font-semibold text-zinc-900">Výdělek z tipů</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Vyplácí se pouze skutečný výdělek z tipů. Bonusový kredit nelze vyplatit.
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Celkový výdělek</dt>
          <dd className="font-semibold">{formatKc(summary.lifetimeEarnings)}</dd>
        </div>
        <div className="rounded-xl border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Již vyplaceno</dt>
          <dd className="font-semibold">{formatKc(summary.paidOutTotal)}</dd>
        </div>
        <div className="rounded-xl border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Dostupné k výplatě</dt>
          <dd className="font-semibold text-emerald-800">{formatKc(summary.availableForPayout)}</dd>
        </div>
        <div className="rounded-xl border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Bonusový kredit</dt>
          <dd className="font-semibold text-amber-800">{formatKc(summary.bonusCredit)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <button
          type="button"
          disabled={!canPayout || busy}
          onClick={() => setShowForm((v) => !v)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
            canPayout ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-zinc-400'
          }`}
        >
          Vyplatit výdělek
        </button>
        {!canPayout && summary.blockers.length > 0 ? (
          <ul className="text-sm text-amber-900">
            {summary.blockers.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        ) : null}
        {!summary.bankAccount ? (
          <Link href="/profil?tab=settings" className="text-sm font-semibold text-[#e85d00] hover:underline">
            Doplňte bankovní účet v profilu →
          </Link>
        ) : null}
      </div>

      {showForm && canPayout ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <label className="block text-sm">
            Kolik chcete vyplatit (max. {formatKc(maxAmount)})
            <input
              type="number"
              min={1}
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full min-w-[200px] rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitPayout()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Odeslat žádost
          </button>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-5 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold">Historie výplat</h3>
          <ul className="mt-2 space-y-2 text-xs text-zinc-600">
            {history.map((row) => (
              <li key={row.id} className="border-b border-zinc-100 pb-2 last:border-0">
                {new Date(row.requestedAt).toLocaleString('cs-CZ')} · {formatKc(row.amount)} ·{' '}
                <strong>{TIPAR_PAYOUT_STATUS_LABEL[row.status] ?? row.status}</strong>
                {row.adminNote ? ` · ${row.adminNote}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
    </section>
  );
}
