import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MarketingBonusActionType,
  PostCategory,
  Prisma,
  ReactionType,
  UserRole,
} from '@prisma/client';
import {
  POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG,
} from '../../common/user-public-profile.util';
import {
  canUserPublishPosts,
} from '../../common/public-visibility.util';
import { postTotalLikes } from '../../common/listing-statistics.util';
import { PrismaService } from '../../database/prisma.service';
import { BonusCampaignService } from '../bonus-campaign/bonus-campaign.service';
import { EmailsService } from '../emails/emails.service';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import { PostWhatsAppNotifyService } from '../whatsapp/post-whatsapp-notify.service';
import { WebPushService } from '../web-push/web-push.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { SeoService } from '../seo/seo.service';
import { SeoIndexQueueService } from '../seo/seo-index-queue.service';
import {
  communityPostAuthorRoles,
  communityPostAuthorUserWhere,
  dedupeCommunityPosts,
  isCommunityPostAuthorVisibleUser,
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
    private readonly seoService: SeoService,
    private readonly seoIndexQueue: SeoIndexQueueService,
    private readonly emails: EmailsService,
  ) {}

  private async assertCanPublishPublicPost(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        publicProfile: true,
        canPublishPosts: true,
        accountLimited: true,
        portalWorkerStatus: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Uživatel nenalezen.');
    }
    if (!canUserPublishPosts(user)) {
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
    void this.seoService
      .ensurePostSeoFields(postId)
      .then(() => this.seoIndexQueue.enqueuePost(postId))
      .catch((err) => {
        this.log.warn(
          `[post-seo] slug/index failed post=${postId}: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  private postPreviewText(post: {
    title?: string | null;
    description?: string | null;
    content?: string | null;
    previewTitle?: string | null;
  }): string {
    const text =
      (post.previewTitle ?? '').trim() ||
      (post.title ?? '').trim() ||
      (post.description ?? '').trim() ||
      (post.content ?? '').trim();
    return text || 'Váš příspěvek';
  }

  private firePostLikeEmail(postId: string, actorUserId: string) {
    void (async () => {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      if (!post?.user?.email?.trim()) return;
      if (post.userId === actorUserId) return;

      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true },
      });

      await this.emails.sendPostLikeNotificationEmail({
        to: post.user.email,
        authorName: post.user.name?.trim() || 'Uživateli',
        actorName: actor?.name?.trim() || 'Někdo',
        postPreview: this.postPreviewText(post),
        postId,
        authorUserId: post.userId,
        actorUserId,
      });
    })().catch((err) => {
      this.log.warn(
        `[post-like-email] failed post=${postId}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  private firePostCommentEmail(
    postId: string,
    actorUserId: string,
    commentPreview: string,
    commentId: string,
  ) {
    void (async () => {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      if (!post?.user?.email?.trim()) return;
      if (post.userId === actorUserId) return;

      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true },
      });

      await this.emails.sendPostCommentNotificationEmail({
        to: post.user.email,
        authorName: post.user.name?.trim() || 'Uživateli',
        actorName: actor?.name?.trim() || 'Někdo',
        postPreview: this.postPreviewText(post),
        commentPreview,
        postId,
        authorUserId: post.userId,
        actorUserId,
        commentId,
      });
    })().catch((err) => {
      this.log.warn(
        `[post-comment-email] failed post=${postId}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  private async syncPostRealLikes(postId: string): Promise<number> {
    const count = await this.prisma.postReaction.count({
      where: { postId, type: ReactionType.LIKE },
    });
    await this.prisma.post.update({
      where: { id: postId },
      data: { realLikes: count },
    });
    return count;
  }

  private async postLikeCountResponse(postId: string, userId: string) {
    const realCount = await this.syncPostRealLikes(postId);
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { manualLikes: true, autopilotLikes: true },
    });
    const likeCount = postTotalLikes(post ?? {}, realCount);
    const dislikeCount = await this.prisma.postReaction.count({
      where: { postId, type: ReactionType.DISLIKE },
    });
    const mine = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { type: true },
    });
    return { likeCount, dislikeCount, reaction: mine?.type ?? null };
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

  async addComment(postId: string, userId: string, content: string) {
    const created = await this.prisma.comment.create({
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
    this.firePostCommentEmail(postId, userId, content.trim().slice(0, 300), created.id);
    return created;
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
        lastAutopilotLikesAt: new Date(),
        likesAutopilotEnabled: true,
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
        videoUrl: isVideo ? opts.url.trim() : null,
        previewImage: opts.previewImage?.trim() || null,
        soundTrackId: opts.soundTrackId?.trim() || null,
        userId,
        lastAutopilotLikesAt: new Date(),
        likesAutopilotEnabled: true,
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
    const videoMedia = input.media.find((m) => m.type === 'video');
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
        videoUrl: videoMedia?.url?.trim() || null,
        previewImage: input.previewImage?.trim() || null,
        soundTrackId: input.soundTrackId?.trim() || null,
        userId,
        lastAutopilotLikesAt: new Date(),
        likesAutopilotEnabled: true,
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
            publicProfile: true,
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

  async getPostDetailBySlug(slug: string) {
    const row = await this.prisma.post.findFirst({
      where: { slug, user: communityPostAuthorUserWhere() },
      select: { id: true },
    });
    if (!row) return null;
    return this.getPostDetail(row.id);
  }

  async listCommunityPosts(
    category?: PostCategory,
    radiusKm?: number,
    lat?: number,
    lng?: number,
    viewerUserId?: string,
    page = 0,
    limit = 30,
    authorRole?: UserRole,
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

    const allowedRoles = communityPostAuthorRoles();
    const roleInClause = Prisma.join(
      allowedRoles.map((role) => Prisma.sql`${role}::"UserRole"`),
    );
    const authorRoleClause =
      authorRole != null
        ? Prisma.sql`AND u.role = ${authorRole}::"UserRole"`
        : Prisma.empty;

    const fetchBatchSize = Math.min(100, safeLimit * 3);
    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM "Post" p
      INNER JOIN "User" u ON u.id = p."userId"
      WHERE u."accountLimited" = false
        AND (u.role <> 'PORTAL_WORKER' OR u."portalWorkerStatus" = 'APPROVED')
        AND u."publicProfile" = true
        AND u.role IN (${roleInClause})
        AND p.type <> 'short'
        ${categoryClause}
        ${authorRoleClause}
      ORDER BY
        ${priorityOrder} ASC,
        COALESCE(p."publishedAt", p."createdAt") DESC
      LIMIT ${fetchBatchSize}
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
            publicProfile: true,
            accountLimited: true,
            portalWorkerStatus: true,
          },
        },
      },
    });

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const deduped = dedupeCommunityPosts(
      orderedIds
        .map((id) => rowById.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .filter((row) => isCommunityPostAuthorVisibleUser(row.user))
        .map((row) => ({
          ...row,
          media: row.media.filter((m) => isPublicMediaUrl(m.url)),
        }))
        .filter((row) => postHasFeedVisibility(row)),
    ).slice(0, safeLimit);

    const items = deduped.map((row) => {
      const r = row as (typeof rows)[number];
      const realLikes = r.reactions.filter((x) => x.type === ReactionType.LIKE).length;
      return {
        ...r,
        isFollowedAuthor: followedSet.has(r.userId),
        likeCount: postTotalLikes(r, realLikes),
        dislikeCount: r.reactions.filter((x) => x.type === ReactionType.DISLIKE).length,
      };
    });

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
      hasMore: orderedIds.length >= fetchBatchSize,
    };
  }

  async toggleReaction(postId: string, userId: string, type: ReactionType) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    let addedLike = false;
    if (existing && existing.type === type) {
      await this.prisma.postReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.postReaction.update({
        where: { id: existing.id },
        data: { type },
      });
      addedLike = type === ReactionType.LIKE;
    } else {
      await this.prisma.postReaction.create({
        data: { postId, userId, type },
      });
      addedLike = type === ReactionType.LIKE;
    }
    if (addedLike) {
      this.firePostLikeEmail(postId, userId);
    }
    return this.postLikeCountResponse(postId, userId);
  }
}
