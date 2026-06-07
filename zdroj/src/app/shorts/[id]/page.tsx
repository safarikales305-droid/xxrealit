import type { Metadata } from 'next';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import { SharedShortsPlayer } from '@/components/shorts/SharedShortsPlayer';
import {
  ShareListingInactive,
  ShareListingNotFound,
} from '@/components/share/ShareListingStatus';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { fetchPublicListingShare } from '@/lib/listing-share-public';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { parsePublicShortsListing } from '@/lib/shorts-listing-video';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchPropertyForOgMetadata(id, 'shorts');
  if (!listing) {
    return { title: 'Shorts inzerát na XXrealit' };
  }
  return buildListingOpenGraphMetadata(listing);
}

export default async function ShortsListingPage({ params }: Props) {
  const { id } = await params;
  const result = await fetchPublicListingShare(id, 'shorts');

  if (!result.ok) {
    if (result.status === 410) {
      return <ShareListingInactive listingId={id} />;
    }
    return (
      <ShareListingNotFound
        title="Inzerát nenalezen"
        message={result.message}
        listingId={id}
      />
    );
  }

  const listing = parsePublicShortsListing(result.property, id);
  const detailHref = `/nemovitost/${encodeURIComponent(id)}`;

  return (
    <ShareGateShell type="SHORTS_LISTING" listingId={id}>
      <SharedShortsPlayer listing={listing} detailHref={detailHref} />
    </ShareGateShell>
  );
}
