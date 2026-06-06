import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';
import {
  fetchTiparPostPublic,
  tiparPostImageUrl,
  tiparPostVideoUrl,
} from '@/lib/tipar-public';
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

  const pageUrl = `${getAppOrigin()}/tipar/${id}`;
  const description = (post.description || post.title || '').trim().slice(0, 200);
  const imageUrl = tiparPostImageUrl(post);
  const videoUrl = tiparPostVideoUrl(post);
  const isVideoShorts = Boolean(post.isShorts && videoUrl);

  return {
    title: post.title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: isVideoShorts ? 'video.other' : 'article',
      title: post.title,
      description,
      url: pageUrl,
      siteName: 'XXrealit',
      locale: 'cs_CZ',
      images: imageUrl ? [{ url: imageUrl, alt: post.title }] : undefined,
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
      card: videoUrl ? 'player' : imageUrl ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
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
