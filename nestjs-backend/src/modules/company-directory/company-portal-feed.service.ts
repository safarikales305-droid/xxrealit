import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { communityPostAuthorUserWhere } from '../posts/community-posts.util';
import {
  portalPostFeedInclude,
  serializePortalPostFeedItem,
} from '../posts/portal-post-feed.serializer';

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
      include: portalPostFeedInclude,
    });

    const items = rows.map((row) => serializePortalPostFeedItem(row));
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
      include: portalPostFeedInclude,
    });
    return rows.map((row) => serializePortalPostFeedItem(row));
  }
}
