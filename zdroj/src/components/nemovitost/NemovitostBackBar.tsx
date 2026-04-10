'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function NemovitostBackBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (searchParams.get('from') !== 'shorts') return null;
  return (
    <button
      type="button"
      onClick={() => router.push('/?tab=shorts')}
      className="mb-4 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
    >
      ← Zpět na Shorts inzeráty
    </button>
  );
}
