'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MY_LISTINGS_MOCK, formatCzk } from '@/lib/rental/mock-properties';

export default function MojeInzeratyPage() {
  const [items, setItems] = useState(MY_LISTINGS_MOCK);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Moje inzeráty</h1>
      <p className="mt-1 text-sm text-zinc-600">Přehled vašich nabídek (mock data).</p>

      <ul className="mt-8 space-y-4">
        {items.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-md transition hover:shadow-lg sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="font-semibold text-zinc-900">{p.title}</h2>
              <p className="mt-1 text-sm font-medium text-[#e85d00]">{formatCzk(p.price)}</p>
              <p className="mt-1 text-xs text-zinc-500">{p.location}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => console.log('EDIT', p.id)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
              >
                Upravit
              </button>
              <button
                type="button"
                onClick={() => {
                  setItems((prev) => prev.filter((x) => x.id !== p.id));
                  console.log('SMAZÁNO', p.id);
                }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
              >
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-500">
          Zatím nemáte žádné inzeráty.{' '}
          <Link href="/inzerat/pridat" className="font-semibold text-[#e85d00] hover:underline">
            Podat inzerát
          </Link>
        </p>
      ) : null}
    </div>
  );
}
