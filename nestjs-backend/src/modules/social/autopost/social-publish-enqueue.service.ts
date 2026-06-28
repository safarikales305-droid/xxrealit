import { Injectable, Logger } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishStatus,
  type UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ShareMetadataService } from '../../share/share-metadata.service';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublisherService } from './social-publisher.service';
import {
  buildPostFacebookMessage,
  buildPropertyFacebookMessage,
  resolvePropertyShareImage,
  toAbsoluteMediaUrl,
} from './social-publish-format.util';
import { PROFESSIONAL_ROLES } from './social-autopost.types';

const MAX_ATTEMPTS = 5;

@Injectable()
export class SocialPublishEnqueueService {
  private readonly logger = new Logger(SocialPublishEnqueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
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
  }) {
    if (input.contentType === 'POST') {
      return this.enqueuePost(input.contentId, { manual: true, force: input.force });
    }
    return this.enqueueProperty(input.contentId, { manual: true, force: input.force });
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
    const fb = this.settings.getSettings().facebook;
    if (!fb.enabled || !fb.publishPosts) return;
    await this.enqueuePost(postId, { manual: false });
  }

  private async enqueueProperty(
    propertyId: string,
    opts: { manual: boolean; force?: boolean },
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { user: { select: { id: true, role: true, accountLimited: true, name: true } } },
    });
    if (!property) return { ok: false, error: 'Inzerát nenalezen' };

    const isShort =
      String(property.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(property.videoUrl?.trim());
    const contentType: SocialPublishContentType = isShort ? 'SHORT' : 'PROPERTY';

    const skip = await this.shouldSkipContent({
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
    });
    if (skip && !opts.force) {
      return { ok: false, skipped: true, reason: skip };
    }

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
          scheduledAt: new Date(),
        },
        update: opts.force
          ? {
              status: SocialPublishStatus.PENDING,
              lastError: null,
              scheduledAt: new Date(),
              attempts: 0,
            }
          : {
              status: SocialPublishStatus.PENDING,
              scheduledAt: new Date(),
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

  private async enqueuePost(postId: string, opts: { manual: boolean; force?: boolean }) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, role: true, accountLimited: true, name: true } },
        media: { orderBy: { order: 'asc' }, take: 1 },
      },
    });
    if (!post) return { ok: false, error: 'Příspěvek nenalezen' };

    const text = (post.content ?? post.description ?? post.title ?? '').trim();
    const imageUrl = post.imageUrl ?? post.media[0]?.url ?? post.previewImage;
    const videoUrl = post.videoUrl;

    const skip = await this.shouldSkipContent({
      contentId: postId,
      contentType: SocialPublishContentType.POST,
      authorUserId: post.userId,
      authorRole: post.user?.role,
      accountLimited: post.user?.accountLimited,
      isPublic: true,
      approved: true,
      deleted: false,
      hasMedia: Boolean(imageUrl?.trim() || videoUrl?.trim()),
      hasText: Boolean(text),
      isFacebookImport: post.isFacebookPagePost || post.source === 'FACEBOOK',
    });
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
      },
      update: opts.force
        ? {
            status: SocialPublishStatus.PENDING,
            lastError: null,
            scheduledAt: new Date(),
            attempts: 0,
          }
        : { status: SocialPublishStatus.PENDING, scheduledAt: new Date() },
    });
    return { ok: true, queueId: row.id };
  }

  private async shouldSkipContent(input: {
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
  }): Promise<string | null> {
    await this.settings.reload();
    const fb = this.settings.getSettings().facebook;
    if (!fb.enabled) return 'Autopost vypnutý';
    if (input.deleted) return 'Obsah smazaný';
    if (!input.isPublic && input.contentType !== SocialPublishContentType.POST) return 'Obsah není veřejný';
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
    if (!input.hasMedia && !input.hasText) return 'Chybí text i média';

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
          : await this.publishProperty(item.contentId, item.contentType);

      return this.prisma.socialPublishQueue.update({
        where: { id },
        data: {
          status: SocialPublishStatus.PUBLISHED,
          externalPostId: result.externalPostId,
          publishedUrl: result.publishedUrl,
          lastApiResponse: result.raw as object,
          lastError: null,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.settings.appendApiLog({
        action: `process_${item.contentType.toLowerCase()}`,
        ok: false,
        body: { queueId: id, error: message },
      });
      return this.prisma.socialPublishQueue.update({
        where: { id },
        data: {
          status: SocialPublishStatus.FAILED,
          lastError: message,
          processedAt: new Date(),
        },
      });
    }
  }

  private async publishProperty(contentId: string, contentType: SocialPublishContentType) {
    const property = await this.prisma.property.findUnique({ where: { id: contentId } });
    if (!property || property.deletedAt) throw new Error('Inzerát není k dispozici');

    const forcedType = contentType === SocialPublishContentType.SHORT ? 'shorts' : 'classic';
    const meta = await this.shareMetadata.resolveForProperty(contentId, forcedType);
    const message = buildPropertyFacebookMessage(property, meta.shareUrl, true);
    const imageUrl = resolvePropertyShareImage(property);
    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);

    return this.publisher.publishToFacebook({
      message,
      link: meta.shareUrl,
      imageUrl,
      videoUrl,
    });
  }

  private async publishPost(contentId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: contentId },
      include: { media: { orderBy: { order: 'asc' }, take: 1 } },
    });
    if (!post) throw new Error('Příspěvek není k dispozici');

    const origin = metaOrigin();
    const publicUrl = `${origin}/prispevky/${encodeURIComponent(post.id)}`;
    const text = (post.content ?? post.description ?? post.title ?? '').trim();
    const message = buildPostFacebookMessage(text, publicUrl);
    const imageUrl = toAbsoluteMediaUrl(
      post.imageUrl ?? post.media[0]?.url ?? post.previewImage,
    );
    const videoUrl = toAbsoluteMediaUrl(post.videoUrl);

    return this.publisher.publishToFacebook({
      message,
      link: publicUrl,
      imageUrl,
      videoUrl,
    });
  }
}

function metaOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'https://xxrealit.cz'
  ).replace(/\/+$/, '');
}
