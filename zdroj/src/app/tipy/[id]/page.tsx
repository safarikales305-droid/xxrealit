import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { resolveListingOgImageUrl } from '@/lib/listing-og-metadata';
import { tipShareUrl } from '@/lib/public-share-url';
import { fetchShareTexts, shareTextsForType } from '@/lib/share-texts';
import { fetchTiparPostPublic, tiparPostVideoUrl } from '@/lib/tipar-public';
import { TiparDetailClient } from '../../tipar/[id]/tipar-detail-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) return { title: 'Tip na XXrealit' };

  const texts = await fetchShareTexts();
  const tipType = post.isShorts ? 'tip-shorts' : 'tip';
  const { title, description } = shareTextsForType(tipType, texts);
  const pageUrl = tipShareUrl(id, post.isShorts);
  const imageUrl = resolveListingOgImageUrl({
    id,
    title: post.title,
    mainImage: post.mainImage,
    images: post.images,
    videoUrl: post.videoUrl,
    generatedVideoThumbnail: post.generatedVideoUrl,
  });

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'article',
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit.cz',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    other: {
      'og:title': title,
      'og:description': description,
      'og:image': imageUrl,
      'og:url': pageUrl,
      'og:type': 'article',
    },
  };
}

export default async function TipyDetailPage({ params }: Props) {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) notFound();
  if (post.isShorts && tiparPostVideoUrl(post)) {
    redirect(`/shorts/tip/${encodeURIComponent(id)}`);
  }
  return <TiparDetailClient id={id} />;
}
