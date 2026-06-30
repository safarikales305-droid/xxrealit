import { Injectable, Logger } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishStatus,
  SocialPublishTriggerSource,
  FacebookPostType,
  type UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ShareMetadataService } from '../../share/share-metadata.service';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublisherService } from './social-publisher.service';
import { FacebookGraphPublishError } from './facebook-graph-autopost.util';
import { SocialPublishLogService } from './social-publish-log.service';
import {
  buildPostDetailUrl,
  resolvePostShareImage,
  resolvePostShareVideo,
  resolvePropertyShareImage,
  toAbsoluteMediaUrl,
} from './social-publish-format.util';
import { isShortsVideoProperty } from './social-facebook-reel.util';
import { PROFESSIONAL_ROLES } from './social-autopost.types';
import { SocialPublishTemplatesService } from './social-publish-templates.service';
import { PostSocialPublishService } from './post-social-publish.service';

const MAX_ATTEMPTS = 5;

@Injectable()
export class SocialPublishEnqueueService {
  private readonly logger = new Logger(SocialPublishEnqueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly logService: SocialPublishLogService,
    private readonly postSocialPublish: PostSocialPublishService,
  ) {}

  firePropertyCreated(propertyId: string) {
    void this.tryEnqueueProperty(propertyId, 'create').catch((err) => {
      this.logger.warn(`enqueue property ${propertyId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  firePropertyApproved(propertyId: string) {
    void this.tryEnqueueProperty(propertyId, 'approve').catch((err) => {
      this.logger.warn(`enqueue approved property ${propertyId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  firePostCreated(postId: string) {
    void this.tryEnqueuePost(postId).catch((err) => {
      this.logger.warn(`enqueue post ${postId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  async enqueueManual(input: {
    contentType: SocialPublishContentType;
    contentId: string;
    force?: boolean;
    triggeredByUserId?: string;
  }) {
    if (input.contentType === 'POST') {
      return this.enqueuePost(input.contentId, {
        manual: true,
        force: input.force,
        triggerSource: SocialPublishTriggerSource.MANUAL,
        triggeredByUserId: input.triggeredByUserId,
      });
    }
    return this.enqueuePropertyManual(input.contentId, {
      force: input.force,
      triggerSource: SocialPublishTriggerSource.MANUAL,
      triggeredByUserId: input.triggeredByUserId,
    });
  }

  async enqueuePropertyManual(
    propertyId: string,
    opts: {
      force?: boolean;
      triggerSource?: SocialPublishTriggerSource;
      triggeredByUserId?: string;
      scheduleId?: string;
      scheduledAt?: Date;
      facebookPostType?: FacebookPostType | null;
    },
  ) {
    return this.enqueueProperty(propertyId, { manual: true, ...opts });
  }

  private async tryEnqueueProperty(propertyId: string, source: 'create' | 'approve') {
    await this.settings.reload();
    const fb = this.settings.getSettings().facebook;
    if (!fb.enabled) return;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { user: { select: { id: true, role: true, accountLimited: true } } },
    });
    if (!property || property.deletedAt) return;

    const isShort =
      String(property.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(property.videoUrl?.trim());
    if (isShort && !fb.publishShorts) return;
    if (!isShort && !fb.publishProperties) return;
    if (fb.approvedOnly && !property.approved) {
      if (source === 'create') return;
    }

    await this.enqueueProperty(propertyId, { manual: false });
  }

  private async tryEnqueuePost(postId: string) {
    await this.settings.reload();
    const global = this.settings.getSettings().global;
    const fb = this.settings.getSettings().facebook;
    if (!fb.enabled || !fb.publishPosts) return;
    if (!global.autoPublishNewPosts) return;
    await this.enqueuePost(postId, { manual: false });
  }

  private async enqueueProperty(
    propertyId: string,
    opts: {
      manual: boolean;
      force?: boolean;
      triggerSource?: SocialPublishTriggerSource;
      triggeredByUserId?: string;
      scheduleId?: string;
      scheduledAt?: Date;
      facebookPostType?: FacebookPostType | null;
    },
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { user: { select: { id: true, role: true, accountLimited: true, name: true } } },
    });
    if (!property) return { ok: false, error: 'Inzerát nenalezen' };

    const isShort =
      String(property.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(property.videoUrl?.trim());
    const contentType: SocialPublishContentType = isShort ? 'SHORT' : 'PROPERTY';

    const skip = await this.shouldSkipContent(
      {
        contentId: propertyId,
        contentType,
        authorUserId: property.userId,
        authorRole: property.user?.role,
        accountLimited: property.user?.accountLimited,
        isPublic: isPropertyPubliclyListed(property),
        approved: property.approved,
        deleted: Boolean(property.deletedAt),
        hasMedia: Boolean(
          property.videoUrl?.trim() ||
            property.mainImage?.trim() ||
            property.images?.length ||
            property.facebookShareImageUrl?.trim(),
        ),
        hasText: Boolean(property.title?.trim() || property.description?.trim()),
        isFacebookImport: false,
      },
      { manual: opts.manual, force: opts.force },
    );
    if (skip && !opts.force) {
      return { ok: false, skipped: true, reason: skip };
    }

    if (!opts.force) {
      const dup = await this.logService.wasPublishedToday({ contentType, contentId: propertyId });
      if (dup) {
        return {
          ok: false,
          skipped: true,
          reason: 'Dnes již publikováno na Facebook — použijte vynucení',
        };
      }
    }

    const triggerSource =
      opts.triggerSource ??
      (opts.manual ? SocialPublishTriggerSource.MANUAL : SocialPublishTriggerSource.AUTO);
    const scheduledAt = opts.scheduledAt ?? new Date();

    try {
      const existing = await this.prisma.socialPublishQueue.findUnique({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType,
            contentId: propertyId,
          },
        },
      });
      if (existing?.status === SocialPublishStatus.PUBLISHED && !opts.force) {
        return { ok: false, skipped: true, reason: 'Již publikováno' };
      }

      const row = await this.prisma.socialPublishQueue.upsert({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType,
            contentId: propertyId,
          },
        },
        create: {
          platform: SocialPlatform.FACEBOOK,
          contentType,
          contentId: propertyId,
          authorUserId: property.userId,
          contentTitle: property.title,
          status: SocialPublishStatus.PENDING,
          scheduledAt,
          triggerSource,
          triggeredByUserId: opts.triggeredByUserId ?? null,
          scheduleId: opts.scheduleId ?? null,
          facebookPostType: opts.facebookPostType ?? null,
        },
        update: opts.force
          ? {
              status: SocialPublishStatus.PENDING,
              lastError: null,
              scheduledAt,
              attempts: 0,
              triggerSource,
              triggeredByUserId: opts.triggeredByUserId ?? null,
              scheduleId: opts.scheduleId ?? null,
              facebookPostType: opts.facebookPostType ?? null,
            }
          : {
              status: SocialPublishStatus.PENDING,
              scheduledAt,
              triggerSource,
              triggeredByUserId: opts.triggeredByUserId ?? null,
              scheduleId: opts.scheduleId ?? null,
              ...(opts.facebookPostType !== undefined
                ? { facebookPostType: opts.facebookPostType }
                : {}),
            },
      });
      return { ok: true, queueId: row.id };
    } catch (err) {
      const existing = await this.prisma.socialPublishQueue.findUnique({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType,
            contentId: propertyId,
          },
        },
      });
      if (existing?.status === SocialPublishStatus.PUBLISHED && !opts.force) {
        return { ok: false, skipped: true, reason: 'Již publikováno' };
      }
      throw err;
    }
  }

  private async enqueuePost(
    postId: string,
    opts: {
      manual: boolean;
      force?: boolean;
      triggerSource?: SocialPublishTriggerSource;
      triggeredByUserId?: string;
    },
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, role: true, accountLimited: true, name: true } },
        media: { orderBy: { order: 'asc' } },
      },
    });
    if (!post) return { ok: false, error: 'Příspěvek nenalezen' };

    const text = (post.content ?? post.description ?? post.title ?? '').trim();
    const imageUrl = resolvePostShareImage(post);
    const videoUrl = resolvePostShareVideo(post);

    const skip = await this.shouldSkipContent(
      {
        contentId: postId,
        contentType: SocialPublishContentType.POST,
        authorUserId: post.userId,
        authorRole: post.user?.role,
        accountLimited: post.user?.accountLimited,
        isPublic: true,
        approved: true,
        deleted: false,
        hasMedia: Boolean(imageUrl || videoUrl),
        hasText: Boolean(text),
        isFacebookImport: post.isFacebookPagePost || post.source === 'FACEBOOK',
      },
      { manual: opts.manual, force: opts.force },
    );
    if (skip && !opts.force) {
      return { ok: false, skipped: true, reason: skip };
    }

    const existingPost = await this.prisma.socialPublishQueue.findUnique({
      where: {
        platform_contentType_contentId: {
          platform: SocialPlatform.FACEBOOK,
          contentType: SocialPublishContentType.POST,
          contentId: postId,
        },
      },
    });
    if (existingPost?.status === SocialPublishStatus.PUBLISHED && !opts.force) {
      return { ok: false, skipped: true, reason: 'Již publikováno' };
    }

    const triggerSource =
      opts.triggerSource ??
      (opts.manual ? SocialPublishTriggerSource.MANUAL : SocialPublishTriggerSource.AUTO);

    const facebookPostType = videoUrl ? FacebookPostType.FACEBOOK_REEL : FacebookPostType.FACEBOOK_POST;

    await this.postSocialPublish.ensureJobsForPost(postId);

    const row = await this.prisma.socialPublishQueue.upsert({
      where: {
        platform_contentType_contentId: {
          platform: SocialPlatform.FACEBOOK,
          contentType: SocialPublishContentType.POST,
          contentId: postId,
        },
      },
      create: {
        platform: SocialPlatform.FACEBOOK,
        contentType: SocialPublishContentType.POST,
        contentId: postId,
        authorUserId: post.userId,
        contentTitle: post.title || text.slice(0, 120) || 'Příspěvek',
        status: SocialPublishStatus.PENDING,
        scheduledAt: new Date(),
        triggerSource,
        triggeredByUserId: opts.triggeredByUserId ?? null,
        facebookPostType,
      },
      update: opts.force
        ? {
            status: SocialPublishStatus.PENDING,
            lastError: null,
            scheduledAt: new Date(),
            attempts: 0,
            triggerSource,
            triggeredByUserId: opts.triggeredByUserId ?? null,
            facebookPostType,
          }
        : {
            status: SocialPublishStatus.PENDING,
            scheduledAt: new Date(),
            triggerSource,
            triggeredByUserId: opts.triggeredByUserId ?? null,
            facebookPostType,
          },
    });
    return { ok: true, queueId: row.id };
  }

  private async shouldSkipContent(
    input: {
      contentId: string;
      contentType: SocialPublishContentType;
      authorUserId: string;
      authorRole?: UserRole;
      accountLimited?: boolean;
      isPublic: boolean;
      approved: boolean;
      deleted: boolean;
      hasMedia: boolean;
      hasText: boolean;
      isFacebookImport: boolean;
    },
    opts: { manual?: boolean; force?: boolean } = {},
  ): Promise<string | null> {
    await this.settings.reload();
    const fb = this.settings.getSettings().facebook;

    if (!this.settings.isFacebookPublishingConfigured()) {
      return 'Facebook není nakonfigurován (Page ID / token)';
    }

    if (!opts.manual) {
      if (!fb.enabled) return 'Autopost vypnutý';
    }

    if (input.deleted) return 'Obsah smazaný';

    if (!opts.manual) {
      if (!input.isPublic && input.contentType !== SocialPublishContentType.POST) {
        return 'Obsah není veřejný';
      }
      if (fb.approvedOnly && !input.approved && input.contentType !== SocialPublishContentType.POST) {
        return 'Inzerát není schválený';
      }
      if (input.accountLimited) return 'Účet autora je omezený';
      if (fb.publicPostsOnly && input.isFacebookImport) return 'Importovaný FB příspěvek';
      if (fb.professionalsOnly && input.authorRole && !PROFESSIONAL_ROLES.includes(input.authorRole)) {
        return 'Autor není profesionál';
      }
      if (fb.allowedRoles.length > 0 && input.authorRole && !fb.allowedRoles.includes(input.authorRole)) {
        return 'Role autora není povolená';
      }
    }

    if (!input.hasMedia && !input.hasText) return 'Chybí text i média';

    if (!opts.force) {
      const existing = await this.prisma.socialPublishQueue.findUnique({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType: input.contentType,
            contentId: input.contentId,
          },
        },
      });
      if (existing?.status === SocialPublishStatus.PUBLISHED) {
        return 'Již publikováno na Facebook';
      }
    }

    return null;
  }

  async skipQueueItem(id: string) {
    return this.prisma.socialPublishQueue.update({
      where: { id },
      data: {
        status: SocialPublishStatus.SKIPPED,
        processedAt: new Date(),
        lastError: 'Přeskočeno administrátorem',
      },
    });
  }

  async retryQueueItem(id: string) {
    return this.prisma.socialPublishQueue.update({
      where: { id },
      data: {
        status: SocialPublishStatus.PENDING,
        lastError: null,
        scheduledAt: new Date(),
        attempts: 0,
      },
    });
  }
}

@Injectable()
export class SocialPublishProcessorService {
  private readonly logger = new Logger(SocialPublishProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly publisher: SocialPublisherService,
    private readonly shareMetadata: ShareMetadataService,
    private readonly logService: SocialPublishLogService,
    private readonly templates: SocialPublishTemplatesService,
  ) {}

  async processDueBatch(limit = 5) {
    if (!this.settings.isFacebookAutopostReady()) return { processed: 0 };

    const now = new Date();
    const due = await this.prisma.socialPublishQueue.findMany({
      where: {
        status: SocialPublishStatus.PENDING,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let processed = 0;
    for (const item of due) {
      try {
        await this.processItem(item.id);
        processed += 1;
      } catch (err) {
        this.logger.error(
          `process queue ${item.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { processed };
  }

  async processItem(id: string) {
    const item = await this.prisma.socialPublishQueue.findUnique({ where: { id } });
    if (!item || item.status === SocialPublishStatus.PUBLISHED) return item;
    if (item.status === SocialPublishStatus.SKIPPED) return item;

    if (item.attempts >= MAX_ATTEMPTS) {
      return this.prisma.socialPublishQueue.update({
        where: { id },
        data: {
          status: SocialPublishStatus.FAILED,
          lastError: 'Překročen maximální počet pokusů',
          processedAt: new Date(),
        },
      });
    }

    await this.prisma.socialPublishQueue.update({
      where: { id },
      data: { status: SocialPublishStatus.PROCESSING, attempts: { increment: 1 } },
    });

    try {
      const result =
        item.contentType === SocialPublishContentType.POST
          ? await this.publishPost(item.contentId)
          : await this.publishProperty(item.contentId, item.contentType, item.facebookPostType);

      const updated = await this.prisma.socialPublishQueue.update({
        where: { id },
        data: {
          status: SocialPublishStatus.PUBLISHED,
          externalPostId: result.externalPostId,
          publishedUrl: result.publishedUrl,
          lastApiResponse: result.raw as object,
          lastError: null,
          facebookPostType: result.facebookPostType ?? item.facebookPostType ?? null,
          processedAt: new Date(),
        },
      });

      await this.logService.writeLog({
        contentType: item.contentType,
        contentId: item.contentId,
        queueId: id,
        scheduleId: item.scheduleId ?? null,
        status: SocialPublishStatus.PUBLISHED,
        externalPostId: result.externalPostId,
        externalReelId: result.externalReelId ?? null,
        publishedUrl: result.publishedUrl,
        reelPublishedUrl: result.reelPublishedUrl ?? null,
        facebookPostType: result.facebookPostType ?? item.facebookPostType ?? null,
        publishKind: result.publishKind ?? null,
        contentTitle: result.contentTitle ?? null,
        teaserDurationSec: result.teaserDurationSec ?? null,
        originalVideoDurationSec: result.originalVideoDurationSec ?? null,
        graphApiResponse: result.raw,
        lastError: result.teaserError ?? null,
        triggerSource: item.triggerSource,
        triggeredByUserId: item.triggeredByUserId,
      });

      return updated;
    } catch (err) {
      const graphErr =
        err instanceof FacebookGraphPublishError ? err.graphError : undefined;
      const message = graphErr?.userMessage ?? (err instanceof Error ? err.message : String(err));
      await this.settings.appendApiLog({
        action: `process_${item.contentType.toLowerCase()}`,
        ok: false,
        body: { queueId: id, error: message, graphError: graphErr },
      });

      const failed = await this.prisma.socialPublishQueue.update({
        where: { id },
        data: {
          status: SocialPublishStatus.FAILED,
          lastError: message,
          lastApiResponse: graphErr ? (graphErr as object) : undefined,
          processedAt: new Date(),
        },
      });

      await this.logService.writeLog({
        contentType: item.contentType,
        contentId: item.contentId,
        queueId: id,
        scheduleId: item.scheduleId ?? null,
        status: SocialPublishStatus.FAILED,
        lastError: message,
        facebookPostType: item.facebookPostType ?? null,
        graphApiResponse: graphErr ?? undefined,
        triggerSource: item.triggerSource,
        triggeredByUserId: item.triggeredByUserId,
      });

      return failed;
    }
  }

  private async publishProperty(
    contentId: string,
    contentType: SocialPublishContentType,
    forceFormat?: FacebookPostType | null,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: contentId },
      include: { user: { select: { id: true, role: true, name: true } } },
    });
    if (!property || property.deletedAt) throw new Error('Inzerát není k dispozici');

    const forcedType = contentType === SocialPublishContentType.SHORT ? 'shorts' : 'classic';
    const meta = await this.shareMetadata.resolveForProperty(contentId, forcedType);
    const global = this.settings.getSettings().global;
    const message = await this.templates.buildPropertyFacebookMessage({
      role: property.user?.role,
      authorName: property.user?.name,
      title: property.title,
      city: property.city,
      address: property.address,
      description: property.description,
      portalUrl: meta.shareUrl,
      hidePublicPrice: global.hidePublicPrice !== false,
    });
    const imageUrl = resolvePropertyShareImage(property);
    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);
    const isShortsVideo = isShortsVideoProperty(property);

    return this.publisher.publishPropertyToFacebook(
      {
        message,
        link: meta.shareUrl,
        imageUrl,
        videoUrl,
        title: property.title?.trim() || undefined,
        isShortsVideo,
      },
      forceFormat ? { forceFormat } : {},
    );
  }

  /** Publikuje shorts/video inzerát jako Facebook Reel (propertyId). */
  async publishPropertyAsFacebookReel(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.deletedAt) throw new Error('Inzerát není k dispozici');
    if (!isShortsVideoProperty(property) && !property.videoUrl?.trim()) {
      throw new Error('Inzerát nemá shorts video.');
    }
    return this.publishProperty(propertyId, SocialPublishContentType.SHORT, FacebookPostType.FACEBOOK_REEL);
  }

  private async publishPost(contentId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: contentId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!post) throw new Error('Příspěvek není k dispozici');
    const videoUrl = resolvePostShareVideo(post);
    const result = await this.publisher.publishPostToPlatform(
      contentId,
      SocialPlatform.FACEBOOK,
      { forceReel: Boolean(videoUrl) },
    );
    if ('skipped' in result) {
      throw new Error(result.reason);
    }
    return result;
  }
}
