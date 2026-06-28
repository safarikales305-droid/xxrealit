'use client';

import { useMemo, useState } from 'react';

type Props = {
  price: number | null;
};

export function ListingMortgageCalculator({ price }: Props) {
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(5.2);
  const loan = price != null && price > 0 ? Math.round(price * 0.8) : 0;

  const monthly = useMemo(() => {
    if (loan <= 0) return 0;
    const r = rate / 100 / 12;
    const n = years * 12;
    if (r <= 0) return Math.round(loan / n);
    const pmt = (loan * r * (1 + r) ** n) / ((1 + r) ** n - 1);
    return Math.round(pmt);
  }, [loan, rate, years]);

  if (loan <= 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Hypoteční kalkulačka</h3>
      <p className="mt-1 text-xs text-zinc-500">Orientační splátka (80 % LTV)</p>
      <p className="mt-3 text-2xl font-bold text-zinc-900">
        {monthly.toLocaleString('cs-CZ')} Kč
        <span className="text-sm font-normal text-zinc-500"> / měsíc</span>
      </p>
      <div className="mt-3 space-y-2 text-xs">
        <label className="block">
          Úrok (% p.a.)
          <input
            type="number"
            step={0.1}
            min={0}
            max={20}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border px-2 py-1.5"
          />
        </label>
        <label className="block">
          Doba splácení (let)
          <input
            type="number"
            min={1}
            max={40}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border px-2 py-1.5"
          />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">Nezávazný výpočet — upřesněte u banky.</p>
    </section>
  );
}
