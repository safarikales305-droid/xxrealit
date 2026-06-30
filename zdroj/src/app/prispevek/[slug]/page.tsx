import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PrispevekDetailClient } from '@/components/posts/PrispevekDetailClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { fetchPostOgMetaBySlug } from '@/lib/post-public';
import { buildPostOpenGraphMetadata } from '@/lib/seo/post-og-metadata';
import { articleJsonLd } from '@/lib/seo/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

async function loadMeta(slug: string, expectVideo: boolean) {
  const meta = await fetchPostOgMetaBySlug(slug);
  if (!meta) return null;
  if (expectVideo && !meta.hasVideo) return null;
  if (!expectVideo && meta.hasVideo) {
    permanentRedirect(`/video/${slug}`);
  }
  return meta;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await fetchPostOgMetaBySlug(slug);
  if (!meta || meta.hasVideo) {
    return { title: 'Příspěvek | XXREALIT' };
  }
  return buildPostOpenGraphMetadata(meta);
}

export default async function PrispevekSeoPage({ params }: Props) {
  const { slug } = await params;
  const meta = await loadMeta(slug, false);
  if (!meta) notFound();

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
      <JsonLd data={article} />
      <PrispevekDetailClient postId={meta.id} sharePath={meta.canonicalPath} />
    </>
  );
}
