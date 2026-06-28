'use client';

import { useState } from 'react';
import { grantWorkerClientBonus } from '@/lib/portal-worker-crm-api';

type BonusCreditInfo = {
  canAssign: boolean;
  maxBonusPerClient?: number;
  maxBonusPerDay?: number | null;
  maxBonusPerMonth?: number | null;
  bonusGrantedToClient?: number;
  bonusRemainingOnClient?: number;
};

type BonusHistoryEntry = {
  id: string;
  amount: number;
  description?: string | null;
  purpose?: string | null;
  createdAt: string;
};

type Props = {
  clientUserId: string;
  profile: {
    realCredit?: number;
    bonusCredit?: number;
    totalCredit?: number;
  };
  bonusCreditInfo?: BonusCreditInfo | null;
  workerBonusHistory?: BonusHistoryEntry[];
  onGranted: () => void | Promise<void>;
};

function formatKc(value: number) {
  return `${value.toLocaleString('cs-CZ')} Kč`;
}

export function WorkerClientBonusCreditSection({
  clientUserId,
  profile,
  bonusCreditInfo,
  workerBonusHistory = [],
  onGranted,
}: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sendGiftEmail, setSendGiftEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!bonusCreditInfo?.canAssign) return null;

  const realCredit = profile.realCredit ?? 0;
  const bonusCredit = profile.bonusCredit ?? 0;
  const totalCredit = profile.totalCredit ?? realCredit + bonusCredit;
  const remaining = bonusCreditInfo.bonusRemainingOnClient ?? 0;

  async function submit() {
    const parsed = Math.trunc(Number(amount));
    if (!parsed || parsed <= 0) {
      setErr('Zadejte platnou částku v Kč.');
      return;
    }
    if (parsed > remaining) {
      setErr(`Maximálně lze připsat ${formatKc(remaining)} (limit na tohoto klienta).`);
      return;
    }

    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await grantWorkerClientBonus(clientUserId, parsed, note.trim() || undefined, sendGiftEmail);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Připsání bonusového kreditu selhalo.');
      return;
    }
    setAmount('');
    setNote('');
    let success = r.message ?? 'Bonusový kredit byl úspěšně připsán.';
    if (sendGiftEmail) {
      success += r.emailSent ? ' E-mail klientovi byl odeslán.' : ' E-mail se nepodařilo odeslat.';
    }
    setMsg(success);
    await onGranted();
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="text-base font-semibold text-zinc-900">Bonusový kredit klienta</h3>
      <p className="mt-1 text-xs text-zinc-600">
        Můžete připsat pouze bonusový kredit — nikoli placený (skutečný) kredit.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Skutečný kredit</dt>
          <dd className="font-semibold text-zinc-900">{formatKc(realCredit)}</dd>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Bonusový kredit</dt>
          <dd className="font-semibold text-emerald-800">{formatKc(bonusCredit)}</dd>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <dt className="text-xs text-zinc-500">Celkem kredit</dt>
          <dd className="font-semibold text-zinc-900">{formatKc(totalCredit)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-zinc-600">
        Limit na tohoto klienta:{' '}
        <strong>{formatKc(bonusCreditInfo.maxBonusPerClient ?? 0)}</strong>
        {' · '}
        zbývá připsat: <strong>{formatKc(remaining)}</strong>
        {bonusCreditInfo.maxBonusPerDay != null ? (
          <>
            {' · '}
            denní limit: <strong>{formatKc(bonusCreditInfo.maxBonusPerDay)}</strong>
          </>
        ) : null}
        {bonusCreditInfo.maxBonusPerMonth != null ? (
          <>
            {' · '}
            měsíční limit: <strong>{formatKc(bonusCreditInfo.maxBonusPerMonth)}</strong>
          </>
        ) : null}
      </p>

      {workerBonusHistory.length > 0 ? (
        <div className="mt-4 rounded-lg border bg-white p-3">
          <h4 className="text-sm font-semibold">Historie připsání kreditů</h4>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-600">
            {workerBonusHistory.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.createdAt).toLocaleString('cs-CZ')} · +{formatKc(entry.amount)}
                {entry.description ? ` · ${entry.description}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2">
        <label className="block text-sm">
          Částka bonusového kreditu (Kč)
          <input
            type="number"
            min={1}
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="např. 500"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Poznámka pracovníka
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Interní poznámka k připsání kreditu"
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={sendGiftEmail}
            onChange={(e) => setSendGiftEmail(e.target.checked)}
          />
          Odeslat klientovi e-mail o dárku
        </label>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Připsat bonusový kredit
      </button>

      {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
    </section>
  );
}
