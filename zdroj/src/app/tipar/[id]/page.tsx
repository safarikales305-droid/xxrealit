import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';
import {
  buildListingOgDescription,
  buildListingOgTitle,
  buildListingOpenGraphMetadata,
  resolveListingOgImageUrl,
} from '@/lib/listing-og-metadata';
import { fetchTiparPostPublic, tiparPostVideoUrl } from '@/lib/tipar-public';
import { TiparDetailClient } from './tipar-detail-client';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) {
    return { title: 'Tip na nemovitost' };
  }

  if (post.publishedPropertyId) {
    const { fetchPropertyForOgMetadata } = await import('@/lib/property-public');
    const listing = await fetchPropertyForOgMetadata(post.publishedPropertyId);
    if (listing) {
      return buildListingOpenGraphMetadata(listing);
    }
  }

  const pageUrl = `${getAppOrigin()}/tipar/${id}`;
  const title = buildListingOgTitle({
    id,
    title: post.title,
    price: post.propertyPrice,
    city: post.city,
  });
  const description = buildListingOgDescription({
    id,
    title: post.title,
    description: post.description,
    city: post.city,
  });
  const imageUrl = resolveListingOgImageUrl({
    id,
    title: post.title,
    mainImage: post.mainImage,
    images: post.images,
    videoUrl: post.videoUrl,
    generatedVideoThumbnail: post.generatedVideoUrl,
  });
  const videoUrl = tiparPostVideoUrl(post);
  const isVideoShorts = Boolean(post.isShorts && videoUrl);

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: isVideoShorts ? 'video.other' : 'article',
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: post.title }],
      videos: videoUrl
        ? [
            {
              url: videoUrl,
              secureUrl: videoUrl,
              type: 'video/mp4',
              width: 720,
              height: 1280,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    other: videoUrl
      ? {
          'og:video': videoUrl,
          'og:video:secure_url': videoUrl,
          'og:video:type': 'video/mp4',
          'og:video:width': '720',
          'og:video:height': '1280',
        }
      : undefined,
  };
}

export default async function TiparDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <TiparDetailClient id={id} />;
}
