import { Injectable, Logger } from '@nestjs/common';
import {
  EditorialReelOwnershipType,
  ReelPlatformPublishStatus,
  YouTubePublishJobStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { EDITORIAL_REEL_SETTINGS_KEY } from '../../editorial-reel/editorial-reel.constants';
import { DEFAULT_EDITORIAL_REEL_SETTINGS } from '../../editorial-reel/editorial-reel.types';
import {
  buildYouTubeReelDescription,
  buildYouTubeReelTags,
  buildYouTubeReelTitle,
  normalizeYoutubePrivacy,
} from './youtube-publish-metadata.util';
import { YouTubePublishService } from './youtube-publish.service';
import { YOUTUBE_PUBLISH_QUEUE_CONCURRENCY } from './youtube.constants';

function mapPublishError(err: unknown): { code: string; message: string; status: YouTubePublishJobStatus } {
  const message = err instanceof Error ? err.message : String(err);
  if (/AUTH_REQUIRED|invalid_grant|scope missing|token revoked/i.test(message)) {
    return { code: 'AUTH_REQUIRED', message, status: YouTubePublishJobStatus.AUTH_REQUIRED };
  }
  if (/QUOTA_EXCEEDED|quota/i.test(message)) {
    return { code: 'QUOTA_EXCEEDED', message, status: YouTubePublishJobStatus.QUOTA_EXCEEDED };
  }
  if (/OWNED|EXTERNAL|ownership/i.test(message)) {
    return { code: 'OWNERSHIP_BLOCKED', message, status: YouTubePublishJobStatus.FAILED };
  }
  return { code: 'UPLOAD_FAILED', message, status: YouTubePublishJobStatus.FAILED };
}

@Injectable()
export class YouTubePublishJobService {
  private readonly log = new Logger(YouTubePublishJobService.name);
  private processing = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: YouTubePublishService,
  ) {}

  async enqueueForReel(reelJobId: string) {
    const reel = await this.prisma.editorialReelJob.findUnique({
      where: { id: reelJobId },
      include: {
        segments: { orderBy: { sortOrder: 'asc' } },
        category: true,
        youtubePublishJobs: true,
      },
    });
    if (!reel?.videoUrl?.trim()) throw new Error('Reel nemá vyrenderované video.');
    if (reel.ownershipType !== EditorialReelOwnershipType.OWNED) {
      throw new Error('OWNERSHIP_BLOCKED: Pouze vlastní Reels lze publikovat na YouTube.');
    }
    if (reel.youtubePublishStatus === ReelPlatformPublishStatus.PUBLISHED && reel.youtubeVideoId) {
      return { alreadyPublished: true, videoId: reel.youtubeVideoId };
    }

    const existing = reel.youtubePublishJobs[0];
    if (existing?.status === YouTubePublishJobStatus.PUBLISHED && existing.youtubeVideoId) {
      return { alreadyPublished: true, videoId: existing.youtubeVideoId };
    }

    const cfg = await this.loadReelSettings();
    const privacyStatus = normalizeYoutubePrivacy(cfg.youtubePrivacyStatus);
    const title = buildYouTubeReelTitle({
      title: reel.title,
      categoryLabel: reel.category?.label,
      shortsCollectionId: reel.shortsCollectionId,
      segments: reel.segments.map((s) => ({
        title: s.title,
        channelTitle: s.channelTitle,
      })),
    });
    const description = buildYouTubeReelDescription({
      title: reel.title,
      categoryLabel: reel.category?.label,
      shortsCollectionId: reel.shortsCollectionId,
      segments: reel.segments.map((s) => ({ title: s.title })),
    });

    const job = existing
      ? await this.prisma.youTubePublishJob.update({
          where: { id: existing.id },
          data: {
            status: YouTubePublishJobStatus.QUEUED,
            title,
            description,
            privacyStatus,
            errorMessage: null,
            errorCode: null,
          },
        })
      : await this.prisma.youTubePublishJob.create({
          data: {
            reelJobId,
            status: YouTubePublishJobStatus.QUEUED,
            title,
            description,
            privacyStatus,
          },
        });

    await this.prisma.editorialReelJob.update({
      where: { id: reelJobId },
      data: {
        youtubePublishStatus: ReelPlatformPublishStatus.QUEUED,
        youtubePublishError: null,
      },
    });

    void this.processQueue();
    return { queued: true, jobId: job.id };
  }

  async retry(reelJobId: string) {
    return this.enqueueForReel(reelJobId);
  }

  async processQueue(): Promise<{ processed: number }> {
    if (this.processing >= YOUTUBE_PUBLISH_QUEUE_CONCURRENCY) {
      return { processed: 0 };
    }

    const job = await this.prisma.youTubePublishJob.findFirst({
      where: { status: YouTubePublishJobStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      include: {
        reelJob: {
          include: {
            segments: { orderBy: { sortOrder: 'asc' } },
            category: true,
          },
        },
      },
    });
    if (!job) return { processed: 0 };

    this.processing += 1;
    try {
      await this.processOne(job.id);
      return { processed: 1 };
    } finally {
      this.processing -= 1;
    }
  }

  async processOne(publishJobId: string) {
    const job = await this.prisma.youTubePublishJob.findUnique({
      where: { id: publishJobId },
      include: {
        reelJob: {
          include: {
            segments: { orderBy: { sortOrder: 'asc' } },
            category: true,
          },
        },
      },
    });
    if (!job) return;

    const reel = job.reelJob;
    if (!reel.videoUrl?.trim()) {
      await this.failJob(job.id, reel.id, 'Reel nemá video URL.', 'NO_VIDEO');
      return;
    }
    if (reel.ownershipType !== EditorialReelOwnershipType.OWNED) {
      await this.failJob(job.id, reel.id, 'OWNERSHIP_BLOCKED: Cizí obsah nelze uploadovat.', 'OWNERSHIP_BLOCKED');
      return;
    }

    const now = new Date();
    await this.prisma.youTubePublishJob.update({
      where: { id: job.id },
      data: {
        status: YouTubePublishJobStatus.AUTHENTICATING,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    await this.prisma.editorialReelJob.update({
      where: { id: reel.id },
      data: { youtubePublishStatus: ReelPlatformPublishStatus.PUBLISHING },
    });

    try {
      await this.prisma.youTubePublishJob.update({
        where: { id: job.id },
        data: { status: YouTubePublishJobStatus.UPLOADING },
      });

      const title =
        job.title ??
        buildYouTubeReelTitle({
          title: reel.title,
          categoryLabel: reel.category?.label,
          shortsCollectionId: reel.shortsCollectionId,
          segments: reel.segments.map((s) => ({ title: s.title })),
        });
      const description =
        job.description ??
        buildYouTubeReelDescription({
          title: reel.title,
          categoryLabel: reel.category?.label,
          shortsCollectionId: reel.shortsCollectionId,
          segments: reel.segments.map((s) => ({ title: s.title })),
        });
      const tags = buildYouTubeReelTags({
        title: reel.title,
        categoryLabel: reel.category?.label,
        segments: reel.segments.map((s) => ({
          title: s.title,
          channelTitle: s.channelTitle,
        })),
      });
      const privacyStatus = normalizeYoutubePrivacy(job.privacyStatus);
      const thumbnailUrl =
        reel.segments[0]?.thumbnailUrl ??
        reel.segments[0]?.postId
          ? (
              await this.prisma.post.findUnique({
                where: { id: reel.segments[0]!.postId },
                select: { youtubeThumbnailUrl: true },
              })
            )?.youtubeThumbnailUrl
          : null;

      const result = await this.publisher.uploadVideo({
        videoUrl: reel.videoUrl,
        title,
        description,
        tags,
        privacyStatus,
        thumbnailUrl,
      });

      const publishedAt = new Date();
      await this.prisma.youTubePublishJob.update({
        where: { id: job.id },
        data: {
          status: YouTubePublishJobStatus.PUBLISHED,
          youtubeVideoId: result.videoId,
          youtubeUrl: result.url,
          thumbnailUploaded: result.thumbnailUploaded,
          publishedAt,
          errorMessage: null,
          errorCode: null,
        },
      });
      await this.prisma.editorialReelJob.update({
        where: { id: reel.id },
        data: {
          youtubeVideoId: result.videoId,
          youtubePermalink: result.url,
          youtubePublishStatus: ReelPlatformPublishStatus.PUBLISHED,
          youtubePublishedAt: publishedAt,
          youtubePublishError: null,
        },
      });

      this.log.log(`[YOUTUBE][REEL:${reel.id}] published ${result.videoId}`);
    } catch (err) {
      const parsed = mapPublishError(err);
      await this.prisma.youTubePublishJob.update({
        where: { id: job.id },
        data: {
          status: parsed.status,
          errorMessage: parsed.message.slice(0, 4000),
          errorCode: parsed.code,
        },
      });

      const platformStatus =
        parsed.code === 'AUTH_REQUIRED'
          ? ReelPlatformPublishStatus.AUTH_REQUIRED
          : parsed.code === 'QUOTA_EXCEEDED'
            ? ReelPlatformPublishStatus.QUOTA_EXCEEDED
            : ReelPlatformPublishStatus.FAILED;

      await this.prisma.editorialReelJob.update({
        where: { id: reel.id },
        data: {
          youtubePublishStatus: platformStatus,
          youtubePublishError: parsed.message.slice(0, 4000),
        },
      });
      this.log.warn(`[YOUTUBE][REEL:${reel.id}] failed: ${parsed.message}`);
    }
  }

  private async failJob(publishJobId: string, reelJobId: string, message: string, code: string) {
    await this.prisma.youTubePublishJob.update({
      where: { id: publishJobId },
      data: {
        status: YouTubePublishJobStatus.FAILED,
        errorMessage: message,
        errorCode: code,
      },
    });
    await this.prisma.editorialReelJob.update({
      where: { id: reelJobId },
      data: {
        youtubePublishStatus: ReelPlatformPublishStatus.FAILED,
        youtubePublishError: message,
      },
    });
  }

  private async loadReelSettings() {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: EDITORIAL_REEL_SETTINGS_KEY },
    });
    const raw = row?.valueJson && typeof row.valueJson === 'object' ? (row.valueJson as Record<string, unknown>) : {};
    return {
      ...DEFAULT_EDITORIAL_REEL_SETTINGS,
      autoPublishYoutube:
        typeof raw.autoPublishYoutube === 'boolean' ? raw.autoPublishYoutube : false,
      youtubePrivacyStatus:
        typeof raw.youtubePrivacyStatus === 'string' ? raw.youtubePrivacyStatus : 'private',
    };
  }

  async getPublishSummary() {
    const [lastPublished, lastFailed, conn] = await Promise.all([
      this.prisma.youTubePublishJob.findFirst({
        where: { status: YouTubePublishJobStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.youTubePublishJob.findFirst({
        where: {
          status: {
            in: [
              YouTubePublishJobStatus.FAILED,
              YouTubePublishJobStatus.AUTH_REQUIRED,
              YouTubePublishJobStatus.QUOTA_EXCEEDED,
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.youTubeOAuthConnection.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      lastUploadAt: lastPublished?.publishedAt?.toISOString() ?? null,
      lastUploadVideoId: lastPublished?.youtubeVideoId ?? null,
      lastError: lastFailed?.errorMessage ?? conn?.lastError ?? null,
    };
  }
}
