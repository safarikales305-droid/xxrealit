import type { ListingPost } from '@/lib/nest-client';

export type PortalPostFeedMediaItem = {
  id: string;
  url: string;
  type: string;
  order: number;
};

export type PortalPostFeedItem = {
  id: string;
  slug: string;
  postType?: string | null;
  authorName?: string;
  authorAvatarUrl?: string | null;
  category?: string | null;
  excerpt: string;
  publishedAt: string;
  href: string;
  description?: string;
  content?: string | null;
  media?: PortalPostFeedMediaItem[];
  mediaCount?: number;
  videoUrl?: string | null;
  imageUrl?: string | null;
  externalUrl?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
  previewImage?: string | null;
  previewSiteName?: string | null;
  isFacebookPagePost?: boolean;
  facebookPermalink?: string | null;
  facebookEmbedUrl?: string | null;
  facebookPostType?: string | null;
  facebookVideoThumbnail?: string | null;
  facebookVideoHasAudio?: boolean | null;
  source?: string | null;
  reactionCount?: number;
};

export function portalPostFeedItemToListingPost(post: PortalPostFeedItem): ListingPost {
  return {
    id: post.id,
    title: '',
    description: String(post.description ?? post.excerpt ?? ''),
    price: null,
    city: '',
    type: post.postType ?? 'post',
    createdAt: post.publishedAt,
    publishedAt: post.publishedAt,
    media: (post.media ?? []).map((m) => ({
      id: m.id,
      url: m.url,
      type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      order: m.order,
    })),
    videoUrl: post.videoUrl ?? null,
    imageUrl: post.imageUrl ?? null,
    externalUrl: post.externalUrl ?? null,
    previewTitle: post.previewTitle ?? null,
    previewDescription: post.previewDescription ?? null,
    previewImage: post.previewImage ?? null,
    previewSiteName: post.previewSiteName ?? null,
    isFacebookPagePost: post.isFacebookPagePost,
    facebookPermalink: post.facebookPermalink ?? null,
    facebookEmbedUrl: post.facebookEmbedUrl ?? null,
    facebookPostType: post.facebookPostType ?? null,
    facebookVideoThumbnail: post.facebookVideoThumbnail ?? null,
    facebookVideoHasAudio: post.facebookVideoHasAudio ?? null,
    source: post.source as ListingPost['source'],
  };
}
