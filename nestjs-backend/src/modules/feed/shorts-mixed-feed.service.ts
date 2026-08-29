import { Injectable, Logger } from '@nestjs/common';
import { NewsArticleStatus, PortalWorkerStatus, UserRole } from '@prisma/client';
import type { PublicVisibilityUser } from '../../common/public-visibility.util';
import { PrismaService } from '../../database/prisma.service';
import type { PublicPropertyListFilters } from '../properties/properties.service';
import { PropertiesService } from '../properties/properties.service';
import { ListingContactUnlockService } from '../properties/listing-contact-unlock.service';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import {
  buildCommunityPostsWhere,
  isCommunityPostAuthorVisibleUser,
  isPublicMediaUrl,
  postHasFeedVisibility,
} from '../posts/community-posts.util';
import { NEWS_CATEGORY_LABELS } from '../news-editorial/news-editorial.constants';
import { ShortsFeedSettingsService } from './shorts-feed-settings.service';
import type { ShortsFeedSettings } from './shorts-feed-settings.types';
import type {
  ShortsFeedCursor,
  ShortsFeedItem,
  ShortsFeedResponse,
  ShortsItemType,
} from './shorts-mixed-feed.types';

const POOL_CACHE_MS = 60_000;
const POOL_FETCH_LIMIT = 120;
const FINANCE_NEWS_CATEGORIES = new Set(['hypoteky', 'investice', 'trh', 'ceny-nemovitosti']);
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^&\s]+&)*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

type ScoredPoolItem = ShortsFeedItem;

type CachedPools = {
  expiresAt: number;
  properties: ScoredPoolItem[];
  content: ScoredPoolItem[];
  propertyCount: number;
};

@Injectable()
export class ShortsMixedFeedService {
  private readonly log = new Logger(ShortsMixedFeedService.name);
  private poolCache = new Map<string, CachedPools>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly listingContactUnlock: ListingContactUnlockService,
    private readonly settingsService: ShortsFeedSettingsService,
  ) {}

  async getFeed(params: {
    viewerId?: string;
    filters?: PublicPropertyListFilters;
    cursor?: string;
    limit?: number;
  }): Promise<ShortsFeedResponse> {
    const limit = Math.min(30, Math.max(1, Math.trunc(params.limit ?? 15) || 15));
    const offset = this.decodeCursor(params.cursor);
    const settings = await this.settingsService.getSettings();
    const cacheKey = this.cacheKey(params.filters, settings);
    const pools = await this.loadPools(params.viewerId, params.filters, settings, cacheKey);
    const mixed = this.applyOpeningHook(
      this.mixPools(pools.properties, pools.content, settings, pools.propertyCount),
    );
    this.logFeedComposition('pools', [...pools.properties, ...pools.content]);
    this.logFeedComposition('mixed', mixed);
    const page = mixed.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const hasMore = nextOffset < mixed.length;

    return {
      items: page,
      nextCursor: hasMore ? this.encodeCursor({ offset: nextOffset }) : null,
      hasMore,
    };
  }

  private cacheKey(filters: PublicPropertyListFilters | undefined, settings: ShortsFeedSettings): string {
    return JSON.stringify({ filters: filters ?? {}, settings });
  }

  private decodeCursor(raw?: string): number {
    if (!raw?.trim()) return 0;
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as ShortsFeedCursor;
      const o = parsed?.offset;
      return typeof o === 'number' && Number.isFinite(o) && o >= 0 ? Math.trunc(o) : 0;
    } catch {
      return 0;
    }
  }

  private encodeCursor(cursor: ShortsFeedCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private async loadPools(
    viewerId: string | undefined,
    filters: PublicPropertyListFilters | undefined,
    settings: ShortsFeedSettings,
    cacheKey: string,
  ): Promise<CachedPools> {
    const now = Date.now();
    const cached = this.poolCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached;

    const [properties, content] = await Promise.all([
      this.safePool('properties', () => this.fetchPropertyPool(viewerId, filters, settings)),
      this.safePool('content', () => this.fetchContentPool(settings)),
    ]);

    const result: CachedPools = {
      expiresAt: now + POOL_CACHE_MS,
      properties,
      content,
      propertyCount: properties.length,
    };
    this.poolCache.set(cacheKey, result);
    return result;
  }

  private async safePool(
    label: string,
    fn: () => Promise<ScoredPoolItem[]>,
  ): Promise<ScoredPoolItem[]> {
    try {
      return await fn();
    } catch (err) {
      this.log.warn(
        `[shorts/feed] ${label} provider failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async fetchPropertyPool(
    viewerId: string | undefined,
    filters: PublicPropertyListFilters | undefined,
    settings: ShortsFeedSettings,
  ): Promise<ScoredPoolItem[]> {
    if (!settings.showProperties) return [];

    const viewer = viewerId
      ? await this.prisma.user.findUnique({
          where: { id: viewerId },
          select: { id: true, role: true, isPremiumBroker: true },
        })
      : null;
    const access: PropertyViewerAccess | undefined = viewer
      ? {
          role: viewer.role,
          isPremiumBroker: Boolean(viewer.isPremiumBroker),
          isAdmin: viewer.role === UserRole.ADMIN,
        }
      : undefined;

    const shortsWhere = this.properties.buildShortsPublicWhere(filters);
    const shortsRows = await this.prisma.property.findMany({
      where: shortsWhere,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: POOL_FETCH_LIMIT,
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
        tiparPostPublished: { select: { id: true, contactUnlockPrice: true } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true, name: true, avatar: true } },
      },
    });

    const shortsItems = await this.serializePropertyRows(
      shortsRows,
      viewerId,
      access,
      'property',
      settings,
    );

    let classicVideoItems: ScoredPoolItem[] = [];
    if (shortsItems.length < 20) {
      const filterParts: object[] = [];
      const filterWhere = this.properties.buildShortsPublicWhere(filters);
      if (filterWhere.AND && Array.isArray(filterWhere.AND)) {
        for (const part of filterWhere.AND) {
          if (part && part !== shortsWhere) filterParts.push(part);
        }
      }
      const classicRows = await this.prisma.property.findMany({
        where: {
          AND: [
            classicPublicListingWhere,
            ...filterParts,
            {
              OR: [
                { media: { some: { type: 'video' } } },
                { AND: [{ videoUrl: { not: null } }, { NOT: { videoUrl: '' } }] },
              ],
            },
          ],
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.max(0, POOL_FETCH_LIMIT - shortsItems.length),
        include: {
          media: { orderBy: { sortOrder: 'asc' } },
          tiparPostPublished: { select: { id: true, contactUnlockPrice: true } },
          _count: { select: { likes: true } },
          user: { select: { id: true, city: true, name: true, avatar: true } },
        },
      });
      const shortsIds = new Set(shortsRows.map((r) => r.id));
      classicVideoItems = await this.serializePropertyRows(
        classicRows.filter((r) => !shortsIds.has(r.id)),
        viewerId,
        access,
        'property-video',
        settings,
      );
    }

    const merged = [...shortsItems, ...classicVideoItems];
    merged.sort((a, b) => b.score - a.score);
    return merged;
  }

  private async serializePropertyRows(
    rows: Array<{
      id: string;
      userId: string;
      publishedAt: Date | null;
      createdAt: Date;
      isTiparTip: boolean | null;
      isContactPaid: boolean | null;
      isOwnerListing: boolean | null;
      contactUnlockPrice: number | null;
      tiparPostPublished: { id: string; contactUnlockPrice: number | null } | null;
      media: Array<{ type: string; url: string; sortOrder: number; id: string }>;
      videoUrl: string | null;
      images: string[];
      [key: string]: unknown;
    }>,
    viewerId: string | undefined,
    access: PropertyViewerAccess | undefined,
    contentType: 'property' | 'property-video',
    settings: ShortsFeedSettings,
  ): Promise<ScoredPoolItem[]> {
    const items: ScoredPoolItem[] = [];
    for (const r of rows) {
      const hasVideo =
        (r.videoUrl ?? '').trim().length > 0 || r.media.some((m) => m.type === 'video');
      const hasImage =
        (Array.isArray(r.images) && r.images.length > 0) ||
        r.media.some((m) => m.type === 'image');
      if (!hasVideo && !hasImage) continue;

      const isOwner = Boolean(viewerId && r.userId === viewerId);
      const hasViewerUnlock = viewerId
        ? await this.listingContactUnlock.hasUnlocked(viewerId, r.id, Boolean(r.isTiparTip))
        : false;
      const contactUnlocked = isOwner || hasViewerUnlock;
      const sellerContactVisible = !isOwner && hasViewerUnlock;
      const contactUnlockPrice = await this.listingContactUnlock.resolveUnlockPrice({
        id: r.id,
        isTiparTip: Boolean(r.isTiparTip),
        isContactPaid: Boolean(r.isContactPaid),
        isOwnerListing: Boolean(r.isOwnerListing),
        contactUnlockPrice: r.contactUnlockPrice ?? 0,
      });

      const base = serializeProperty(
        { ...r, likes: [] as { id: string }[] } as unknown as Parameters<typeof serializeProperty>[0],
        viewerId,
        access,
        {
          contactUnlocked,
          sellerContactVisible,
          contactUnlockPrice,
          contactUnlockAvailable: await this.listingContactUnlock.isContactUnlockAvailableForProperty(
            r.id,
          ),
          isContactPaid: Boolean(r.isContactPaid) || Boolean(r.isTiparTip),
        },
      ) as Record<string, unknown>;

      const payload = {
        ...base,
        tiparPostId: r.tiparPostPublished?.id ?? null,
        contactUnlockPrice: r.tiparPostPublished?.contactUnlockPrice ?? contactUnlockPrice,
      };

      const publishedAt = r.publishedAt ?? r.createdAt;
      const priorityBoost =
        settings.propertyPriority === 'high' ? 25 : settings.propertyPriority === 'medium' ? 12 : 0;
      let score = this.computeScore(publishedAt, settings, priorityBoost);
      if (r.isTiparTip) score += 50;

      items.push({
        feedKey: `${contentType}:${r.id}`,
        contentType,
        score,
        publishedAt: publishedAt.toISOString(),
        payload,
      });
    }
    return items;
  }

  private postRowInclude() {
    return {
      media: { orderBy: { order: 'asc' as const } },
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          publicProfile: true,
          accountLimited: true,
          portalWorkerStatus: true,
        },
      },
    };
  }

  private mapPostRowsToShortsItems(
    rows: Array<
      Parameters<ShortsMixedFeedService['mapPostToShortsItem']>[0] & {
        type: string;
        user: PublicVisibilityUser & { name: string | null };
      }
    >,
    settings: ShortsFeedSettings,
  ): ScoredPoolItem[] {
    const items: ScoredPoolItem[] = [];
    for (const row of rows) {
      const type = String(row.type ?? '');
      const isEditorial =
        type === 'COMPANY_REVIEW' || type === 'NEWS_ARTICLE' || type === 'YOUTUBE_VIDEO';
      if (!isEditorial && !isCommunityPostAuthorVisibleUser(row.user)) continue;
      if (!postHasFeedVisibility(row)) continue;

      if (type === 'YOUTUBE_VIDEO' && !settings.showYoutube) continue;
      if (type === 'NEWS_ARTICLE' && !settings.showArticles && !settings.showEditorial) continue;
      if (type === 'COMPANY_REVIEW' && !settings.showEditorial) continue;
      if (type === 'post' && !settings.showUserPosts) continue;

      const mapped = this.mapPostToShortsItem(row, settings);
      if (mapped) items.push(mapped);
    }
    return items;
  }

  private async fetchContentPool(settings: ShortsFeedSettings): Promise<ScoredPoolItem[]> {
    const items: ScoredPoolItem[] = [];
    const postFetches: Promise<void>[] = [];

    if (settings.showYoutube) {
      postFetches.push(
        (async () => {
          const rows = await this.prisma.post.findMany({
            where: {
              AND: [buildCommunityPostsWhere(), { type: 'YOUTUBE_VIDEO' }],
            },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: POOL_FETCH_LIMIT,
            include: this.postRowInclude(),
          });
          items.push(...this.mapPostRowsToShortsItems(rows, settings));
        })(),
      );
    }

    if (settings.showArticles || settings.showEditorial || settings.showUserPosts) {
      postFetches.push(
        (async () => {
          const types: string[] = [];
          if (settings.showArticles || settings.showEditorial) {
            types.push('NEWS_ARTICLE', 'COMPANY_REVIEW');
          }
          if (settings.showUserPosts) types.push('post');
          if (types.length === 0) return;

          const rows = await this.prisma.post.findMany({
            where: {
              AND: [buildCommunityPostsWhere(), { type: { in: types } }],
            },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: POOL_FETCH_LIMIT,
            include: this.postRowInclude(),
          });
          items.push(...this.mapPostRowsToShortsItems(rows, settings));
        })(),
      );
    }

    if (settings.showNews || settings.showFinanceNews) {
      postFetches.push(
        (async () => {
          const rows = await this.prisma.newsArticle.findMany({
            where: {
              status: NewsArticleStatus.PUBLISHED,
              publishedAt: { not: null },
              ogImageUrl: { not: null },
            },
            orderBy: [{ publishedAt: 'desc' }],
            take: POOL_FETCH_LIMIT,
            select: {
              id: true,
              slug: true,
              title: true,
              perex: true,
              ogImageUrl: true,
              category: true,
              publishedAt: true,
              canonicalPath: true,
            },
          });

          for (const row of rows) {
            const imageUrl = (row.ogImageUrl ?? '').trim();
            if (!imageUrl) continue;

            const isFinance = FINANCE_NEWS_CATEGORIES.has(row.category);
            if (isFinance && !settings.showFinanceNews) continue;
            if (!isFinance && !settings.showNews) continue;

            const contentType: ShortsItemType = isFinance ? 'finance' : 'news';
            const publishedAt = row.publishedAt!;
            const categoryLabel =
              NEWS_CATEGORY_LABELS[row.category as keyof typeof NEWS_CATEGORY_LABELS] ?? row.category;

            items.push({
              feedKey: `${contentType}:${row.id}`,
              contentType,
              score: this.computeScore(publishedAt, settings),
              publishedAt: publishedAt.toISOString(),
              payload: {
                id: row.id,
                slug: row.slug,
                title: row.title,
                teaser: row.perex,
                imageUrl,
                category: row.category,
                categoryLabel,
                sourceName: 'XXREALIT Aktuality',
                href: row.canonicalPath?.trim() || `/aktuality/${row.slug}`,
              },
            });
          }
        })(),
      );
    }

    await Promise.all(postFetches);
    const deduped = new Map<string, ScoredPoolItem>();
    for (const item of items) {
      if (!deduped.has(item.feedKey)) deduped.set(item.feedKey, item);
    }
    const merged = [...deduped.values()];
    merged.sort((a, b) => b.score - a.score);
    return merged;
  }

  private mapPostToShortsItem(
    row: {
    id: string;
    type: string;
    title: string;
    description: string;
    content: string | null;
    slug: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    previewImage: string | null;
    previewTitle: string | null;
    youtubeVideoId: string | null;
    youtubeChannelTitle: string | null;
    youtubeThumbnailUrl: string | null;
    youtubeEmbeddable: boolean;
    externalUrl?: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    user: { name: string | null };
    media: Array<{ url: string; type: string }>;
  },
    settings: ShortsFeedSettings,
  ): ScoredPoolItem | null {
    const type = String(row.type ?? '');
    const publishedAt = row.publishedAt ?? row.createdAt;
    const teaser = (row.description || row.content || '').trim().slice(0, 280);
    const slug = row.slug?.trim() || row.id;

    if (type === 'YOUTUBE_VIDEO') {
      const videoId = this.resolveYoutubeVideoId(row);
      if (!videoId) return null;
      const thumb =
        row.youtubeThumbnailUrl?.trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        feedKey: `youtube:${videoId}`,
        contentType: 'youtube',
        score: this.computeScore(publishedAt, settings),
        publishedAt: publishedAt.toISOString(),
        payload: {
          id: row.id,
          slug,
          title: row.title || row.previewTitle || 'YouTube video',
          teaser,
          imageUrl: thumb,
          youtubeVideoId: videoId,
          youtubeChannelTitle: row.youtubeChannelTitle ?? 'YouTube',
          youtubeThumbnailUrl: thumb,
          youtubeEmbeddable: row.youtubeEmbeddable !== false,
          sourceName: row.youtubeChannelTitle ?? 'YouTube',
          href: `/prispevek/${slug}`,
        },
      };
    }

    const imageUrl = this.resolvePostImage(row);
    if (!imageUrl) return null;

    const contentType: ShortsItemType =
      type === 'NEWS_ARTICLE' ? 'article' : type === 'COMPANY_REVIEW' ? 'editorial' : 'post';

    return {
      feedKey: `${contentType}:${row.id}`,
      contentType,
      score: this.computeScore(publishedAt, settings),
      publishedAt: publishedAt.toISOString(),
      payload: {
        id: row.id,
        slug,
        title: row.title || row.previewTitle || 'Příspěvek',
        teaser,
        imageUrl,
        videoUrl: row.videoUrl?.trim() || null,
        category: contentType,
        categoryLabel:
          contentType === 'article'
            ? 'Článek'
            : contentType === 'editorial'
              ? 'AI redakce'
              : 'Příspěvek',
        sourceName: row.user.name ?? 'XXREALIT',
        href: `/prispevek/${slug}`,
      },
    };
  }

  private resolvePostImage(row: {
    imageUrl: string | null;
    previewImage: string | null;
    videoUrl: string | null;
    youtubeThumbnailUrl: string | null;
    media: Array<{ url: string; type: string }>;
  }): string | null {
    const candidates = [
      row.imageUrl,
      row.previewImage,
      row.youtubeThumbnailUrl,
      ...row.media.map((m) => m.url),
    ];
    for (const c of candidates) {
      if (isPublicMediaUrl(c)) return c!.trim();
    }
    if (row.videoUrl?.trim() && isPublicMediaUrl(row.videoUrl)) return row.videoUrl.trim();
    return null;
  }

  private parseYoutubeIdFromText(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
    const match = trimmed.match(YOUTUBE_URL_RE);
    return match?.[1] && YOUTUBE_ID_RE.test(match[1]) ? match[1] : null;
  }

  private resolveYoutubeVideoId(row: {
    youtubeVideoId?: string | null;
    videoUrl?: string | null;
    externalUrl?: string | null;
    description?: string | null;
    content?: string | null;
  }): string | null {
    const direct = row.youtubeVideoId?.trim();
    if (direct && YOUTUBE_ID_RE.test(direct)) return direct;
    for (const candidate of [
      row.videoUrl,
      row.externalUrl,
      row.description,
      row.content,
    ]) {
      const parsed = this.parseYoutubeIdFromText(String(candidate ?? ''));
      if (parsed) return parsed;
    }
    return null;
  }

  private logFeedComposition(label: string, items: ScoredPoolItem[]): void {
    if (process.env.NODE_ENV === 'production') return;
    const count = (type: ShortsItemType) => items.filter((i) => i.contentType === type).length;
    this.log.debug(
      `[shorts/feed] ${label}: properties=${count('property') + count('property-video')} youtube=${count('youtube')} articles=${count('article')} news=${count('news')} editorial=${count('editorial')} finance=${count('finance')} posts=${count('post')} total=${items.length}`,
    );
  }

  private mixPools(
    properties: ScoredPoolItem[],
    content: ScoredPoolItem[],
    settings: ShortsFeedSettings,
    propertyCount: number,
  ): ScoredPoolItem[] {
    const { propsPerBatch } = this.resolveMixPattern(propertyCount, settings);
    const result: ScoredPoolItem[] = [];
    const seen = new Set<string>();
    let pi = 0;
    let ci = 0;

    const takeProperty = (): boolean => {
      while (pi < properties.length) {
        const item = properties[pi++];
        if (!seen.has(item.feedKey)) {
          seen.add(item.feedKey);
          result.push(item);
          return true;
        }
      }
      return false;
    };

    const takeContent = (): boolean => {
      while (ci < content.length) {
        const item = content[ci++];
        if (!seen.has(item.feedKey)) {
          seen.add(item.feedKey);
          result.push(item);
          return true;
        }
      }
      return false;
    };

    if (properties.length === 0) {
      while (takeContent()) {
        /* content only */
      }
      return result;
    }

    while (pi < properties.length || ci < content.length) {
      let insertedProps = 0;
      for (let i = 0; i < propsPerBatch; i++) {
        if (!takeProperty()) break;
        insertedProps++;
      }
      if (!takeContent()) {
        while (takeProperty()) {
          /* drain */
        }
        break;
      }
      if (insertedProps === 0 && pi >= properties.length) {
        while (takeContent()) {
          /* content only tail */
        }
        break;
      }
    }

    return result;
  }

  private resolveMixPattern(
    propertyCount: number,
    settings: ShortsFeedSettings,
  ): { propsPerBatch: number; contentPerBatch: number } {
    let ratio = settings.minPropertyRatioPercent;
    if (propertyCount <= 10) ratio = settings.propertyRatioTierLow;
    else if (propertyCount <= 50) ratio = settings.propertyRatioTierMid;
    else ratio = settings.propertyRatioTierHigh;
    ratio = Math.max(ratio, settings.minPropertyRatioPercent);
    ratio = Math.min(100, Math.max(0, ratio));

    if (ratio >= 100 || propertyCount === 0) {
      return { propsPerBatch: 1, contentPerBatch: 0 };
    }
    if (ratio <= 0) {
      return { propsPerBatch: 0, contentPerBatch: 1 };
    }

    const contentPerBatch = 1;
    const fromTier = Math.max(1, Math.round((ratio / (100 - ratio)) * contentPerBatch));
    const fromSettings = Math.max(1, settings.contentEveryNItems - 1);
    let propsPerBatch = Math.max(fromSettings, fromTier);
    if (settings.propertyPriority === 'medium') {
      propsPerBatch = Math.max(1, propsPerBatch - 1);
    } else if (settings.propertyPriority === 'low') {
      propsPerBatch = Math.max(1, propsPerBatch - 2);
    }
    return { propsPerBatch, contentPerBatch };
  }

  private computeScore(
    publishedAt: Date,
    settings: ShortsFeedSettings,
    extraBoost = 0,
  ): number {
    let score = publishedAt.getTime() / 1_000_000_000 + extraBoost;
    if (settings.preferNewContent) {
      const ageDays = (Date.now() - publishedAt.getTime()) / 86_400_000;
      score += Math.max(0, 45 - ageDays) * 1.5;
    }
    return score;
  }

  private isPropertyItem(item: ScoredPoolItem): boolean {
    return item.contentType === 'property' || item.contentType === 'property-video';
  }

  private propertyOpeningScore(item: ScoredPoolItem): number {
    const payload = item.payload as Record<string, unknown>;
    let score = item.score ?? 0;
    if (payload.isTiparTip === true) score += 100;
    if (item.contentType === 'property-video') score += 40;
    return score;
  }

  private applyOpeningHook(items: ScoredPoolItem[]): ScoredPoolItem[] {
    if (items.length <= 1) return items;

    const pool = [...items];
    const opening: ScoredPoolItem[] = [];

    const take = (pred: (item: ScoredPoolItem) => boolean) => {
      const idx = pool.findIndex(pred);
      if (idx < 0) return;
      opening.push(...pool.splice(idx, 1));
    };

    const properties = pool
      .filter((item) => this.isPropertyItem(item))
      .sort((a, b) => this.propertyOpeningScore(b) - this.propertyOpeningScore(a));
    if (properties[0]) {
      const idx = pool.findIndex((item) => item.feedKey === properties[0].feedKey);
      if (idx >= 0) opening.push(...pool.splice(idx, 1));
    }

    take(
      (item) =>
        item.contentType === 'youtube' ||
        item.contentType === 'property-video' ||
        item.contentType === 'editorial',
    );
    take((item) => ['news', 'finance', 'article'].includes(item.contentType));

    while (opening.length < 3 && pool.length > 0) {
      opening.push(pool.shift()!);
    }

    return [...opening, ...pool];
  }
}
