import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { communityPostAuthorUserWhere } from '../posts/community-posts.util';

type CacheEntry = { expiresAt: number; data: unknown };

@Injectable()
export class CompanyPortalFeedService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getLatestPublicPosts(limit = 5) {
    const safeLimit = Math.min(10, Math.max(1, Math.trunc(limit) || 5));
    const cacheKey = `latest:${safeLimit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const rows = await this.prisma.post.findMany({
      where: {
        publishedAt: { not: null },
        user: communityPostAuthorUserWhere(),
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: safeLimit,
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
      },
    });

    const items = rows.map((row) => {
      const thumb = row.media[0];
      const authorName =
        row.user.companyProfile?.companyName?.trim() || row.user.name?.trim() || 'Uživatel';
      const avatarUrl = row.user.companyProfile?.logoUrl || row.user.avatar || null;
      const postSlug = row.slug ?? row.id;
      const excerpt = (row.content ?? row.description ?? '').trim().slice(0, 180);
      return {
        id: row.id,
        slug: postSlug,
        authorName,
        authorAvatarUrl: avatarUrl,
        category: row.category,
        excerpt,
        thumbnailUrl: thumb?.url ?? row.previewImage ?? row.imageUrl ?? null,
        mediaType: thumb?.type ?? null,
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
        href: `/prispevek/${postSlug}`,
      };
    });

    const payload = { items, cachedAt: new Date().toISOString() };
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.ttlMs, data: payload });
    return payload;
  }

  async getCompanyPosts(companyId: string, limit = 5) {
    const safeLimit = Math.min(10, Math.max(1, Math.trunc(limit) || 5));
    const rows = await this.prisma.post.findMany({
      where: {
        companyDirectoryId: companyId,
        publishedAt: { not: null },
      },
      orderBy: [{ publishedAt: 'desc' }],
      take: safeLimit,
      include: {
        media: { orderBy: { order: 'asc' }, take: 1 },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug ?? row.id,
      category: row.category,
      excerpt: (row.content ?? row.description ?? '').trim().slice(0, 180),
      thumbnailUrl: row.media[0]?.url ?? row.previewImage ?? row.imageUrl ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      href: `/prispevek/${row.slug ?? row.id}`,
    }));
  }
}
