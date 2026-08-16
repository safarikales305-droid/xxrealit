import type { Metadata } from 'next';
import { AccommodationHero } from '@/components/accommodation/AccommodationHero';
import { AccommodationListingClient } from '@/components/accommodation/AccommodationListingClient';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import { ACCOMMODATION_PAGE_SIZE } from '@/lib/accommodation-categories';
import { fetchAccommodationHero } from '@/lib/accommodation-client';
import { fetchHotelbedsConfig, fetchHotelbedsSearch } from '@/lib/hotelbeds-client';

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
  const hero = await fetchAccommodationHero().catch(() => null);
  const hbConfig = await fetchHotelbedsConfig().catch(() => null);
  const useHotelbeds = hbConfig?.publicListings === true;

  let initialItems: Awaited<ReturnType<typeof fetchHotelbedsSearch>>['items'] = [];
  let initialTotal = 0;
  let ssrLoaded = false;

  if (useHotelbeds) {
    try {
      const res = await fetchHotelbedsSearch({ limit: ACCOMMODATION_PAGE_SIZE, page: 1 });
      initialItems = res.items;
      initialTotal = res.total;
      ssrLoaded = true;
    } catch {
      // client retry
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <PublicHeader activeSection="accommodation" />
      {hero ? <AccommodationHero hero={hero} /> : null}
      <main className="mx-auto max-w-[100rem] px-4 py-6">
        <AccommodationListingClient
          initialItems={initialItems}
          initialTotal={initialTotal}
          hideTopSearch
          useHotelbeds={useHotelbeds}
          ssrPrefetched={ssrLoaded}
        />
      </main>
    </div>
  );
}
