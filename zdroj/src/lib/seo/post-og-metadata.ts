import type { Metadata } from 'next';
import { buildSiteMetadata, getRobotsMetadata } from '@/lib/seo/metadata';
import type { PostOgMeta } from '@/lib/post-public';

export function buildPostOpenGraphMetadata(meta: PostOgMeta): Metadata {
  const ogType = meta.hasVideo ? 'video.other' : 'article';
  const robotsMeta = getRobotsMetadata({
    indexable: meta.indexable !== false,
    robots: meta.robots,
  });
  const base = buildSiteMetadata({
    title: meta.seoTitle,
    description: meta.seoDescription,
    path: meta.canonicalPath,
    image: meta.imageUrl,
    type: meta.hasVideo ? 'article' : 'article',
    noindex: !robotsMeta.index,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: ogType,
      ...(meta.hasVideo && meta.videoUrl
        ? {
            videos: [
              {
                url: meta.videoUrl,
                secureUrl: meta.videoUrl,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: meta.hasVideo ? 'player' : 'summary_large_image',
      title: meta.seoTitle,
      description: meta.seoDescription,
      images: meta.imageUrl ? [meta.imageUrl] : undefined,
    },
  };
}
