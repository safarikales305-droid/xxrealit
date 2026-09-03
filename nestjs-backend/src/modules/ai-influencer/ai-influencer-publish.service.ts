import { Injectable, Logger } from '@nestjs/common';
import {
  EditorialReelOwnershipType,
  ReelPlatformPublishStatus,
  AiInfluencerReelJobStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import {
  buildYouTubeReelDescription,
  buildYouTubeReelTags,
  buildYouTubeReelTitle,
  normalizeYoutubePrivacy,
} from '../social/youtube/youtube-publish-metadata.util';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';
import { YouTubePublishService } from '../social/youtube/youtube-publish.service';
import type { YoutubePrivacyStatus } from '../social/youtube/youtube.constants';

export type FacebookTestResult = {
  ok: boolean;
  pageId?: string;
  pageName?: string;
  error?: string;
  hint?: string;
};

@Injectable()
export class AiInfluencerPublishService {
  private readonly log = new Logger(AiInfluencerPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly socialPublisher: SocialPublisherService,
    private readonly youtubeOAuth: YouTubeOAuthService,
    private readonly youtubePublish: YouTubePublishService,
  ) {}

  async testFacebookConnection(): Promise<FacebookTestResult> {
    const result = await this.socialPublisher.testFacebookConnection();
    return {
      ok: result.ok,
      pageId: result.pageId,
      pageName: result.pageName,
      error: result.error,
      hint: result.hint,
    };
  }

  async publishToFacebook(jobId: string): Promise<{ permalink?: string; postId?: string }> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: { article: true },
    });
    if (!job) throw new Error('Job nenalezen.');
    const videoUrl = job.finalMasterUrl ?? job.videoUrl;
    if (!videoUrl?.trim()) throw new Error('Chybí finální master video.');

    if (job.facebookPublishStatus === ReelPlatformPublishStatus.PUBLISHED && job.facebookPostId) {
      return { permalink: job.facebookPermalink ?? undefined, postId: job.facebookPostId };
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { facebookPublishStatus: ReelPlatformPublishStatus.PUBLISHING },
    });

    try {
      const origin = getSiteOriginForOg();
      const articleUrl = job.article.slug
        ? `${origin}/aktuality/${job.article.slug}`
        : `${origin}/?tab=shorts`;
      const message = [
        job.captionTitle ?? job.selectedHook ?? 'Novinky z XXREALIT',
        job.captionDescription ?? '',
        job.hashtags ?? '',
        articleUrl,
      ]
        .filter(Boolean)
        .join('\n\n');

      const result = await this.socialPublisher.publishPropertyAsFacebookReel({
        videoUrl,
        message,
        title: job.captionTitle ?? job.selectedHook ?? 'XXREALIT AI Reel',
      });

      const postId = result.externalPostId ?? result.externalReelId ?? null;
      const permalink = result.reelPublishedUrl ?? result.publishedUrl ?? null;

      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          facebookPublishStatus: ReelPlatformPublishStatus.PUBLISHED,
          facebookPostId: postId,
          facebookPermalink: permalink,
          facebookPublishedAt: new Date(),
          facebookPublishError: null,
          publishedAt: new Date(),
          status: AiInfluencerReelJobStatus.PUBLISHED,
        },
      });

      return { permalink: permalink ?? undefined, postId: postId ?? undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authRequired = /auth|token|permission|OAuth/i.test(message);
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          facebookPublishStatus: authRequired
            ? ReelPlatformPublishStatus.AUTH_REQUIRED
            : ReelPlatformPublishStatus.FAILED,
          facebookPublishError: message.slice(0, 2000),
        },
      });
      throw err;
    }
  }

  async publishToYoutube(
    jobId: string,
    privacyStatus?: YoutubePrivacyStatus,
  ): Promise<{ videoId: string; url: string }> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: { article: true },
    });
    if (!job) throw new Error('Job nenalezen.');

    if (job.ownershipType === EditorialReelOwnershipType.EXTERNAL) {
      throw new Error('EXTERNAL: Externí videa nelze reuploadovat na XXREALIT kanál.');
    }

    const videoUrl = job.finalMasterUrl ?? job.videoUrl;
    if (!videoUrl?.trim()) throw new Error('Chybí finální master video.');

    if (job.youtubePublishStatus === ReelPlatformPublishStatus.PUBLISHED && job.youtubeVideoId) {
      return {
        videoId: job.youtubeVideoId,
        url: job.youtubePermalink ?? `https://www.youtube.com/watch?v=${job.youtubeVideoId}`,
      };
    }

    const ytStatus = await this.youtubeOAuth.getConnectionStatus();
    if (!ytStatus.connected) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          youtubePublishStatus: ReelPlatformPublishStatus.AUTH_REQUIRED,
          youtubePublishError: 'YouTube kanál není připojen.',
        },
      });
      throw new Error('YouTube kanál není připojen.');
    }

    const privacy = normalizeYoutubePrivacy(privacyStatus ?? job.youtubePrivacyStatus ?? 'private');

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { youtubePublishStatus: ReelPlatformPublishStatus.PUBLISHING },
    });

    try {
      const title = buildYouTubeReelTitle({
        title: job.captionTitle ?? job.selectedHook,
        segments: [{ title: job.article.title, channelTitle: 'XXREALIT' }],
        categoryLabel: job.article.category,
      });
      const description = [
        job.captionDescription ?? `AI redaktorka XXREALIT — ${job.article.title}`,
        '',
        'https://www.xxrealit.cz/?tab=shorts',
        '',
        'XXREALIT – reality, bydlení, investice a stavebnictví',
        '',
        (job.hashtags ?? '#reality #bydleni #nemovitosti #xxrealit')
          .split(/\s+/)
          .filter((h) => h.startsWith('#'))
          .join(' ') || '#reality #bydleni #xxrealit',
      ].join('\n');
      const tags = buildYouTubeReelTags({
        title: job.captionTitle,
        categoryLabel: job.article.category,
        segments: [{ title: job.article.title }],
      });

      const upload = await this.youtubePublish.uploadVideo({
        videoUrl,
        title,
        description,
        tags,
        privacyStatus: privacy,
        thumbnailUrl: job.thumbnailUrl,
      });

      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          youtubePublishStatus: ReelPlatformPublishStatus.PUBLISHED,
          youtubeVideoId: upload.videoId,
          youtubePermalink: upload.url,
          youtubePublishedAt: new Date(),
          youtubePrivacyStatus: privacy,
          youtubePublishError: null,
          publishedAt: new Date(),
        },
      });

      return { videoId: upload.videoId, url: upload.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let status: ReelPlatformPublishStatus = ReelPlatformPublishStatus.FAILED;
      if (/AUTH_REQUIRED|invalid_grant|scope/i.test(message)) {
        status = ReelPlatformPublishStatus.AUTH_REQUIRED;
      } else if (/QUOTA/i.test(message)) {
        status = ReelPlatformPublishStatus.QUOTA_EXCEEDED;
      }
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          youtubePublishStatus: status,
          youtubePublishError: message.slice(0, 2000),
        },
      });
      throw err;
    }
  }
}
