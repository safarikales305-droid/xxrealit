import type { Metadata } from 'next';
import Link from 'next/link';
import { ListingCreateForm } from '@/components/listing/listing-create-form';

export const metadata: Metadata = {
  title: 'Přidat inzerát | XXrealit',
  description: 'Nový realitní inzerát s fotkami a popisem',
};

export default function PridatInzeratPage() {
  return (
    <div className="bg-[#fafafa] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm font-semibold text-[#e85d00] transition hover:text-[#ff6a00]"
        >
          ← Zpět na hlavní stránku
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          Přidat inzerát
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-zinc-600">
          Vyplňte údaje podle skutečnosti. Po odeslání bude inzerát čekat na schválení
          administrátorem, poté se zobrazí ve veřejném výpisu.
        </p>
      </div>
      <div className="mx-auto mt-8 max-w-3xl">
        <ListingCreateForm />
      </div>
    </div>
  );
}
