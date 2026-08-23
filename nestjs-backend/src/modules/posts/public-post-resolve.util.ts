import type { Prisma } from '@prisma/client';
import type { PublicVisibilityUser } from '../../common/public-visibility.util';
import { isCommunityPostAuthorVisible } from '../../common/public-visibility.util';
import { buildPostPublicUrl } from '../seo/post-seo.util';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import {
  communityPostAuthorUserWhere,
  isEditorialFeedPostType,
} from './community-posts.util';

const LEGACY_VIDEO_SLUG_RE = /^video-([a-zA-Z0-9_-]{6,})$/;

export function parseLegacyYoutubeSlug(slug: string): string | null {
  const match = slug.trim().match(LEGACY_VIDEO_SLUG_RE);
  return match?.[1] ?? null;
}

export function isPublicPostDetailVisible(post: {
  type?: string | null;
  publishedAt?: Date | null;
  user: PublicVisibilityUser | null;
}): boolean {
  if (isEditorialFeedPostType(post.type) && post.publishedAt) {
    return true;
  }
  if (post.user && isCommunityPostAuthorVisible(post.user)) {
    return true;
  }
  return false;
}

export function buildPublicPostSlugWhere(slug: string): Prisma.PostWhereInput {
  return {
    slug,
    OR: [
      {
        type: { in: ['YOUTUBE_VIDEO', 'NEWS_ARTICLE', 'COMPANY_REVIEW'] },
        publishedAt: { not: null },
      },
      { user: communityPostAuthorUserWhere() },
    ],
  };
}

export async function resolvePublicPostBySlug(
  prisma: {
    post: {
      findFirst: (args: {
        where: Prisma.PostWhereInput;
        select: { id: true; slug: true };
      }) => Promise<{ id: string; slug: string | null } | null>;
    };
  },
  slug: string,
): Promise<{ id: string; slug: string } | null> {
  const normalized = slug.trim();
  if (!normalized) return null;

  const direct = await prisma.post.findFirst({
    where: buildPublicPostSlugWhere(normalized),
    select: { id: true, slug: true },
  });
  if (direct?.slug) {
    return { id: direct.id, slug: direct.slug };
  }

  const youtubeVideoId = parseLegacyYoutubeSlug(normalized);
  if (youtubeVideoId) {
    const byVideoId = await prisma.post.findFirst({
      where: {
        youtubeVideoId,
        type: 'YOUTUBE_VIDEO',
        publishedAt: { not: null },
      },
      select: { id: true, slug: true },
    });
    if (byVideoId?.slug) {
      return { id: byVideoId.id, slug: byVideoId.slug };
    }
    const byLegacySlug = await prisma.post.findFirst({
      where: {
        slug: normalized,
        type: 'YOUTUBE_VIDEO',
        publishedAt: { not: null },
      },
      select: { id: true, slug: true },
    });
    if (byLegacySlug?.slug) {
      return { id: byLegacySlug.id, slug: byLegacySlug.slug };
    }
  }

  return null;
}

export type PublicPostUrlVerification =
  | { ok: true; slug: string; generatedUrl: string }
  | { ok: false; reason: string; generatedUrl: string };

export async function verifyPublicPostResolvable(
  prisma: {
    post: {
      findFirst: (args: {
        where: Prisma.PostWhereInput;
        select: { id: true; slug: true };
      }) => Promise<{ id: string; slug: string | null } | null>;
    };
  },
  post: {
    id: string;
    slug?: string | null;
    type?: string | null;
    publishedAt?: Date | null;
    videoUrl?: string | null;
    youtubeVideoId?: string | null;
    media?: Array<{ type?: string | null }>;
    user: PublicVisibilityUser | null;
  },
): Promise<PublicPostUrlVerification> {
  const origin = getSiteOriginForOg();
  const slug = post.slug?.trim();
  const fallbackUrl = buildPostPublicUrl(origin, { ...post, slug: slug ?? undefined });

  if (!slug) {
    return { ok: false, reason: 'missing_slug', generatedUrl: fallbackUrl };
  }

  const resolved = await resolvePublicPostBySlug(prisma, slug);
  const generatedUrl = buildPostPublicUrl(origin, { ...post, slug: resolved?.slug ?? slug });

  if (!resolved) {
    return { ok: false, reason: 'slug_not_resolvable', generatedUrl };
  }

  if (!isPublicPostDetailVisible(post)) {
    return { ok: false, reason: 'not_public', generatedUrl };
  }

  return { ok: true, slug: resolved.slug, generatedUrl };
}
