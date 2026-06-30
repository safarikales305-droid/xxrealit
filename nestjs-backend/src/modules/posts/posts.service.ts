import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MarketingBonusActionType, PostCategory, Prisma, ReactionType } from '@prisma/client';
import {
  isUserPublicProfileEnabled,
  POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG,
  POST_PUBLISH_ROLES,
} from '../../common/user-public-profile.util';
import { PrismaService } from '../../database/prisma.service';
import { BonusCampaignService } from '../bonus-campaign/bonus-campaign.service';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import { PostWhatsAppNotifyService } from '../whatsapp/post-whatsapp-notify.service';
import { WebPushService } from '../web-push/web-push.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import {
  dedupeCommunityPosts,
  isPublicMediaUrl,
  postHasFeedVisibility,
} from './community-posts.util';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

function linkPreviewDataFromDto(dto: {
  externalUrl?: string;
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;
  previewSiteName?: string;
}) {
  const externalUrl = dto.externalUrl?.trim() || null;
  if (!externalUrl) {
    return {
      externalUrl: null,
      previewTitle: null,
      previewDescription: null,
      previewImage: null,
      previewSiteName: null,
    };
  }
  return {
    externalUrl,
    previewTitle: dto.previewTitle?.trim().slice(0, 500) || null,
    previewDescription: dto.previewDescription?.trim().slice(0, 2000) || null,
    previewImage: dto.previewImage?.trim() || null,
    previewSiteName: dto.previewSiteName?.trim().slice(0, 200) || null,
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class PostsService {
  private readonly log = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerPoints: BrokerPointsService,
    private readonly bonusCampaigns: BonusCampaignService,
    private readonly postWhatsAppNotify: PostWhatsAppNotifyService,
    private readonly webPush: WebPushService,
    private readonly socialPublishEnqueue: SocialPublishEnqueueService,
  ) {}

  private async assertCanPublishPublicPost(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isPublicProfile: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Uživatel nenalezen.');
    }
    if (!POST_PUBLISH_ROLES.includes(user.role)) {
      throw new ForbiddenException('Tato role nemůže publikovat příspěvky.');
    }
    if (!isUserPublicProfileEnabled(user)) {
      throw new ForbiddenException(POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG);
    }
  }

  private firePostPublishedNotify(userId: string, postId: string) {
    void this.postWhatsAppNotify.onPostPublished(userId, postId).catch((err) => {
      this.log.warn(
        `[post-wa] notify failed post=${postId}: ${err instanceof Error ? err.message : err}`,
      );
    });
    void this.webPush.notifyFollowersNewPost(userId, postId).catch((err) => {
      this.log.warn(
        `[post-push] notify failed post=${postId}: ${err instanceof Error ? err.message : err}`,
      );
    });
    this.socialPublishEnqueue.firePostCreated(postId);
  }

  async deletePost(id: string) {
    return this.prisma.post.delete({
      where: { id },
    });
  }

  async deletePostByOwner(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException();
    }
    if (post.userId !== userId) {
      throw new ForbiddenException();
    }
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  async updatePostByOwner(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException();
    }
    if (post.userId !== userId) {
      throw new ForbiddenException();
    }
    const nextText = (dto.content ?? dto.description ?? '').trim();
    const updated = await this.prisma.post.update({
      where: { id },
      data: {
        content: nextText || null,
        description: nextText,
      },
      include: {
        media: { orderBy: { order: 'asc' } },
      },
    });
    return { success: true, post: updated };
  }

  async toggleFavorite(postId: string, userId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      const likeCount = await this.prisma.favorite.count({ where: { postId } });
      return { liked: false, likeCount };
    }

    await this.prisma.favorite.create({
      data: {
        userId,
        postId,
      },
    });
    const likeCount = await this.prisma.favorite.count({ where: { postId } });
    return { liked: true, likeCount };
  }

  addComment(postId: string, userId: string, content: string) {
    return this.prisma.comment.create({
      data: {
        content,
        userId,
        postId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  getComments(postId: string) {
    return this.prisma.comment.findMany({
      where: { postId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreatePostDto) {
    await this.assertCanPublishPublicPost(userId);
    const text = (dto.text ?? dto.description ?? dto.content ?? '').trim();
    const preview = linkPreviewDataFromDto(dto);
    const created = await this.prisma.post.create({
      data: {
        type: 'post',
        category: (dto.category as PostCategory | undefined) ?? PostCategory.MAKLERI,
        title: '',
        price: 0,
        city: '',
        userId,
        content: text || null,
        description: text || '',
        ...preview,
      },
      include: {
        media: { orderBy: { order: 'asc' } },
        reactions: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    this.firePostPublishedNotify(userId, created.id);
    return created;
  }

  async createMediaPost(
    userId: string,
    opts: {
      kind: 'video' | 'image';
      url: string;
      description: string;
      previewImage?: string;
      soundTrackId?: string;
    },
  ) {
    await this.assertCanPublishPublicPost(userId);
    const text = opts.description.trim();
    const isVideo = opts.kind === 'video';
    const created = await this.prisma.post.create({
      data: {
        type: 'post',
        title: '',
        price: 0,
        city: '',
        description: text || '',
        content: text || null,
        previewImage: opts.previewImage?.trim() || null,
        soundTrackId: opts.soundTrackId?.trim() || null,
        userId,
        media: {
          create: [
            {
              url: opts.url,
              type: isVideo ? 'video' : 'image',
              order: isVideo ? 0 : 1,
            },
          ],
        },
      },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        soundTrack: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (isVideo) {
      await this.brokerPoints.onVideoPostCreated(userId, created.id);
    }
    void this.bonusCampaigns
      .evaluateMarketingBonuses(userId, MarketingBonusActionType.FIRST_POST)
      .catch(() => {});
    this.firePostPublishedNotify(userId, created.id);
    return created;
  }

  async createListingPost(
    userId: string,
    input: {
      title: string;
      description: string;
      price: number | null;
      city: string;
      type: 'post' | 'short';
      media: Array<{ url: string; type: 'video' | 'image'; order: number }>;
      category?: PostCategory;
      latitude?: number;
      longitude?: number;
      previewImage?: string;
      soundTrackId?: string;
    },
  ) {
    await this.assertCanPublishPublicPost(userId);
    const created = await this.prisma.post.create({
      data: {
        title: input.title,
        description: input.description,
        price: input.price ?? 0,
        city: input.city,
        type: input.type,
        category: input.category ?? PostCategory.MAKLERI,
        latitude: Number.isFinite(input.latitude) ? input.latitude : null,
        longitude: Number.isFinite(input.longitude) ? input.longitude : null,
        content: input.description,
        previewImage: input.previewImage?.trim() || null,
        soundTrackId: input.soundTrackId?.trim() || null,
        userId,
        media: {
          create: input.media,
        },
      },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        reactions: true,
        soundTrack: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (input.media.some((m) => m.type === 'video')) {
      await this.brokerPoints.onVideoPostCreated(userId, created.id);
    }
    this.firePostPublishedNotify(userId, created.id);
    return created;
  }

  async getPostDetail(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        reactions: true,
        soundTrack: true,
        _count: {
          select: {
            favorites: true,
            comments: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (!post) return null;
    const media = post.media.filter((m) => isPublicMediaUrl(m.url));
    return {
      ...post,
      media,
    };
  }

  async listCommunityPosts(
    category?: PostCategory,
    radiusKm?: number,
    lat?: number,
    lng?: number,
    viewerUserId?: string,
    page = 0,
    limit = 30,
  ) {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit) || 30));
    const safePage = Math.max(0, Math.trunc(page) || 0);
    const offset = safePage * safeLimit;

    let followedIds: string[] = [];
    if (viewerUserId?.trim()) {
      const follows = await this.prisma.follow.findMany({
        where: { followerId: viewerUserId.trim() },
        select: { followingId: true },
      });
      followedIds = follows.map((f) => f.followingId);
    }

    const priorityOrder =
      followedIds.length > 0
        ? Prisma.sql`CASE WHEN p."userId" IN (${Prisma.join(followedIds)}) THEN 0 ELSE 1 END`
        : Prisma.sql`1`;

    const categoryClause = category
      ? Prisma.sql`AND p.category = ${category}::"PostCategory" AND NOT (p.source = 'FACEBOOK'::"PostSource" AND p."professionalProfileId" IS NULL)`
      : Prisma.empty;

    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM "Post" p
      INNER JOIN "User" u ON u.id = p."userId"
      WHERE u."isPublicProfile" = true
        AND p.type <> 'short'
        ${categoryClause}
      ORDER BY
        ${priorityOrder} ASC,
        COALESCE(p."publishedAt", p."createdAt") DESC
      LIMIT ${safeLimit}
      OFFSET ${offset}
    `;

    const orderedIds = idRows.map((r) => r.id);
    if (orderedIds.length === 0) {
      return { items: [], page: safePage, limit: safeLimit, hasMore: false };
    }

    const followedSet = new Set(followedIds);
    const rows = await this.prisma.post.findMany({
      where: { id: { in: orderedIds } },
      include: {
        media: { orderBy: { order: 'asc' } },
        reactions: true,
        soundTrack: true,
        _count: { select: { comments: true } },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const deduped = dedupeCommunityPosts(
      orderedIds
        .map((id) => rowById.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => ({
          ...row,
          media: row.media.filter((m) => isPublicMediaUrl(m.url)),
        }))
        .filter((row) => postHasFeedVisibility(row)),
    );

    const items = deduped.map((row) => ({
      ...row,
      isFollowedAuthor: followedSet.has(row.userId),
    }));

    const userLat = toNumberOrNull(lat);
    const userLng = toNumberOrNull(lng);
    const radiusNum = toNumberOrNull(radiusKm);
    let filtered = items;
    if (userLat !== null && userLng !== null && radiusNum !== null) {
      const maxKm = Math.max(1, radiusNum);
      filtered = items
        .map((row) => {
          const rowLat = toNumberOrNull(row.latitude);
          const rowLng = toNumberOrNull(row.longitude);
          if (rowLat === null || rowLng === null) return row;
          const distanceKm = haversineKm(userLat, userLng, rowLat, rowLng);
          if (distanceKm > maxKm) return null;
          return { ...row, distanceKm: Number(distanceKm.toFixed(1)) };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
    }

    return {
      items: filtered,
      page: safePage,
      limit: safeLimit,
      hasMore: orderedIds.length >= safeLimit,
    };
  }

  async toggleReaction(postId: string, userId: string, type: ReactionType) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing && existing.type === type) {
      await this.prisma.postReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.postReaction.update({
        where: { id: existing.id },
        data: { type },
      });
    } else {
      await this.prisma.postReaction.create({
        data: { postId, userId, type },
      });
    }
    const [likeCount, dislikeCount] = await Promise.all([
      this.prisma.postReaction.count({ where: { postId, type: ReactionType.LIKE } }),
      this.prisma.postReaction.count({ where: { postId, type: ReactionType.DISLIKE } }),
    ]);
    const mine = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { type: true },
    });
    return { likeCount, dislikeCount, reaction: mine?.type ?? null };
  }
}
