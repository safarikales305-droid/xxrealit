import { Prisma } from '@prisma/client';
import { isPublicMediaUrl } from './community-posts.util';

export type PortalPostFeedMediaItem = {
  id: string;
  url: string;
  type: string;
  order: number;
};

export type PortalPostFeedItemDto = {
  id: string;
  slug: string;
  postType: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  category: string | null;
  excerpt: string;
  publishedAt: string;
  href: string;
  description: string;
  content: string | null;
  media: PortalPostFeedMediaItem[];
  mediaCount: number;
  videoUrl: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
  previewImage: string | null;
  previewSiteName: string | null;
  isFacebookPagePost: boolean;
  facebookPermalink: string | null;
  facebookEmbedUrl: string | null;
  facebookPostType: string | null;
  facebookVideoThumbnail: string | null;
  facebookVideoHasAudio: boolean | null;
  facebookVideoSourceUrl: string | null;
  source: string | null;
  reactionCount?: number;
};

type PostRow = {
  id: string;
  slug: string | null;
  type: string;
  title: string;
  description: string;
  content: string | null;
  category: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  externalUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
  previewImage: string | null;
  previewSiteName: string | null;
  isFacebookPagePost: boolean;
  facebookPermalink: string | null;
  facebookEmbedUrl: string | null;
  facebookPostType: string | null;
  facebookVideoThumbnail: string | null;
  facebookVideoHasAudio: boolean | null;
  facebookVideoSourceUrl: string | null;
  source: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  media: Array<{ id: string; url: string; type: string; order: number }>;
  user?: {
    id?: string;
    name?: string | null;
    avatar?: string | null;
    companyProfile?: { companyName?: string | null; logoUrl?: string | null } | null;
  } | null;
  _count?: { reactions?: number };
};

export function serializePortalPostFeedItem(row: PostRow): PortalPostFeedItemDto {
  const media = row.media
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((m) => isPublicMediaUrl(m.url))
    .map((m) => ({
      id: m.id,
      url: m.url.trim(),
      type: m.type,
      order: m.order,
    }));

  const authorName =
    row.user?.companyProfile?.companyName?.trim() ||
    row.user?.name?.trim() ||
    'Uživatel';
  const authorAvatarUrl = row.user?.companyProfile?.logoUrl || row.user?.avatar || null;
  const postSlug = row.slug ?? row.id;
  const excerpt = (row.content ?? row.description ?? row.title ?? '').trim().slice(0, 180);

  return {
    id: row.id,
    slug: postSlug,
    postType: row.type,
    authorName,
    authorAvatarUrl,
    category: row.category,
    excerpt,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    href: `/prispevek/${postSlug}`,
    description: row.description ?? '',
    content: row.content,
    media,
    mediaCount: media.length,
    videoUrl: row.videoUrl?.trim() || null,
    imageUrl: row.imageUrl?.trim() || null,
    externalUrl: row.externalUrl?.trim() || null,
    previewTitle: row.previewTitle?.trim() || null,
    previewDescription: row.previewDescription?.trim() || null,
    previewImage: row.previewImage?.trim() || null,
    previewSiteName: row.previewSiteName?.trim() || null,
    isFacebookPagePost: Boolean(row.isFacebookPagePost),
    facebookPermalink: row.facebookPermalink?.trim() || null,
    facebookEmbedUrl: row.facebookEmbedUrl?.trim() || null,
    facebookPostType: row.facebookPostType ?? null,
    facebookVideoThumbnail: row.facebookVideoThumbnail?.trim() || null,
    facebookVideoHasAudio: row.facebookVideoHasAudio ?? null,
    facebookVideoSourceUrl: row.facebookVideoSourceUrl?.trim() || null,
    source: row.source ?? null,
    reactionCount: row._count?.reactions,
  };
}

export const portalPostFeedInclude = {
  media: { orderBy: { order: 'asc' as const } },
  user: {
    select: {
      id: true,
      name: true,
      avatar: true,
      companyProfile: { select: { companyName: true, logoUrl: true } },
    },
  },
  _count: { select: { reactions: true } },
} satisfies Prisma.PostInclude;
