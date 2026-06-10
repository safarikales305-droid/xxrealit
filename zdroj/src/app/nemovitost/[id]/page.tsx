import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NemovitostDetailPageClient } from '@/components/nemovitost/NemovitostDetailPageClient';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import PropertyDetailLoading from './loading';

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchPropertyForOgMetadata(id, 'classic');
  if (!listing) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[og-metadata] fetch failed for', id, '— Facebook může zobrazit logo portálu');
    }
    return {
      title: 'Inzerát nemovitosti',
      robots: { index: true, follow: true },
    };
  }
  return buildListingOpenGraphMetadata(listing);
}

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <ShareGateShell type="CLASSIC_LISTING" listingId={id}>
      <Suspense fallback={<PropertyDetailLoading />}>
        <NemovitostDetailPageClient propertyId={id} />
      </Suspense>
    </ShareGateShell>
  );
}
