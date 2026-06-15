import { PostCategory, PostSource, UserRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export const PROFESSIONAL_POST_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

export function isPublicMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  return /^https?:\/\//i.test(v);
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
  publishedAt?: Date | null;
  createdAt: Date;
};

export function postHasFeedVisibility(row: CommunityPostRow): boolean {
  if (row.facebookEmbedUrl?.trim()) return true;
  if (row.media.length > 0) return true;
  if (row.imageUrl?.trim() || row.videoUrl?.trim()) return true;
  if (row.externalUrl?.trim() || row.previewImage?.trim()) return true;
  const text = (row.description ?? row.content ?? '').trim();
  if (text && (row.source === PostSource.FACEBOOK || row.isFacebookPagePost)) return true;
  if (row.source === PostSource.FACEBOOK || row.isFacebookPagePost) return true;
  return false;
}

export function buildCommunityPostsWhere(category?: PostCategory): Prisma.PostWhereInput {
  return {
    type: { not: 'short' },
    user: {
      role: { in: PROFESSIONAL_POST_ROLES },
    },
    ...(category
      ? {
          category,
          NOT: {
            AND: [{ source: PostSource.FACEBOOK }, { professionalProfileId: null }],
          },
        }
      : {}),
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
    ].filter((k): k is string => Boolean(k));

    if (keys.some((k) => seenKeys.has(k))) continue;

    seenIds.add(row.id);
    for (const k of keys) seenKeys.add(k);
    result.push(row);
  }

  return result;
}
