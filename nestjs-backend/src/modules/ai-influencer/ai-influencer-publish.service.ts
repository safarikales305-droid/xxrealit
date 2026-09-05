import { Injectable, Logger } from '@nestjs/common';
import {
  EditorialReelOwnershipType,
  ReelPlatformPublishStatus,
  AiInfluencerReelJobStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import { SocialInstagramConnectionService } from '../social/autopost/social-instagram-connection.service';
import { SocialInstagramPublisherService } from '../social/autopost/social-instagram-publisher.service';
import {
  buildYouTubeReelTags,
  buildYouTubeReelTitle,
  normalizeYoutubePrivacy,
} from '../social/youtube/youtube-publish-metadata.util';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';
import { YouTubePublishService } from '../social/youtube/youtube-publish.service';
import type { YoutubePrivacyStatus } from '../social/youtube/youtube.constants';
import type { InstagramConnectionStatus } from '../social/autopost/social-instagram.types';
import { AI_EDITOR_SYSTEM_EMAIL } from '../news-editorial/news-system-user.service';
import { buildAiReelListingTrackingUrl } from './ai-reel-listing-tracking.util';

export type FacebookTestResult = {
  ok: boolean;
  pageId?: string;
  pageName?: string;
  error?: string;
  hint?: string;
};

export type InstagramTestResult = {
  status: 'READY' | 'NOT_FOUND' | 'MISSING_PERMISSIONS' | 'NOT_CONNECTED' | 'ERROR';
  account: string | null;
  page: string | null;
  professionalAccount: boolean;
  publishingPermission: boolean;
  message: string | null;
  needsReconnect: boolean;
  missingScopes: string[];
};

@Injectable()
export class AiInfluencerPublishService {
  private readonly log = new Logger(AiInfluencerPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly socialPublisher: SocialPublisherService,
    private readonly instagramConnection: SocialInstagramConnectionService,
    private readonly instagramPublisher: SocialInstagramPublisherService,
    private readonly youtubeOAuth: YouTubeOAuthService,
    private readonly youtubePublish: YouTubePublishService,
  ) {}

  private jobPrimaryTitle(job: {
    captionTitle?: string | null;
    selectedHook?: string | null;
    article?: { title: string } | null;
    property?: { title: string } | null;
  }): string {
    return (
      job.captionTitle ??
      job.selectedHook ??
      job.article?.title ??
      job.property?.title ??
      'XXREALIT'
    );
  }

  private jobPreviewImage(job: {
    thumbnailUrl?: string | null;
    article?: { ogImageUrl?: string | null } | null;
    property?: { mainImage?: string | null; thumbnailUrl?: string | null } | null;
  }): string | null {
    return (
      job.thumbnailUrl ??
      job.article?.ogImageUrl ??
      job.property?.mainImage ??
      job.property?.thumbnailUrl ??
      null
    );
  }

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

  async getInstagramConnectionStatus(): Promise<InstagramConnectionStatus> {
    return this.instagramConnection.getConnectionStatus();
  }

  async verifyInstagramConnection(): Promise<InstagramConnectionStatus> {
    await this.instagramConnection.syncFromFacebookPage();
    return this.instagramConnection.getConnectionStatus();
  }

  formatInstagramTestResult(status: InstagramConnectionStatus): InstagramTestResult {
    const account = status.instagramUsername
      ? `@${status.instagramUsername}`
      : status.instagramBusinessId;
    const page = status.linkedPageName ?? status.linkedPageId;
    const professionalAccount = Boolean(status.instagramBusinessId);
    const publishingPermission = status.scopesOk && professionalAccount && status.tokenActive;

    let resultStatus: InstagramTestResult['status'] = 'ERROR';
    if (!status.linkedPageId || !status.tokenActive) {
      resultStatus = 'NOT_CONNECTED';
    } else if (!professionalAccount) {
      resultStatus = 'NOT_FOUND';
    } else if (!status.scopesOk) {
      resultStatus = 'MISSING_PERMISSIONS';
    } else if (publishingPermission && status.connected) {
      resultStatus = 'READY';
    }

    return {
      status: resultStatus,
      account,
      page,
      professionalAccount,
      publishingPermission,
      message: status.message,
      needsReconnect: status.needsReconnect,
      missingScopes: status.missingScopes,
    };
  }

  async testInstagramConnection(): Promise<InstagramTestResult> {
    const status = await this.verifyInstagramConnection();
    return this.formatInstagramTestResult(status);
  }

  private buildJobPublicUrl(
    job: {
      id: string;
      propertyId: string | null;
      article: { slug: string | null } | null;
    },
    platform: 'facebook' | 'instagram' | 'youtube' | 'shorts' | 'portal',
  ): string {
    const origin = getSiteOriginForOg();
    if (job.propertyId) {
      return buildAiReelListingTrackingUrl({
        origin,
        propertyId: job.propertyId,
        jobId: job.id,
        platform,
      });
    }
    if (job.article?.slug) {
      return `${origin}/aktuality/${job.article.slug}`;
    }
    return `${origin}/?tab=shorts`;
  }

  private buildInstagramCaption(job: {
    id: string;
    propertyId: string | null;
    captionTitle: string | null;
    selectedHook: string | null;
    captionDescription: string | null;
    hashtags: string | null;
    article: { slug: string | null; title: string } | null;
  }): string {
    const publicUrl = this.buildJobPublicUrl(job, 'instagram');
    return [
      job.captionTitle ?? job.selectedHook ?? 'Novinky z XXREALIT',
      job.captionDescription ?? '',
      '',
      'Více na XXREALIT.cz',
      publicUrl,
      '',
      job.hashtags ?? '#reality #bydleni #xxrealit',
    ]
      .filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''))
      .join('\n')
      .slice(0, 2200);
  }

  async publishToInstagram(jobId: string): Promise<{ permalink?: string; mediaId?: string }> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: { article: true },
    });
    if (!job) throw new Error('Job nenalezen.');
    const videoUrl = job.finalMasterUrl ?? job.videoUrl;
    if (!videoUrl?.trim()) throw new Error('Chybí finální master video.');

    if (
      job.instagramPublishStatus === ReelPlatformPublishStatus.PUBLISHED &&
      job.instagramMediaId
    ) {
      return {
        permalink: job.instagramPermalink ?? undefined,
        mediaId: job.instagramMediaId,
      };
    }

    const igStatus = await this.instagramConnection.getConnectionStatus();
    if (!igStatus.connected || !igStatus.scopesOk) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          instagramPublishStatus: igStatus.needsReconnect
            ? ReelPlatformPublishStatus.AUTH_REQUIRED
            : ReelPlatformPublishStatus.FAILED,
          instagramPublishError:
            igStatus.message ??
            (igStatus.missingScopes.length
              ? `Chybí oprávnění: ${igStatus.missingScopes.join(', ')}`
              : 'Instagram není připraven k publikování.'),
        },
      });
      throw new Error(
        igStatus.message ??
          'Instagram vyžaduje doplnění oprávnění Meta — obnovte Facebook propojení.',
      );
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        instagramPublishStatus: ReelPlatformPublishStatus.PUBLISHING,
        currentStep: 'IG_CREATING_CONTAINER',
      },
    });

    try {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { currentStep: 'IG_PROCESSING' },
      });

      const caption = this.buildInstagramCaption(job);
      const result = await this.instagramPublisher.publishReel({ videoUrl, caption });

      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { currentStep: 'IG_PUBLISHING' },
      });

      const username = igStatus.instagramUsername?.trim() || null;
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          instagramPublishStatus: ReelPlatformPublishStatus.PUBLISHED,
          instagramMediaId: result.externalPostId,
          instagramPermalink: result.publishedUrl,
          instagramUsername: username,
          instagramPublishedAt: new Date(),
          instagramPublishError: null,
          currentStep: 'IG_PUBLISHED',
          publishedAt: new Date(),
        },
      });

      await this.syncOverallPublishStatus(jobId);

      return {
        permalink: result.publishedUrl,
        mediaId: result.externalPostId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authRequired = /auth|token|permission|scope|oprávnění/i.test(message);
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          instagramPublishStatus: authRequired
            ? ReelPlatformPublishStatus.AUTH_REQUIRED
            : ReelPlatformPublishStatus.FAILED,
          instagramPublishError: message.slice(0, 2000),
          currentStep: 'IG_FAILED',
        },
      });
      this.log.warn(`Instagram publish failed for ${jobId}: ${message}`);
      throw err;
    }
  }

  async publishToFacebook(jobId: string): Promise<{ permalink?: string; postId?: string }> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: { article: true, property: true },
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
      const publicUrl = this.buildJobPublicUrl(job, 'facebook');
      const message = [
        job.captionTitle ?? job.selectedHook ?? 'Novinky z XXREALIT',
        job.captionDescription ?? '',
        job.hashtags ?? '',
        publicUrl,
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
        },
      });

      await this.syncOverallPublishStatus(jobId);

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
      include: { article: true, property: true },
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
      const primaryTitle = this.jobPrimaryTitle(job);
      const categoryLabel = job.article?.category ?? job.property?.propertyType ?? 'reality';
      const trackingUrl = this.buildJobPublicUrl(job, 'youtube');
      const title = buildYouTubeReelTitle({
        title: job.captionTitle ?? job.selectedHook,
        segments: [{ title: primaryTitle, channelTitle: 'XXREALIT' }],
        categoryLabel,
      });
      const description = [
        job.captionDescription ?? `AI redaktorka XXREALIT — ${primaryTitle}`,
        '',
        trackingUrl,
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
        categoryLabel,
        segments: [{ title: primaryTitle }],
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

      await this.syncOverallPublishStatus(jobId);

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

  async publishToPortal(jobId: string): Promise<{ postId: string }> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: { article: true, property: true },
    });
    if (!job) throw new Error('Job nenalezen.');

    const videoUrl = job.finalMasterUrl ?? job.videoUrl;
    if (!videoUrl?.trim()) throw new Error('Chybí finální master video.');
    const primaryTitle = this.jobPrimaryTitle(job);
    const previewImage = this.jobPreviewImage(job);

    if (job.postId) {
      await this.prisma.post.update({
        where: { id: job.postId },
        data: {
          videoUrl,
          previewImage,
          description: job.captionDescription ?? job.spokenText ?? primaryTitle,
          publishedAt: new Date(),
        },
      });
      return { postId: job.postId };
    }

    const systemUser = await this.prisma.user.findFirst({
      where: { email: AI_EDITOR_SYSTEM_EMAIL },
      select: { id: true },
    });
    if (!systemUser) {
      throw new Error('Systémový uživatel AI redakce není k dispozici.');
    }

    const description =
      job.captionDescription?.trim() ||
      `${job.captionTitle ?? job.selectedHook ?? primaryTitle}\n\n${job.hashtags ?? '#xxrealit #reality'}`;

    const post = await this.prisma.post.create({
      data: {
        type: 'post',
        title: (job.captionTitle ?? primaryTitle).slice(0, 200),
        price: job.property?.price ?? 0,
        city: job.property?.city ?? job.article?.region ?? '',
        description,
        content: description,
        videoUrl,
        previewImage,
        imageUrl: previewImage,
        userId: systemUser.id,
        newsArticleId: job.article?.id ?? null,
        publishedAt: new Date(),
        media: {
          create: [{ url: videoUrl, type: 'video', order: 0 }],
        },
      },
    });

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { postId: post.id, publishedAt: new Date() },
    });

    await this.syncOverallPublishStatus(jobId);
    return { postId: post.id };
  }

  async syncOverallPublishStatus(jobId: string): Promise<void> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const fb = job.facebookPublishStatus;
    const ig = job.instagramPublishStatus;
    const yt = job.youtubePublishStatus;
    const fbPublished = fb === ReelPlatformPublishStatus.PUBLISHED;
    const igPublished = ig === ReelPlatformPublishStatus.PUBLISHED;
    const ytPublished = yt === ReelPlatformPublishStatus.PUBLISHED;
    const portalPublished = Boolean(job.postId);

    const publishOutcomes = [fb, ig, yt].filter(
      (s) => s !== ReelPlatformPublishStatus.SKIPPED,
    );
    const publishedCount =
      [fbPublished, igPublished, ytPublished, portalPublished].filter(Boolean).length;
    const anyPublished = publishedCount > 0;
    const allAttemptedPublished =
      publishOutcomes.every((s) => s === ReelPlatformPublishStatus.PUBLISHED) &&
      (!job.postId || portalPublished);

    let status = job.status;
    if (allAttemptedPublished && publishedCount >= publishOutcomes.length) {
      status = AiInfluencerReelJobStatus.PUBLISHED;
    } else if (anyPublished) {
      status = AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED;
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status,
        progressPercent: 100,
        currentStep:
          status === AiInfluencerReelJobStatus.PUBLISHED
            ? 'Publikováno'
            : status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED
              ? 'Částečně publikováno'
              : job.currentStep,
      },
    });
  }
}