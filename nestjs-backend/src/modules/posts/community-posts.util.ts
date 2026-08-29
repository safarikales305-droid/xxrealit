import { PortalWorkerStatus, PostSource, UserRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  isCommunityPostAuthorVisible,
  PROFESSIONAL_PUBLIC_ROLES_LIST,
  type PublicVisibilityUser,
} from '../../common/public-visibility.util';

export const EDITORIAL_FEED_POST_TYPES = [
  'COMPANY_REVIEW',
  'NEWS_ARTICLE',
  'YOUTUBE_VIDEO',
] as const;

export type EditorialFeedPostType = (typeof EDITORIAL_FEED_POST_TYPES)[number];

export function isEditorialFeedPostType(type: string | null | undefined): boolean {
  return EDITORIAL_FEED_POST_TYPES.includes(type as EditorialFeedPostType);
}

export const PROFESSIONAL_POST_ROLES = [
  'AGENT',
  'COMPANY',
  'AGENCY',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'PORTAL_WORKER',
] as const;

export function isPublicMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  return v.startsWith('/');
}

export type CommunityPostRow = {
  id: string;
  media: Array<{ url: string }>;
  externalUrl?: string | null;
  previewImage?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  facebookEmbedUrl?: string | null;
  description?: string | null;
  content?: string | null;
  source?: PostSource | string | null;
  isFacebookPagePost?: boolean | null;
  facebookExternalId?: string | null;
  facebookPermalink?: string | null;
  youtubeVideoId?: string | null;
  publishedAt?: Date | null;
  createdAt: Date;
};

export function postHasFeedVisibility(row: CommunityPostRow): boolean {
  if (row.youtubeVideoId?.trim()) return true;
  if (row.facebookEmbedUrl?.trim()) return true;
  if (row.media.length > 0) return true;
  if (row.imageUrl?.trim() || row.videoUrl?.trim()) return true;
  if (row.externalUrl?.trim() || row.previewImage?.trim()) return true;
  const text = (row.description ?? row.content ?? '').trim();
  if (text) return true;
  if (row.source === PostSource.FACEBOOK || row.isFacebookPagePost) return true;
  return false;
}

/** Role autora povolené ve veřejném feedu příspěvků (stejný seznam jako katalog profesionálů). */
export function communityPostAuthorRoles(): readonly UserRole[] {
  return PROFESSIONAL_PUBLIC_ROLES_LIST;
}

export function isCommunityPostAuthorVisibleUser(
  user: PublicVisibilityUser | null | undefined,
): boolean {
  if (!user) return false;
  return isCommunityPostAuthorVisible(user);
}

export function communityPostAuthorUserWhere(): Prisma.UserWhereInput {
  return {
    accountLimited: false,
    publicProfile: true,
    role: { in: PROFESSIONAL_PUBLIC_ROLES_LIST },
    OR: [
      { role: { not: UserRole.PORTAL_WORKER } },
      { portalWorkerStatus: PortalWorkerStatus.APPROVED },
    ],
  };
}

export function buildCommunityPostsWhere(authorRole?: import('@prisma/client').UserRole): Prisma.PostWhereInput {
  const professionalAuthor: Prisma.PostWhereInput = {
    user: {
      ...communityPostAuthorUserWhere(),
      ...(authorRole ? { role: authorRole } : {}),
    },
  };

  return {
    type: { not: 'short' },
    OR: [
      { type: 'COMPANY_REVIEW' },
      { type: 'NEWS_ARTICLE' },
      { type: 'YOUTUBE_VIDEO' },
      professionalAuthor,
    ],
  };
}

export function sortCommunityPostsByDate<T extends { publishedAt?: Date | null; createdAt: Date }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime(),
  );
}

function postAuthorId(row: { userId?: string; user?: { id: string } }): string | null {
  const id = row.userId?.trim() || row.user?.id?.trim();
  return id || null;
}

/** Nejdříve příspěvky sledovaných autorů, v rámci skupin podle data. */
export function sortCommunityPostsWithFollowPriority<
  T extends { userId?: string; user?: { id: string }; publishedAt?: Date | null; createdAt: Date },
>(rows: T[], followedUserIds: ReadonlySet<string>): T[] {
  if (followedUserIds.size === 0) return sortCommunityPostsByDate(rows);
  const followed: T[] = [];
  const others: T[] = [];
  for (const row of rows) {
    const authorId = postAuthorId(row);
    if (authorId && followedUserIds.has(authorId)) {
      followed.push(row);
    } else {
      others.push(row);
    }
  }
  return [...sortCommunityPostsByDate(followed), ...sortCommunityPostsByDate(others)];
}

/** Odstraní duplicity podle facebookExternalId / permalink / externalUrl. */
export function dedupeCommunityPosts<T extends CommunityPostRow>(rows: T[]): T[] {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const row of rows) {
    if (seenIds.has(row.id)) continue;

    const keys = [
      row.facebookExternalId?.trim(),
      row.facebookPermalink?.trim(),
      row.externalUrl?.trim(),
      (row as { youtubeVideoId?: string | null }).youtubeVideoId?.trim(),
      (row as { editorialExternalId?: string | null }).editorialExternalId?.trim(),
    ].filter((k): k is string => Boolean(k));

    if (keys.some((k) => seenKeys.has(k))) continue;

    seenIds.add(row.id);
    for (const k of keys) seenKeys.add(k);
    result.push(row);
  }

  return result;
}
