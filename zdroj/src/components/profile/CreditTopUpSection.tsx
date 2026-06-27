'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  nestCreditsBalance,
  nestCreditsHistory,
  nestCreditsTopUp,
  type CreditBalanceDto,
  type CreditHistoryRowDto,
  type CreditTopUpResultDto,
  type NestProfileRequirements,
} from '@/lib/nest-client';

type Props = {
  token: string | null;
  initialBalance?: number;
  whatsappVerified?: boolean;
  canTopUpCredits?: boolean;
  requirements?: NestProfileRequirements | null;
  onBalanceChange?: (balance: number) => void;
};

function emptyBalance(fallback = 0): CreditBalanceDto {
  return {
    creditBalance: fallback,
    realCreditBalance: fallback,
    bonusCreditBalance: 0,
    pendingCreditBalance: 0,
    creditDebt: 0,
    accountLimited: false,
    warning: null,
    pendingTopUps: [],
  };
}

export function CreditTopUpSection({
  token,
  initialBalance,
  whatsappVerified = true,
  canTopUpCredits = true,
  requirements,
  onBalanceChange,
}: Props) {
  const onBalanceChangeRef = useRef(onBalanceChange);
  onBalanceChangeRef.current = onBalanceChange;

  const [balanceInfo, setBalanceInfo] = useState<CreditBalanceDto | null>(
    initialBalance != null ? emptyBalance(initialBalance) : null,
  );
  const [amount, setAmount] = useState('500');
  const [balanceLoading, setBalanceLoading] = useState(
    Boolean(token) && initialBalance == null,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditTopUpResultDto | null>(null);
  const [history, setHistory] = useState<CreditHistoryRowDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setBalanceLoading(false);
      setBalanceError(null);
      if (initialBalance != null) {
        setBalanceInfo(emptyBalance(initialBalance));
      }
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const r = await nestCreditsBalance(token);
      if (r.ok) {
        setBalanceInfo(r.data);
        onBalanceChangeRef.current?.(r.data.creditBalance);
      } else {
        setBalanceError('Kredit se nepodařilo načíst.');
        setBalanceInfo(emptyBalance(0));
      }
    } catch {
      setBalanceError('Kredit se nepodařilo načíst.');
      setBalanceInfo(emptyBalance(0));
    } finally {
      setBalanceLoading(false);
    }
  }, [token, initialBalance]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    const h = await nestCreditsHistory(token);
    setHistoryLoading(false);
    if (h.ok) setHistory(h.data);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory]);

  async function onTopUp() {
    if (!token) return;
    setError(null);
    setResult(null);
    const parsed = Number(amount.replace(/\s/g, ''));
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setError('Zadejte celé číslo v Kč.');
      return;
    }
    setLoading(true);
    try {
      const r = await nestCreditsTopUp(token, parsed);
      if (!r.ok) {
        setError(r.error ?? 'Dobití se nezdařilo.');
        return;
      }
      setResult(r.data);
      await refresh();
      if (historyOpen) await loadHistory();
    } finally {
      setLoading(false);
    }
  }

  const paid =
    balanceInfo?.paidCredit ?? balanceInfo?.realCreditBalance ?? initialBalance ?? 0;
  const bonus = balanceInfo?.bonusCredit ?? balanceInfo?.bonusCreditBalance ?? 0;
  const marketing =
    balanceInfo?.marketingCreditTotal ?? balanceInfo?.creditBalance ?? paid + bonus;

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-zinc-900">Kredit</h2>

      {balanceLoading ? (
        <p className="mt-2 text-sm text-zinc-500">Načítám kredity…</p>
      ) : balanceError ? (
        <p className="mt-2 text-sm text-red-600">{balanceError}</p>
      ) : (
        <p className="mt-2 text-sm text-zinc-800">
          <span className="font-medium">Placený kredit:</span>{' '}
          <strong>{paid.toLocaleString('cs-CZ')} Kč</strong>
          <span className="mx-2 text-zinc-400">|</span>
          <span className="font-medium">Bonusový kredit:</span>{' '}
          <strong>{bonus.toLocaleString('cs-CZ')} Kč</strong>
          <span className="mx-2 text-zinc-400">|</span>
          <span className="font-medium">Marketing kredit:</span>{' '}
          <strong className="text-[#e85d00]">{marketing.toLocaleString('cs-CZ')} Kč</strong>
        </p>
      )}

      {(balanceInfo?.pendingCreditBalance ?? 0) > 0 ? (
        <p className="mt-2 text-xs text-amber-700">
          Čekající na potvrzení: {balanceInfo!.pendingCreditBalance!.toLocaleString('cs-CZ')} Kč
        </p>
      ) : null}

      {balanceInfo?.accountLimited && balanceInfo.creditDebt > 0 ? (
        <p className="mt-2 text-sm text-red-700">
          Dluh: {balanceInfo.creditDebt.toLocaleString('cs-CZ')} Kč
        </p>
      ) : null}

      {balanceInfo?.accountLimited && (balanceInfo.creditDebt ?? 0) > 0 ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Váš účet je omezen kvůli neuhrazenému dobití kreditu.
        </p>
      ) : null}

      {balanceInfo?.warning ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {balanceInfo.warning}
        </p>
      ) : null}

      {!canTopUpCredits && requirements?.checklist?.length ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pro dobití kreditu:{' '}
          {requirements.checklist
            .filter((item) => ['whatsapp', 'email', 'name'].includes(item.id) && !item.satisfied)
            .map((item) => item.missingLabel.toLowerCase())
            .join(', ') || 'doplňte povinné údaje v profilu.'}
        </p>
      ) : !canTopUpCredits ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pro dobití kreditu vyplňte jméno, ověřte e-mail a ověřte WhatsApp číslo v profilu.
        </p>
      ) : !whatsappVerified ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pro dobití kreditu musíte nejdříve ověřit telefonní číslo přes WhatsApp.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <label htmlFor="credit-top-up-amount" className="mb-1 block text-sm font-semibold text-zinc-800">
            Částka (Kč)
          </label>
          <input
            id="credit-top-up-amount"
            type="number"
            min={300}
            max={100000}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <button
          type="button"
          disabled={loading || !token || !whatsappVerified || !canTopUpCredits}
          onClick={() => void onTopUp()}
          className="rounded-xl bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d45300] disabled:opacity-60"
        >
          {loading ? 'Zpracovávám…' : 'Dobít kredit'}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-sm font-semibold text-[#e85d00] hover:underline"
        >
          {historyOpen ? 'Skrýt historii transakcí' : 'Zobrazit historii transakcí'}
        </button>
        {historyOpen ? (
          <div className="mt-3">
            {historyLoading ? (
              <p className="text-sm text-zinc-500">Načítám historii…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-zinc-500">Zatím žádné pohyby.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {history.map((row) => (
                  <li
                    key={`${row.source}-${row.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">{row.description || row.type}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(row.createdAt).toLocaleString('cs-CZ')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${row.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}
                    >
                      {row.amount > 0 ? '+' : ''}
                      {row.amount.toLocaleString('cs-CZ')} Kč
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-900">{result.message}</p>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.qrImageUrl}
              alt="QR kód pro platbu"
              width={220}
              height={220}
              className="rounded-lg border border-zinc-200 bg-white p-2"
            />
            <div className="text-sm text-zinc-700">
              <p>
                <span className="font-semibold">Částka:</span>{' '}
                {result.amount.toLocaleString('cs-CZ')} Kč
              </p>
              <p>
                <span className="font-semibold">VS:</span> {result.variableSymbol}
              </p>
              <p>
                <span className="font-semibold">Faktura:</span> {result.invoiceNumber}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
