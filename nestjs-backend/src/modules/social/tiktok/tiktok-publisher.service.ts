import { Injectable, Logger } from '@nestjs/common';
import { TikTokPublishJobStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokApiError } from './tiktok.errors';
import { TIKTOK_ERROR_MESSAGES } from './tiktok.errors';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokSettingsService } from './tiktok-settings.service';
import { TikTokVideoUrlService } from './tiktok-video-url.service';
import { buildTikTokCaption, buildTikTokHashtags, buildTikTokPostText } from './tiktok-caption.util';
import {
  TIKTOK_STATUS_POLL_INTERVAL_MS,
  TIKTOK_STATUS_POLL_MAX,
} from './tiktok.constants';

@Injectable()
export class TikTokPublisherService {
  private readonly logger = new Logger(TikTokPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: TikTokOAuthService,
    private readonly api: TikTokApiClient,
    private readonly videoUrls: TikTokVideoUrlService,
    private readonly settings: TikTokSettingsService,
  ) {}

  private hasPublishScope(scope: string): boolean {
    return scope.split(/[,\s]+/).some((s) => s.trim() === 'video.publish');
  }

  private async writeLog(
    jobId: string,
    listingId: string,
    status: string,
    message: string | null,
    rawResponse?: unknown,
  ) {
    await this.prisma.tikTokPublishLog.create({
      data: {
        jobId,
        listingId,
        status,
        message,
        rawResponse: rawResponse != null ? (rawResponse as object) : undefined,
      },
    });
  }

  async publishJob(jobId: string): Promise<void> {
    const job = await this.prisma.tikTokPublishJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'UPLOADED') return;

    await this.prisma.tikTokPublishJob.update({
      where: { id: jobId },
      data: { status: 'UPLOADING', attempts: { increment: 1 } },
    });

    try {
      const { accessToken, scope } = await this.oauth.getValidAccessToken();
      const portalSettings = this.settings.getSettings();
      const direct = portalSettings.preferDirectPublish && this.hasPublishScope(scope);

      const creator = await this.api.queryCreatorInfo(accessToken);
      const privacy =
        creator.privacy_level_options?.includes('PUBLIC_TO_EVERYONE')
          ? 'PUBLIC_TO_EVERYONE'
          : creator.privacy_level_options?.[0] ?? 'SELF_ONLY';

      const title = buildTikTokPostText(job.caption, job.hashtags);

      let initResult: { publish_id: string };
      try {
        initResult = await this.api.initVideoPublish(accessToken, {
          direct,
          postInfo: {
            title,
            privacy_level: privacy,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          sourceInfo: {
            source: 'PULL_FROM_URL',
            video_url: job.videoUrl,
          },
        });
      } catch (err) {
        if (direct && err instanceof TikTokApiError) {
          this.logger.warn(`TikTok direct publish failed, fallback to inbox: ${err.message}`);
          initResult = await this.api.initVideoPublish(accessToken, {
            direct: false,
            postInfo: { title },
            sourceInfo: {
              source: 'PULL_FROM_URL',
              video_url: job.videoUrl,
            },
          });
        } else {
          throw err;
        }
      }

      await this.writeLog(jobId, job.listingId, 'INIT', 'Upload inicializován', initResult);

      let finalStatus = 'PROCESSING';
      let failReason: string | undefined;
      let postIds: string[] | undefined;

      for (let i = 0; i < TIKTOK_STATUS_POLL_MAX; i++) {
        await new Promise((r) => setTimeout(r, TIKTOK_STATUS_POLL_INTERVAL_MS));
        const status = await this.api.fetchPublishStatus(accessToken, initResult.publish_id);
        finalStatus = status.status;
        failReason = status.fail_reason;
        postIds = status.publicaly_available_post_id;
        if (finalStatus === 'PUBLISH_COMPLETE' || finalStatus === 'FAILED') break;
      }

      if (finalStatus === 'FAILED') {
        throw new TikTokApiError(
          failReason || TIKTOK_ERROR_MESSAGES.PUBLISH_REJECTED,
          undefined,
          { finalStatus, failReason },
        );
      }

      const usedDirect = direct && finalStatus === 'PUBLISH_COMPLETE';
      const tiktokVideoUrl =
        postIds?.[0] != null ? `https://www.tiktok.com/@${creator.creator_username}/video/${postIds[0]}` : null;

      await this.prisma.tikTokPublishJob.update({
        where: { id: jobId },
        data: {
          status: 'UPLOADED',
          tiktokPublishId: initResult.publish_id,
          tiktokVideoUrl,
          isDraftInbox: !usedDirect,
          publishedAt: new Date(),
          errorMessage: usedDirect ? null : 'Video bylo odesláno do TikTok inboxu — dokončete publikaci v aplikaci TikTok.',
        },
      });

      await this.writeLog(
        jobId,
        job.listingId,
        'UPLOADED',
        usedDirect ? TIKTOK_ERROR_MESSAGES.SUCCESS : 'Video odesláno do TikTok inboxu (draft).',
        { finalStatus, postIds, direct: usedDirect },
      );
    } catch (err) {
      const isRateLimit =
        err instanceof TikTokApiError &&
        (err.statusCode === 429 || err.code === 'rate_limit_exceeded');
      const isAuth =
        err instanceof TikTokApiError && (err.statusCode === 401 || err.code === 'access_token_invalid');
      const message =
        isRateLimit
          ? TIKTOK_ERROR_MESSAGES.RATE_LIMIT
          : isAuth
            ? TIKTOK_ERROR_MESSAGES.TOKEN_EXPIRED
            : err instanceof Error
              ? err.message
              : TIKTOK_ERROR_MESSAGES.PUBLISH_REJECTED;

      const updated = await this.prisma.tikTokPublishJob.findUnique({ where: { id: jobId } });
      const attempts = updated?.attempts ?? 1;
      const shouldRetry = attempts < 3 && (isRateLimit || isAuth);

      await this.prisma.tikTokPublishJob.update({
        where: { id: jobId },
        data: {
          status: shouldRetry ? 'WAITING' : isAuth ? 'NEEDS_REAUTH' : 'FAILED',
          errorMessage: message,
        },
      });

      await this.writeLog(jobId, job.listingId, shouldRetry ? 'RETRY' : 'FAILED', message, {
        error: err instanceof TikTokApiError ? { statusCode: err.statusCode, code: err.code, raw: err.raw } : String(err),
      });

      if (isAuth) {
        await this.oauth.disconnect();
      }

      throw err;
    }
  }

  async createJobForListing(listingId: string, opts?: { autoStart?: boolean }): Promise<{ jobId: string }> {
    const property = await this.prisma.property.findUnique({ where: { id: listingId } });
    if (!property) throw new Error('Inzerát nenalezen.');
    if (!isPropertyPubliclyListed(property)) {
      throw new Error(TIKTOK_ERROR_MESSAGES.LISTING_NOT_PUBLIC);
    }
    if (!property.videoUrl?.trim()) {
      throw new Error(TIKTOK_ERROR_MESSAGES.NO_VIDEO);
    }

    const { proxyUrl } = await this.videoUrls.assertPublicVideoAvailable(listingId);
    const caption = buildTikTokCaption({
      offerType: property.offerType,
      propertyType: property.propertyType,
      city: property.city,
    });
    const hashtags = buildTikTokHashtags({
      offerType: property.offerType,
      propertyType: property.propertyType,
    });

    const job = await this.prisma.tikTokPublishJob.create({
      data: {
        listingId,
        videoUrl: proxyUrl,
        caption,
        hashtags,
        status: TikTokPublishJobStatus.WAITING,
      },
    });

    if (opts?.autoStart) {
      // Queue cron picks it up; don't publish inline to respect rate limits
    }

    return { jobId: job.id };
  }
}
