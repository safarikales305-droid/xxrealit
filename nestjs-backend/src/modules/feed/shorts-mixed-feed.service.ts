import { Injectable, Logger } from '@nestjs/common';
import { NewsArticleStatus, NewsSourceHealth, NewsSourceType, PortalWorkerStatus, UserRole } from '@prisma/client';
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
import { parseShortPublicId, type ParsedShortPublicId } from './shorts-public-id.util';
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
    target?: string;
    collection?: string;
  }): Promise<ShortsFeedResponse> {
    const collectionId = params.collection?.trim();
    if (collectionId) {
      return this.getFeedForCollection(collectionId, params);
    }
    const limit = Math.min(30, Math.max(1, Math.trunc(params.limit ?? 15) || 15));
    const offset = this.decodeCursor(params.cursor);
    const settings = await this.settingsService.getSettings();
    const cacheKey = this.cacheKey(params.filters, settings);
    const pools = await this.loadPools(params.viewerId, params.filters, settings, cacheKey);
    const properties = pools.properties.filter((item) => this.isRenderableShortItem(item));
    const content = pools.content.filter((item) => this.isRenderableShortItem(item));
    let mixed = this.applyOpeningHook(
      this.mixPools(properties, content, settings, properties.length),
      properties.length,
      settings,
    );
    this.logFeedSummary('pools', properties, content);
    this.logFeedSummary('mixed', properties, content, mixed);

    const targetKey = params.target?.trim() || null;
    let targetIndexInPage: number | null = null;
    let targetFound = false;

    if (targetKey && offset === 0) {
      const parsed = parseShortPublicId(targetKey);
      if (parsed) {
        let targetIndex = mixed.findIndex(
          (item) =>
            item.feedKey === parsed.feedKey ||
            (parsed.contentType === 'property' &&
              (item.feedKey === `property:${parsed.id}` ||
                item.feedKey === `property-video:${parsed.id}`)),
        );

        if (targetIndex < 0) {
          const fetched = await this.fetchItemByPublicId(parsed, params.viewerId, settings);
          if (fetched && this.isRenderableShortItem(fetched)) {
            const beforeCount = Math.min(5, mixed.length);
            mixed = [...mixed.slice(0, beforeCount), fetched, ...mixed.slice(beforeCount)];
            targetIndex = beforeCount;
            targetFound = true;
          }
        } else {
          targetFound = true;
        }

        if (targetFound && targetIndex >= 0) {
          const before = 5;
          const start = Math.max(0, targetIndex - before);
          const page = mixed.slice(start, start + limit);
          const nextOffset = start + limit;
          targetIndexInPage = targetIndex - start;
          return {
            items: page,
            nextCursor: nextOffset < mixed.length ? this.encodeCursor({ offset: nextOffset }) : null,
            hasMore: nextOffset < mixed.length,
            targetFeedKey: parsed.feedKey,
            targetIndexInPage,
            targetFound: true,
          };
        }
      }

      return {
        items: mixed.slice(offset, offset + limit),
        nextCursor:
          offset + limit < mixed.length ? this.encodeCursor({ offset: offset + limit }) : null,
        hasMore: offset + limit < mixed.length,
        targetFeedKey: targetKey,
        targetIndexInPage: null,
        targetFound: false,
      };
    }

    const page = mixed.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const hasMore = nextOffset < mixed.length;

    return {
      items: page,
      nextCursor: hasMore ? this.encodeCursor({ offset: nextOffset }) : null,
      hasMore,
    };
  }

  private async getFeedForCollection(
    collectionId: string,
    params: {
      viewerId?: string;
      filters?: PublicPropertyListFilters;
      limit?: number;
    },
  ): Promise<ShortsFeedResponse> {
    const limit = Math.min(30, Math.max(1, Math.trunc(params.limit ?? 15) || 15));
    const collection = await this.prisma.shortsCollection.findUnique({
      where: { id: collectionId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!collection || collection.items.length === 0) {
      return { items: [], nextCursor: null, hasMore: false, targetFound: false };
    }

    const settings = await this.settingsService.getSettings();
    const collected: ScoredPoolItem[] = [];
    for (const row of collection.items) {
      const parsed = parseShortPublicId(row.feedKey);
      if (!parsed) continue;
      const item = await this.fetchItemByPublicId(parsed, params.viewerId, settings);
      if (item && this.isRenderableShortItem(item)) collected.push(item);
    }

    const pools = await this.loadPools(
      params.viewerId,
      params.filters,
      settings,
      this.cacheKey(params.filters, settings),
    );
    const properties = pools.properties.filter((item) => this.isRenderableShortItem(item));
    const content = pools.content.filter((item) => this.isRenderableShortItem(item));
    let mixed = this.applyOpeningHook(
      this.mixPools(properties, content, settings, properties.length),
      properties.length,
      settings,
    );

    const seen = new Set(collected.map((x) => x.feedKey));
    const rest = mixed.filter((x) => !seen.has(x.feedKey));
    mixed = [...collected, ...rest];
    const page = mixed.slice(0, limit);
    return {
      items: page,
      nextCursor: mixed.length > limit ? this.encodeCursor({ offset: limit }) : null,
      hasMore: mixed.length > limit,
      targetIndexInPage: 0,
      targetFound: collected.length > 0,
    };
  }

  async resolveItemByPublicId(
    publicId: string,
    viewerId?: string,
  ): Promise<ShortsFeedItem | null> {
    const parsed = parseShortPublicId(publicId);
    if (!parsed) return null;
    const settings = await this.settingsService.getSettings();
    const item = await this.fetchItemByPublicId(parsed, viewerId, settings);
    if (!item || !this.isRenderableShortItem(item)) return null;
    return item;
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
      const videoUrl = this.resolvePropertyVideoUrl(r);
      if (!videoUrl) continue;

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
      if (contentType === 'property-video') score += 35;

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
              AND: [
                buildCommunityPostsWhere(),
                { type: 'YOUTUBE_VIDEO' },
                { youtubeVideoId: { not: null } },
                { publishedAt: { not: null } },
                {
                  OR: [
                    { newsSourceId: null },
                    {
                      newsSource: {
                        enabled: true,
                        type: NewsSourceType.YOUTUBE_CHANNEL,
                        health: { not: NewsSourceHealth.DISABLED },
                      },
                    },
                  ],
                },
              ],
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

            const title = (row.title ?? '').trim();
            if (!title) continue;

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
      const title = (row.title || row.previewTitle || '').trim();
      if (!title) return null;
      const thumb =
        row.youtubeThumbnailUrl?.trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const ytBoost = this.youtubeScoreBoost(settings);
      return {
        feedKey: `youtube:${videoId}`,
        contentType: 'youtube',
        score: this.computeScore(publishedAt, settings, ytBoost),
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
          sourceName: row.youtubeChannelTitle
            ? `YouTube • ${row.youtubeChannelTitle}`
            : 'YouTube',
          href: `/prispevek/${slug}`,
        },
      };
    }

    const imageUrl = this.resolvePostImage(row);
    if (!imageUrl) return null;
    const title = (row.title || row.previewTitle || '').trim();
    if (!title) return null;

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
    href?: string | null;
    description?: string | null;
    content?: string | null;
  }): string | null {
    const direct = row.youtubeVideoId?.trim();
    if (direct && YOUTUBE_ID_RE.test(direct)) return direct;
    for (const candidate of [
      row.videoUrl,
      row.externalUrl,
      row.href,
      row.description,
      row.content,
    ]) {
      const parsed = this.parseYoutubeIdFromText(String(candidate ?? ''));
      if (parsed) return parsed;
    }
    return null;
  }

  private logFeedSummary(
    label: string,
    properties: ScoredPoolItem[],
    content: ScoredPoolItem[],
    mixed?: ScoredPoolItem[],
  ): void {
    if (process.env.NODE_ENV === 'production') return;
    const count = (items: ScoredPoolItem[], type: ShortsItemType) =>
      items.filter((i) => i.contentType === type).length;
    const pool = [...properties, ...content];
    const selected = mixed ?? pool;
    this.log.debug(
      `[SHORTS FEED] ${label}: properties available=${properties.length} youtube available=${count(pool, 'youtube')} articles available=${count(pool, 'article') + count(pool, 'news') + count(pool, 'editorial') + count(pool, 'finance') + count(pool, 'post')} | properties selected=${count(selected, 'property') + count(selected, 'property-video')} youtube selected=${count(selected, 'youtube')} articles selected=${count(selected, 'article') + count(selected, 'news') + count(selected, 'editorial') + count(selected, 'finance') + count(selected, 'post')} final items=${selected.length}`,
    );
  }

  private isArticleType(type: ShortsItemType): boolean {
    return ['article', 'news', 'editorial', 'finance', 'post'].includes(type);
  }

  private isRenderableShortItem(item: ScoredPoolItem): boolean {
    const p = item.payload;
    const title = String(p.title ?? '').trim();
    switch (item.contentType) {
      case 'property':
      case 'property-video':
        return Boolean(String(p.id ?? '').trim() && this.resolvePropertyVideoUrlFromPayload(p));
      case 'youtube':
        return Boolean(
          this.resolveYoutubeVideoId({
            youtubeVideoId: p.youtubeVideoId as string | null | undefined,
            videoUrl: p.videoUrl as string | null | undefined,
            externalUrl: p.externalUrl as string | null | undefined,
            href: p.href as string | null | undefined,
            description: p.description as string | null | undefined,
            content: p.content as string | null | undefined,
          }) && title,
        );
      case 'article':
      case 'news':
      case 'editorial':
      case 'finance':
      case 'post': {
        const image = String(p.imageUrl ?? p.ogImageUrl ?? p.thumbnailUrl ?? '').trim();
        return Boolean(title && image && isPublicMediaUrl(image));
      }
      default:
        return false;
    }
  }

  private resolvePropertyVideoUrl(row: {
    videoUrl: string | null;
    media: Array<{ type: string; url: string }>;
  }): string | null {
    const direct = row.videoUrl?.trim();
    if (direct && isPublicMediaUrl(direct)) return direct;
    for (const m of row.media) {
      if (m.type === 'video' && isPublicMediaUrl(m.url)) return m.url.trim();
    }
    return null;
  }

  private resolvePropertyVideoUrlFromPayload(payload: Record<string, unknown>): string | null {
    const direct = typeof payload.videoUrl === 'string' ? payload.videoUrl.trim() : '';
    if (direct && isPublicMediaUrl(direct)) return direct;
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (url && isPublicMediaUrl(url)) return url;
    const media = Array.isArray(payload.media) ? payload.media : [];
    for (const m of media) {
      if (!m || typeof m !== 'object') continue;
      const rec = m as { type?: string; url?: string };
      if (rec.type === 'video' && isPublicMediaUrl(rec.url)) return rec.url!.trim();
    }
    return null;
  }

  private youtubeScoreBoost(settings: ShortsFeedSettings): number {
    if (settings.youtubePriority === 'high') return 40;
    if (settings.youtubePriority === 'medium') return 20;
    return 8;
  }

  private buildMixCycle(
    propertyCount: number,
    settings: ShortsFeedSettings,
  ): Array<'property' | 'youtube' | 'article'> {
    const low = settings.preferYoutubeWhenLowCatalog && propertyCount <= settings.lowCatalogThreshold;
    if (propertyCount === 0) {
      return low
        ? ['youtube', 'youtube', 'article', 'youtube', 'youtube', 'article', 'youtube']
        : ['youtube', 'article', 'youtube', 'article'];
    }
    if (propertyCount <= 5) {
      return ['property', 'youtube', 'property', 'youtube', 'article'];
    }
    if (propertyCount <= settings.lowCatalogThreshold) {
      return [
        'property',
        'youtube',
        'property',
        'youtube',
        'property',
        'article',
        'youtube',
        'property',
        'youtube',
      ];
    }
    if (propertyCount <= 50) {
      return ['property', 'property', 'youtube', 'property', 'article', 'property', 'youtube', 'property', 'property'];
    }
    return ['property', 'property', 'property', 'property', 'youtube', 'property', 'property', 'article', 'property', 'property'];
  }

  private diversifyYoutubeByChannel(items: ScoredPoolItem[]): ScoredPoolItem[] {
    if (items.length <= 1) return items;
    const buckets = new Map<string, ScoredPoolItem[]>();
    for (const item of items) {
      const channelId = String(
        (item.payload as Record<string, unknown>).youtubeChannelId ?? item.feedKey,
      );
      const list = buckets.get(channelId) ?? [];
      list.push(item);
      buckets.set(channelId, list);
    }
    const channelIds = [...buckets.keys()];
    const mixed: ScoredPoolItem[] = [];
    while (mixed.length < items.length) {
      let progressed = false;
      for (const channelId of channelIds) {
        const bucket = buckets.get(channelId);
        if (!bucket?.length) continue;
        mixed.push(bucket.shift()!);
        progressed = true;
        if (mixed.length >= items.length) break;
      }
      if (!progressed) break;
    }
    return mixed;
  }

  private mixPools(
    properties: ScoredPoolItem[],
    content: ScoredPoolItem[],
    settings: ShortsFeedSettings,
    propertyCount: number,
  ): ScoredPoolItem[] {
    const youtube = this.diversifyYoutubeByChannel(
      content
        .filter((item) => item.contentType === 'youtube')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    );
    const articles = content
      .filter((item) => this.isArticleType(item.contentType))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const cycle = this.buildMixCycle(propertyCount, settings);
    const result: ScoredPoolItem[] = [];
    const seen = new Set<string>();
    const piRef = { value: 0 };
    const yiRef = { value: 0 };
    const aiRef = { value: 0 };
    let cycleIdx = 0;
    let stuck = 0;
    const maxItems = properties.length + youtube.length + articles.length;

    const takeFrom = (pool: ScoredPoolItem[], index: { value: number }): ScoredPoolItem | null => {
      while (index.value < pool.length) {
        const item = pool[index.value++];
        if (!seen.has(item.feedKey)) {
          seen.add(item.feedKey);
          return item;
        }
      }
      return null;
    };

    const articlesInLast10 = () => {
      const window = result.slice(-10);
      return window.filter((item) => this.isArticleType(item.contentType)).length;
    };

    const lastTypes = (n: number) => result.slice(-n).map((item) => item.contentType);

    while (result.length < maxItems && stuck < maxItems + 10) {
      let slot = cycle[cycleIdx % cycle.length] ?? 'property';
      cycleIdx++;

      if (slot === 'article' && articlesInLast10() >= settings.maxArticlesPer10Shorts) {
        slot = yiRef.value < youtube.length ? 'youtube' : 'property';
      }

      const recentYoutube = lastTypes(3).filter((t) => t === 'youtube').length;
      if (slot === 'youtube' && recentYoutube >= 2 && piRef.value < properties.length) {
        slot = 'property';
      }

      let picked: ScoredPoolItem | null = null;
      if (slot === 'property') {
        picked = takeFrom(properties, piRef);
        if (!picked) picked = takeFrom(youtube, yiRef);
        if (!picked) picked = takeFrom(articles, aiRef);
      } else if (slot === 'youtube') {
        picked = takeFrom(youtube, yiRef);
        if (!picked) picked = takeFrom(properties, piRef);
        if (!picked) picked = takeFrom(articles, aiRef);
      } else {
        picked = takeFrom(articles, aiRef);
        if (!picked) picked = takeFrom(youtube, yiRef);
        if (!picked) picked = takeFrom(properties, piRef);
      }

      if (!picked) {
        stuck++;
        continue;
      }
      stuck = 0;
      result.push(picked);
    }

    const drain = (pool: ScoredPoolItem[], index: { value: number }) => {
      let item: ScoredPoolItem | null;
      while ((item = takeFrom(pool, index))) {
        if (
          this.isArticleType(item.contentType) &&
          articlesInLast10() >= settings.maxArticlesPer10Shorts
        ) {
          continue;
        }
        result.push(item);
      }
    };

    drain(properties, piRef);
    drain(youtube, yiRef);
    drain(articles, aiRef);

    return result;
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

  private applyOpeningHook(
    items: ScoredPoolItem[],
    propertyCount: number,
    settings: ShortsFeedSettings,
  ): ScoredPoolItem[] {
    if (items.length <= 1) return items;

    const pool = [...items];
    const opening: ScoredPoolItem[] = [];
    const lowCatalog =
      settings.preferYoutubeWhenLowCatalog && propertyCount <= settings.lowCatalogThreshold;

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

    if (lowCatalog) {
      take((item) => item.contentType === 'youtube');
      take((item) => this.isPropertyItem(item));
      take((item) => item.contentType === 'youtube');
    } else {
      take(
        (item) =>
          item.contentType === 'youtube' ||
          item.contentType === 'property-video' ||
          item.contentType === 'editorial',
      );
      take((item) => ['news', 'finance', 'article'].includes(item.contentType));
    }

    while (opening.length < 3 && pool.length > 0) {
      opening.push(pool.shift()!);
    }

    return [...opening, ...pool];
  }

  private async fetchItemByPublicId(
    parsed: ParsedShortPublicId,
    viewerId: string | undefined,
    settings: ShortsFeedSettings,
  ): Promise<ScoredPoolItem | null> {
    const { contentType, id } = parsed;

    if (contentType === 'property' || contentType === 'property-video') {
      const row = await this.prisma.property.findFirst({
        where: { id, deletedAt: null },
        include: {
          media: { orderBy: { sortOrder: 'asc' } },
          tiparPostPublished: { select: { id: true, contactUnlockPrice: true } },
          _count: { select: { likes: true } },
          user: { select: { id: true, city: true, name: true, avatar: true } },
        },
      });
      if (!row) return null;
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
      const type: 'property' | 'property-video' =
        contentType === 'property-video' ? 'property-video' : 'property';
      const items = await this.serializePropertyRows([row], viewerId, access, type, settings);
      return items[0] ?? null;
    }

    if (contentType === 'youtube') {
      const row = await this.prisma.post.findFirst({
        where: {
          AND: [
            buildCommunityPostsWhere(),
            { type: 'YOUTUBE_VIDEO' },
            { OR: [{ youtubeVideoId: id }, { id }] },
            { publishedAt: { not: null } },
          ],
        },
        include: this.postRowInclude(),
      });
      if (!row) return null;
      return this.mapPostToShortsItem(row, settings);
    }

    if (['article', 'editorial', 'post'].includes(contentType)) {
      const typeMap: Record<string, string> = {
        article: 'NEWS_ARTICLE',
        editorial: 'COMPANY_REVIEW',
        post: 'post',
      };
      const row = await this.prisma.post.findFirst({
        where: {
          AND: [buildCommunityPostsWhere(), { id }, { type: typeMap[contentType] ?? contentType }],
        },
        include: this.postRowInclude(),
      });
      if (!row) return null;
      return this.mapPostToShortsItem(row, settings);
    }

    if (contentType === 'news' || contentType === 'finance') {
      const row = await this.prisma.newsArticle.findFirst({
        where: {
          id,
          status: NewsArticleStatus.PUBLISHED,
          publishedAt: { not: null },
          ogImageUrl: { not: null },
        },
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
      if (!row) return null;
      const imageUrl = (row.ogImageUrl ?? '').trim();
      const title = (row.title ?? '').trim();
      if (!imageUrl || !title) return null;
      const isFinance = FINANCE_NEWS_CATEGORIES.has(row.category);
      const itemType: ShortsItemType = isFinance ? 'finance' : 'news';
      const publishedAt = row.publishedAt!;
      const categoryLabel =
        NEWS_CATEGORY_LABELS[row.category as keyof typeof NEWS_CATEGORY_LABELS] ?? row.category;
      return {
        feedKey: `${itemType}:${row.id}`,
        contentType: itemType,
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
      };
    }

    return null;
  }
}
