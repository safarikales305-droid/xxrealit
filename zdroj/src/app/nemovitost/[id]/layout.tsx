import type { ReactNode } from 'react';
import Link from 'next/link';

/** Veřejný detail — bez PrivateSellerGate (shorts výpis odkazuje sem). */
export default function NemovitostDetailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-[#e85d00] transition hover:text-[#ff6a00]"
          >
            XXrealit
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-600 transition hover:text-zinc-900"
          >
            ← Domů
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
