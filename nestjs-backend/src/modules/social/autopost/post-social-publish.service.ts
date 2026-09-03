import { Injectable } from '@nestjs/common';
import {
  PostSocialPublishStatus,
  PostSocialPublishType,
  SocialPlatform,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { resolvePostShareVideo } from './social-publish-format.util';

@Injectable()
export class PostSocialPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  resolvePublishType(hasVideo: boolean): PostSocialPublishType {
    return hasVideo ? PostSocialPublishType.REEL : PostSocialPublishType.POST;
  }

  async ensureJobsForPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!post) return [];

    await this.settings.reload();
    const s = this.settings.getSettings();
    const hasVideo = Boolean(resolvePostShareVideo(post));
    const publishType = this.resolvePublishType(hasVideo);

    const platforms: Array<{ platform: SocialPlatform; enabled: boolean }> = [
      {
        platform: SocialPlatform.FACEBOOK,
        enabled: Boolean(s.facebook.enabled && s.facebook.publishPosts),
      },
      {
        platform: SocialPlatform.INSTAGRAM,
        enabled: Boolean(s.instagram.enabled && s.instagram.publishPosts),
      },
      {
        platform: SocialPlatform.TIKTOK,
        enabled: Boolean(s.tiktok.enabled && s.tiktok.publishPosts),
      },
      {
        platform: SocialPlatform.YOUTUBE,
        enabled: Boolean(s.youtube.enabled && s.youtube.publishPosts),
      },
    ];

    const rows = [];
    for (const { platform, enabled } of platforms) {
      if (!enabled) continue;
      const implemented =
        platform === SocialPlatform.FACEBOOK || platform === SocialPlatform.INSTAGRAM;
      const pendingStatus = PostSocialPublishStatus.PENDING;
      const stubMessage = 'API integrace pro tuto síť zatím není aktivní.';
      const row = await this.prisma.postSocialPublish.upsert({
        where: { postId_platform: { postId, platform } },
        create: {
          postId,
          platform,
          publishType,
          status: implemented ? pendingStatus : PostSocialPublishStatus.FAILED,
          errorMessage: implemented ? null : stubMessage,
        },
        update: {
          publishType,
          ...(implemented
            ? publishType === PostSocialPublishType.REEL
              ? {}
              : { status: pendingStatus, errorMessage: null }
            : { status: PostSocialPublishStatus.FAILED, errorMessage: stubMessage }),
        },
      });
      rows.push(row);
    }
    return rows;
  }

  async markStatus(
    postId: string,
    platform: SocialPlatform,
    data: {
      status: PostSocialPublishStatus;
      publishType?: PostSocialPublishType;
      externalId?: string | null;
      externalUrl?: string | null;
      errorMessage?: string | null;
      videoPreviewSeconds?: number | null;
      publishedAt?: Date | null;
    },
  ) {
    return this.prisma.postSocialPublish.upsert({
      where: { postId_platform: { postId, platform } },
      create: {
        postId,
        platform,
        publishType: data.publishType ?? PostSocialPublishType.POST,
        status: data.status,
        externalId: data.externalId ?? null,
        externalUrl: data.externalUrl ?? null,
        errorMessage: data.errorMessage ?? null,
        videoPreviewSeconds: data.videoPreviewSeconds ?? null,
        publishedAt: data.publishedAt ?? null,
      },
      update: {
        status: data.status,
        ...(data.publishType !== undefined ? { publishType: data.publishType } : {}),
        ...(data.externalId !== undefined ? { externalId: data.externalId } : {}),
        ...(data.externalUrl !== undefined ? { externalUrl: data.externalUrl } : {}),
        ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
        ...(data.videoPreviewSeconds !== undefined
          ? { videoPreviewSeconds: data.videoPreviewSeconds }
          : {}),
        ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
      },
    });
  }

  async listForPost(postId: string) {
    return this.prisma.postSocialPublish.findMany({
      where: { postId },
      orderBy: { platform: 'asc' },
    });
  }

  async syncPostFacebookFields(
    postId: string,
    result: {
      externalPostId: string;
      publishedUrl: string;
      externalReelId?: string | null;
      facebookPostType?: string | null;
    },
  ) {
    const isReel = Boolean(result.externalReelId);
    await this.prisma.post.update({
      where: { id: postId },
      data: {
        facebookExternalId: result.externalReelId ?? result.externalPostId,
        facebookPermalink: result.publishedUrl,
        facebookPostType: isReel ? 'FACEBOOK_REEL' : 'FACEBOOK_POST',
      },
    });
  }
}
