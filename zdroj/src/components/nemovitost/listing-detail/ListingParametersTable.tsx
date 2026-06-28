'use client';

import type { ParamRow } from './listing-detail-utils';

export function ListingParametersTable({ rows }: { rows: ParamRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold text-zinc-900">Parametry nemovitosti</h2>
      <dl className="mt-4 divide-y divide-zinc-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-2 gap-x-3 gap-y-1 py-3 sm:gap-4"
          >
            <dt className="text-sm font-medium text-zinc-500">{row.label}</dt>
            <dd className="text-sm font-semibold text-zinc-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
