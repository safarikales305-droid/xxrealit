import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PrispevekDetailClient } from '@/components/posts/PrispevekDetailClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { fetchPostOgMetaBySlug } from '@/lib/post-public';
import { buildPostOpenGraphMetadata } from '@/lib/seo/post-og-metadata';
import { articleJsonLd, videoObjectJsonLd } from '@/lib/seo/schema';
import { getAppOrigin } from '@/lib/app-url';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await fetchPostOgMetaBySlug(slug);
  if (!meta || !meta.hasVideo) {
    return { title: 'Video | XXREALIT' };
  }
  return buildPostOpenGraphMetadata(meta);
}

export default async function VideoSeoPage({ params }: Props) {
  const { slug } = await params;
  const meta = await fetchPostOgMetaBySlug(slug);
  if (!meta) notFound();
  if (!meta.hasVideo) {
    permanentRedirect(`/prispevek/${slug}`);
  }

  const origin = getAppOrigin();
  const video = videoObjectJsonLd({
    name: meta.seoTitle,
    description: meta.seoDescription,
    thumbnailUrl: meta.imageUrl,
    contentUrl: meta.videoUrl,
    embedUrl: `${origin}${meta.canonicalPath}`,
    uploadDate: meta.publishedAt,
    durationSec: meta.videoDurationSec,
    authorName: meta.authorName,
    url: meta.canonicalUrl,
  });
  const article = articleJsonLd({
    title: meta.seoTitle,
    description: meta.seoDescription,
    path: meta.canonicalPath,
    image: meta.imageUrl,
    publishedAt: meta.publishedAt,
    authorName: meta.authorName,
  });

  return (
    <>
      <JsonLd data={video} />
      <JsonLd data={article} />
      <PrispevekDetailClient postId={meta.id} sharePath={meta.canonicalPath} />
    </>
  );
}
