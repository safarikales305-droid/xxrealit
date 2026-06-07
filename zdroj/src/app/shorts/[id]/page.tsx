import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShortsSinglePage } from '@/components/shorts/ShortsSinglePage';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { nestFetchShortVideoPublic } from '@/lib/nest-client';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';

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
  const video = await nestFetchShortVideoPublic(id);
  if (!video) notFound();
  return <ShortsSinglePage video={video} backHref={`/nemovitost/${encodeURIComponent(id)}`} />;
}
