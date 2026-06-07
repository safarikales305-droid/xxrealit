import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TipShortsPlayer } from '@/components/tipar/TipShortsPlayer';
import { getAppOrigin } from '@/lib/app-url';
import { resolveListingOgImageUrl } from '@/lib/listing-og-metadata';
import { fetchShareTexts, shareTextsForType } from '@/lib/share-texts';
import { fetchTiparPostPublic, tiparPostVideoUrl } from '@/lib/tipar-public';
import { tipShareUrl } from '@/lib/public-share-url';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) return { title: 'Tip na XXrealit' };

  const texts = await fetchShareTexts();
  const { title, description } = shareTextsForType('tip-shorts', texts);
  const pageUrl = tipShareUrl(id, true);
  const imageUrl = resolveListingOgImageUrl({
    id,
    title: post.title,
    mainImage: post.mainImage,
    images: post.images,
    videoUrl: post.videoUrl,
    generatedVideoThumbnail: post.generatedVideoUrl,
  });
  const videoUrl = tiparPostVideoUrl(post);

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'video.other',
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit.cz',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      ...(videoUrl
        ? {
            videos: [
              { url: videoUrl, secureUrl: videoUrl, type: 'video/mp4', width: 720, height: 1280 },
            ],
          }
        : {}),
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    other: {
      'og:title': title,
      'og:description': description,
      'og:image': imageUrl,
      'og:url': pageUrl,
      'og:type': 'video.other',
    },
  };
}

export default async function ShortsTipPage({ params }: Props) {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post?.isShorts) notFound();
  const videoUrl = tiparPostVideoUrl(post);
  if (!videoUrl) notFound();

  return (
    <TipShortsPlayer
      videoUrl={videoUrl}
      title={post.title}
      backHref={`${getAppOrigin()}/tipy/${encodeURIComponent(id)}`}
    />
  );
}
