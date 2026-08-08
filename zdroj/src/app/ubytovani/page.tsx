import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { AccommodationListingClient } from '@/components/accommodation/AccommodationListingClient';
import { ContentTypeTabs } from '@/components/accommodation/ContentTypeTabs';
import { fetchAccommodations } from '@/lib/accommodation-client';

export const metadata: Metadata = {
  title: 'Ubytování | XXREALIT',
  description:
    'Hotely, apartmány, penziony a další ubytování v Česku. Porovnejte ceny, hodnocení a vybavení na XXREALIT.',
  openGraph: {
    title: 'Ubytování | XXREALIT',
    description: 'Najděte ideální ubytování pro dovolenou nebo víkend.',
    type: 'website',
  },
};

export default async function UbytovaniPage() {
  let initialItems: Awaited<ReturnType<typeof fetchAccommodations>>['items'] = [];
  let initialTotal = 0;
  try {
    const res = await fetchAccommodations({ limit: 12, page: 1 });
    initialItems = res.items;
    initialTotal = res.total;
  } catch {
    // SSR fallback — client retry
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between px-4 py-3">
          <Link href="/" aria-label="XXREALIT domů">
            <Logo />
          </Link>
          <Link href="/prihlaseni" className="text-sm font-medium text-zinc-700 hover:text-orange-600">
            Přihlásit
          </Link>
        </div>
      </header>
      <ContentTypeTabs />
      <main className="mx-auto max-w-[100rem] px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 md:text-3xl">Ubytování</h1>
          <p className="mt-1 text-sm text-zinc-600 md:text-base">
            Hotely, apartmány, penziony a další ubytování v Česku.
          </p>
        </div>
        <AccommodationListingClient initialItems={initialItems} initialTotal={initialTotal} />
      </main>
    </div>
  );
}
