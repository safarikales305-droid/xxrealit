'use client';

import type { QuickParam } from './listing-detail-utils';

export function ListingQuickParams({ items }: { items: QuickParam[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className="flex items-start gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3"
          >
            <span className="text-xl leading-none" aria-hidden>
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {item.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-900">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
