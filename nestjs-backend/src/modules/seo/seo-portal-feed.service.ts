import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { communityPostAuthorUserWhere } from '../posts/community-posts.util';

type CacheEntry = { expiresAt: number; data: unknown };

export type SeoPortalPostItem = {
  id: string;
  slug: string;
  authorName: string;
  authorAvatarUrl: string | null;
  category: string | null;
  excerpt: string;
  thumbnailUrl: string | null;
  mediaType: string | null;
  publishedAt: string;
  href: string;
  reactionCount: number;
};

@Injectable()
export class SeoPortalFeedService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 90_000;

  constructor(private readonly prisma: PrismaService) {}

  async getLatestForSeoPage(input?: {
    cityName?: string | null;
    regionName?: string | null;
    limit?: number;
  }): Promise<{ items: SeoPortalPostItem[]; cachedAt: string }> {
    const limit = Math.min(5, Math.max(1, input?.limit ?? 5));
    const cacheKey = `seo:${input?.cityName ?? ''}:${input?.regionName ?? ''}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as { items: SeoPortalPostItem[]; cachedAt: string };
    }

    const city = input?.cityName?.trim();
    const region = input?.regionName?.trim();
    const relevantWhere: Prisma.PostWhereInput[] = [];
    if (city) {
      relevantWhere.push({
        OR: [
          { city: { contains: city, mode: 'insensitive' } },
          { title: { contains: city, mode: 'insensitive' } },
          { content: { contains: city, mode: 'insensitive' } },
        ],
      });
    } else if (region) {
      relevantWhere.push({
        OR: [
          { city: { contains: region, mode: 'insensitive' } },
          { content: { contains: region, mode: 'insensitive' } },
        ],
      });
    }

    const baseWhere: Prisma.PostWhereInput = {
      publishedAt: { not: null },
      user: communityPostAuthorUserWhere(),
    };

    const relevant = relevantWhere.length
      ? await this.fetchPosts({ AND: [baseWhere, ...relevantWhere] }, limit)
      : [];

    const remaining = limit - relevant.length;
    const general =
      remaining > 0
        ? await this.fetchPosts(
            {
              AND: [
                baseWhere,
                relevant.length ? { id: { notIn: relevant.map((p) => p.id) } } : {},
              ],
            },
            remaining,
          )
        : [];

    const payload = {
      items: [...relevant, ...general].slice(0, limit),
      cachedAt: new Date().toISOString(),
    };
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.ttlMs, data: payload });
    return payload;
  }

  private async fetchPosts(where: Prisma.PostWhereInput, take: number) {
    const rows = await this.prisma.post.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take,
      include: {
        media: { orderBy: { order: 'asc' }, take: 1 },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            companyProfile: { select: { companyName: true, logoUrl: true } },
          },
        },
        _count: { select: { reactions: true } },
      },
    });

    return rows.map((row) => this.serialize(row));
  }

  private serialize(
    row: Prisma.PostGetPayload<{
      include: {
        media: true;
        user: {
          select: {
            id: true;
            name: true;
            avatar: true;
            companyProfile: { select: { companyName: true; logoUrl: true } };
          };
        };
        _count: { select: { reactions: true } };
      };
    }>,
  ): SeoPortalPostItem {
    const thumb = row.media[0];
    const authorName =
      row.user.companyProfile?.companyName?.trim() || row.user.name?.trim() || 'Uživatel';
    const postSlug = row.slug ?? row.id;
    return {
      id: row.id,
      slug: postSlug,
      authorName,
      authorAvatarUrl: row.user.companyProfile?.logoUrl || row.user.avatar || null,
      category: row.category,
      excerpt: (row.content ?? row.description ?? row.title ?? '').trim().slice(0, 180),
      thumbnailUrl: thumb?.url ?? row.previewImage ?? row.imageUrl ?? null,
      mediaType: thumb?.type ?? null,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      href: `/prispevek/${postSlug}`,
      reactionCount: row._count.reactions,
    };
  }
}
