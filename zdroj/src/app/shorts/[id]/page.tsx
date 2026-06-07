import type { Metadata } from 'next';
import { ShortsImageFallback } from '@/components/shorts/ShortsImageFallback';
import { ShortsSinglePage } from '@/components/shorts/ShortsSinglePage';
import {
  ShareListingInactive,
  ShareListingNotFound,
} from '@/components/share/ShareListingStatus';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import {
  fetchPublicListingShare,
  propertyHasPlayableVideo,
  propertyToShortVideo,
} from '@/lib/listing-share-public';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { isShortVideoPlayable } from '@/lib/feed/loop-feed';

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

  const { property } = result;
  const classicHref = `/nemovitost/${encodeURIComponent(id)}`;
  const title = typeof property.title === 'string' ? property.title : 'Inzerát';

  if (!propertyHasPlayableVideo(property)) {
    const imageUrl =
      (typeof property.mainImage === 'string' && property.mainImage) ||
      (typeof property.thumbnailUrl === 'string' && property.thumbnailUrl) ||
      (Array.isArray(property.images) && typeof property.images[0] === 'string'
        ? property.images[0]
        : '') ||
      '';
    if (imageUrl) {
      return (
        <ShortsImageFallback
          title={title}
          imageUrl={imageUrl}
          classicHref={classicHref}
          backHref={classicHref}
        />
      );
    }
    return (
      <ShareListingNotFound
        title="Shorts video není k dispozici"
        message="Inzerát existuje, ale nemá přehratelné video. Otevřete klasický detail."
        listingId={id}
      />
    );
  }

  const video = propertyToShortVideo(property, id);
  if (!isShortVideoPlayable(video)) {
    return (
      <ShareListingNotFound
        title="Shorts video není k dispozici"
        message="Video se nepodařilo načíst. Zkuste klasický detail inzerátu."
        listingId={id}
      />
    );
  }

  return <ShortsSinglePage video={video} backHref={classicHref} />;
}
