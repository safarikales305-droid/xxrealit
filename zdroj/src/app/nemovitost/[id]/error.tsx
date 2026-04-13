'use client';

import Link from 'next/link';

export default function PropertyDetailError() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">Detail se nepodařilo načíst</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Zkuste stránku znovu načíst. Pokud problém trvá, vraťte se do feedu a otevřete inzerát později.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
        >
          Zkusit znovu
        </button>
        <Link
          href="/?tab=shorts"
          className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          Zpět na feed
        </Link>
      </div>
    </div>
  );
}
