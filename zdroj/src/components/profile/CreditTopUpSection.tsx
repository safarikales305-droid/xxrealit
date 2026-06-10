'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestCreditsBalance,
  nestCreditsTopUp,
  type CreditBalanceDto,
  type CreditTopUpResultDto,
} from '@/lib/nest-client';

type Props = {
  token: string | null;
  initialBalance?: number;
  onBalanceChange?: (balance: number) => void;
};

export function CreditTopUpSection({ token, initialBalance, onBalanceChange }: Props) {
  const [balanceInfo, setBalanceInfo] = useState<CreditBalanceDto | null>(
    initialBalance != null
      ? {
          creditBalance: initialBalance,
          realCreditBalance: initialBalance,
          bonusCreditBalance: 0,
          pendingCreditBalance: 0,
          creditDebt: 0,
          accountLimited: false,
          warning: null,
          pendingTopUps: [],
        }
      : null,
  );
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditTopUpResultDto | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestCreditsBalance(token);
    if (data) {
      setBalanceInfo(data);
      onBalanceChange?.(data.creditBalance);
    }
  }, [token, onBalanceChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    const r = await nestCreditsTopUp(token, parsed);
    setLoading(false);
    if (!r.ok) {
      setError(r.error ?? 'Dobití se nezdařilo.');
      return;
    }
    setResult(r.data);
    await refresh();
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-zinc-900">Kredit</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Celkem:{' '}
        <span className="font-semibold text-[#e85d00]">
          {(balanceInfo?.creditBalance ?? 0).toLocaleString('cs-CZ')} Kč
        </span>
        {balanceInfo ? (
          <span className="mt-1 block text-xs text-zinc-500">
            Běžný {(balanceInfo.realCreditBalance ?? 0).toLocaleString('cs-CZ')} Kč · Bonus{' '}
            {(balanceInfo.bonusCreditBalance ?? 0).toLocaleString('cs-CZ')} Kč · Čekající{' '}
            {(balanceInfo.pendingCreditBalance ?? 0).toLocaleString('cs-CZ')} Kč
          </span>
        ) : null}
        {balanceInfo && balanceInfo.creditDebt > 0 ? (
          <span className="ml-2 text-red-600">
            (dluh {(balanceInfo.creditDebt).toLocaleString('cs-CZ')} Kč)
          </span>
        ) : null}
      </p>

      {balanceInfo?.accountLimited ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Váš účet je omezen kvůli neuhrazenému dobití kreditu.
        </p>
      ) : null}

      {balanceInfo?.warning ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {balanceInfo.warning}
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
          disabled={loading || !token}
          onClick={() => void onTopUp()}
          className="rounded-xl bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d45300] disabled:opacity-60"
        >
          {loading ? 'Zpracovávám…' : 'Dobít kredit'}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

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
              <p>
                <span className="font-semibold">Účet:</span>{' '}
                {result.paymentDetails.accountNumber}/{result.paymentDetails.bankCode}
              </p>
              <p>
                <span className="font-semibold">Příjemce:</span> {result.paymentDetails.recipientName}
              </p>
              <p>
                <span className="font-semibold">Zpráva:</span> {result.paymentDetails.paymentMessage}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Platbu potvrďte do{' '}
                {new Date(result.expiresAt).toLocaleString('cs-CZ', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
