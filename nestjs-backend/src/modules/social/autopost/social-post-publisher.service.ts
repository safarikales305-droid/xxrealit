import { Injectable, Logger } from '@nestjs/common';
import {
  FacebookPostType,
  PostSocialPublishStatus,
  PostSocialPublishType,
  SocialPlatform,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SocialPlatformStubService } from '../social-platform.stub';
import { PostSocialPublishService } from './post-social-publish.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublisherService } from './social-publisher.service';
import {
  buildPostDetailUrl,
  resolvePostShareImage,
  resolvePostShareVideo,
} from './social-publish-format.util';
import type { FacebookPublishResult } from './social-autopost.types';

@Injectable()
export class SocialPostPublisherService {
  private readonly log = new Logger(SocialPostPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly publisher: SocialPublisherService,
    private readonly postSocialPublish: PostSocialPublishService,
    private readonly platformStub: SocialPlatformStubService,
  ) {}

  async publishPostToPlatform(
    postId: string,
    platform: SocialPlatform,
    opts: { forceReel?: boolean } = {},
  ): Promise<FacebookPublishResult | { skipped: true; reason: string }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!post) throw new Error('Příspěvek nenalezen.');

    const videoUrl = resolvePostShareVideo(post);
    const imageUrl = resolvePostShareImage(post);
    const text = (post.content ?? post.description ?? post.title ?? '').trim();
    const publicUrl = buildPostDetailUrl(post.id);
    const publishType = videoUrl ? PostSocialPublishType.REEL : PostSocialPublishType.POST;

    await this.postSocialPublish.markStatus(postId, platform, {
      status: PostSocialPublishStatus.UPLOADING,
      publishType,
      errorMessage: null,
    });

    try {
      if (platform === SocialPlatform.FACEBOOK) {
        const result = await this.publisher.publishUserPostToFacebook(
          {
            description: text,
            publicUrl,
            imageUrl,
            videoUrl,
            title: post.title?.trim() || text.slice(0, 80) || undefined,
          },
          {
            forceFormat: videoUrl
              ? opts.forceReel
                ? FacebookPostType.FACEBOOK_REEL
                : undefined
              : FacebookPostType.FACEBOOK_POST,
          },
        );

        await this.postSocialPublish.markStatus(postId, platform, {
          status: PostSocialPublishStatus.PUBLISHED,
          publishType: result.facebookPostType === FacebookPostType.FACEBOOK_REEL
            ? PostSocialPublishType.REEL
            : PostSocialPublishType.POST,
          externalId: result.externalReelId ?? result.externalPostId,
          externalUrl: result.reelPublishedUrl ?? result.publishedUrl,
          videoPreviewSeconds:
            result.teaserDurationSec != null ? Math.round(result.teaserDurationSec) : null,
          publishedAt: new Date(),
          errorMessage: result.teaserError ?? null,
        });

        await this.postSocialPublish.syncPostFacebookFields(postId, {
          externalPostId: result.externalPostId,
          publishedUrl: result.reelPublishedUrl ?? result.publishedUrl,
          externalReelId: result.externalReelId,
          facebookPostType: result.facebookPostType,
        });

        return result;
      }

      if (
        platform === SocialPlatform.INSTAGRAM ||
        platform === SocialPlatform.TIKTOK ||
        platform === SocialPlatform.YOUTUBE
      ) {
        await this.settings.reload();
        const cfg = this.settings.getSettings()[platform.toLowerCase() as 'instagram' | 'youtube' | 'tiktok'];
        if (!cfg?.enabled) {
          await this.postSocialPublish.markStatus(postId, platform, {
            status: PostSocialPublishStatus.FAILED,
            publishType,
            errorMessage: `${platform} není zapnuto v administraci.`,
          });
          return { skipped: true, reason: `${platform} není zapnuto` };
        }
        this.platformStub.uploadVideo(platform);
      }

      throw new Error(`Nepodporovaná platforma: ${platform}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.postSocialPublish.markStatus(postId, platform, {
        status: PostSocialPublishStatus.FAILED,
        publishType,
        errorMessage: message,
      });
      throw err;
    }
  }
}
