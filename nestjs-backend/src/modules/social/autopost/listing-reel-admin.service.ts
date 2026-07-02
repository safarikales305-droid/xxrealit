import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { toAbsoluteMediaUrl } from './social-publish-format.util';
import { ListingReelFinalVideoService } from './listing-reel-final-video.service';
import { SocialIntroVideoService } from './social-intro-video.service';
import {
  ReelRegenerateJob,
  ReelRegenerateJobService,
} from './reel-regenerate-job.service';
import {
  NORMALIZED_PROPERTY_TYPE_LABELS,
  SOCIAL_INTRO_PROPERTY_TYPE_LABELS,
  buildIntroVideoLookupOrder,
  resolveListingNormalizedType,
  resolveListingRawPropertyType,
  resolveSocialIntroPropertyType,
} from './social-intro-property-type.util';

@Injectable()
export class ListingReelAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finalVideo: ListingReelFinalVideoService,
    private readonly introVideos: SocialIntroVideoService,
    private readonly regenerateJobs: ReelRegenerateJobService,
  ) {}

  async testIntroCompose(input: {
    propertyType: SocialIntroPropertyType;
    propertyId?: string;
  }) {
    const property = await this.resolveSampleProperty(input.propertyType, input.propertyId);
    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);
    if (!videoUrl) {
      throw new BadRequestException('Testovací inzerát nemá video.');
    }

    const listingContext = {
      propertyTypeKey: property.propertyTypeKey,
      propertyType: property.propertyType,
      offerType: property.offerType,
      title: property.title,
      description: property.description,
    };

    const result = await this.finalVideo.buildFinalVideo({
      sourceVideoUrl: videoUrl,
      listingContext,
      forceRebuild: true,
    });

    return {
      ok: true,
      propertyId: property.id,
      propertyTitle: property.title,
      result,
    };
  }

  startRegenerateScheduleFinalVideo(scheduleId: string) {
    const jobId = this.regenerateJobs.createJob({ kind: 'single', scheduleId });
    void this.runSingleRegenerateJob(jobId, scheduleId);
    return { ok: true, jobId };
  }

  startRegenerateAllScheduledFinalVideos() {
    const jobId = this.regenerateJobs.createJob({ kind: 'bulk' });
    void this.runBulkRegenerateJob(jobId);
    return { ok: true, jobId };
  }

  getRegenerateJob(jobId: string): ReelRegenerateJob {
    return this.regenerateJobs.getJob(jobId);
  }

  private async runSingleRegenerateJob(jobId: string, scheduleId: string): Promise<void> {
    this.regenerateJobs.updateJob(jobId, {
      status: 'running',
      percent: 5,
      total: 1,
      processed: 0,
      currentListingTitle: null,
    });

    try {
      const { propertyTitle, result } = await this.regenerateScheduleFinalVideoCore(
        scheduleId,
        (percent, title) => {
          this.regenerateJobs.updateJob(jobId, {
            percent: Math.min(99, Math.max(5, percent)),
            currentListingTitle: title ?? null,
          });
        },
      );

      const counters = this.classifyRegenerateOutcome(result);
      this.regenerateJobs.updateJob(jobId, {
        status: 'done',
        percent: 100,
        processed: 1,
        currentListingTitle: propertyTitle,
        successCount: counters.successCount,
        errorCount: counters.errorCount,
        skippedCount: counters.skippedCount,
        errorMessage: result.introVideoError,
        result: { scheduleId, result },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.regenerateJobs.updateJob(jobId, {
        status: 'error',
        percent: 100,
        processed: 1,
        errorCount: 1,
        errorMessage,
      });
    }
  }

  private async runBulkRegenerateJob(jobId: string): Promise<void> {
    const schedules = await this.prisma.socialPublishSchedule.findMany({
      where: {
        enabled: true,
        platform: 'FACEBOOK',
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
      take: 200,
    });

    this.regenerateJobs.updateJob(jobId, {
      status: 'running',
      total: schedules.length,
      processed: 0,
      percent: schedules.length === 0 ? 100 : 0,
    });

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < schedules.length; index += 1) {
      const schedule = schedules[index]!;
      const property = await this.prisma.property.findUnique({
        where: { id: schedule.contentId },
      });
      const listingTitle = property?.title ?? schedule.contentId;

      this.regenerateJobs.updateJob(jobId, {
        currentListingTitle: listingTitle,
        processed: index,
        percent:
          schedules.length === 0
            ? 100
            : Math.round((index / schedules.length) * 100),
      });

      try {
        const { result } = await this.regenerateScheduleFinalVideoCore(schedule.id);
        const counters = this.classifyRegenerateOutcome(result);
        successCount += counters.successCount;
        errorCount += counters.errorCount;
        skippedCount += counters.skippedCount;
      } catch (err) {
        errorCount += 1;
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.regenerateJobs.updateJob(jobId, {
          errorMessage,
        });
      }

      this.regenerateJobs.updateJob(jobId, {
        processed: index + 1,
        percent: Math.round(((index + 1) / schedules.length) * 100),
        successCount,
        errorCount,
        skippedCount,
      });
    }

    this.regenerateJobs.updateJob(jobId, {
      status: 'done',
      percent: 100,
      processed: schedules.length,
      successCount,
      errorCount,
      skippedCount,
      currentListingTitle: null,
    });
  }

  private classifyRegenerateOutcome(result: {
    introVideoUsed: boolean;
    introVideoError: string | null;
    introVideoAttemptId: string | null;
  }): { successCount: number; errorCount: number; skippedCount: number } {
    if (result.introVideoError) {
      return { successCount: 0, errorCount: 1, skippedCount: 0 };
    }
    if (result.introVideoUsed) {
      return { successCount: 1, errorCount: 0, skippedCount: 0 };
    }
    if (!result.introVideoAttemptId) {
      return { successCount: 0, errorCount: 0, skippedCount: 1 };
    }
    return { successCount: 0, errorCount: 0, skippedCount: 1 };
  }

  private async regenerateScheduleFinalVideoCore(
    scheduleId: string,
    onProgress?: (percent: number, listingTitle?: string) => void,
  ) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
    });
    if (!property?.videoUrl?.trim()) {
      throw new BadRequestException('Inzerát nemá video pro Reel.');
    }

    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);
    if (!videoUrl) throw new BadRequestException('Video inzerátu není dostupné.');

    onProgress?.(10, property.title);

    const listingContext = {
      propertyTypeKey: property.propertyTypeKey,
      propertyType: property.propertyType,
      offerType: property.offerType,
      title: property.title,
      description: property.description,
    };

    const result = await this.finalVideo.buildFinalVideo({
      sourceVideoUrl: videoUrl,
      listingContext,
      forceRebuild: true,
      onProgress: (percent) => onProgress?.(10 + Math.round(percent * 0.85), property.title),
    });

    await this.finalVideo.updateScheduleFinalVideoSnapshot(scheduleId, result);

    console.log(
      '[reel-regenerate]',
      JSON.stringify({
        listingId: property.id,
        scheduledPostId: scheduleId,
        rawPropertyType: result.rawPropertyType,
        normalizedPropertyType: result.normalizedPropertyType,
        foundIntroVideo: Boolean(result.introVideoAttemptId),
        introVideoId: result.introVideoIdUsed ?? result.introVideoAttemptId,
        sourceVideoUrl: result.sourceListingVideoUrl,
        finalVideoUrl: result.finalVideoUrl,
        error: result.introVideoError,
      }),
    );

    return { scheduleId, propertyTitle: property.title, result };
  }

  async getScheduleIntroDiagnostics(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
    });
    if (!property) throw new NotFoundException('Inzerát nenalezen');

    const listingContext = {
      propertyTypeKey: property.propertyTypeKey,
      propertyType: property.propertyType,
      offerType: property.offerType,
      title: property.title,
      description: property.description,
    };

    const rawPropertyType = resolveListingRawPropertyType(listingContext);
    const normalizedPropertyType = resolveListingNormalizedType(listingContext);
    const structuralType = resolveSocialIntroPropertyType(listingContext);
    const lookupOrder = buildIntroVideoLookupOrder(listingContext);
    const predictedIntro = await this.introVideos.findIntroForListing(listingContext);

    const lastLog = await this.prisma.socialPublishLog.findFirst({
      where: { scheduleId },
      orderBy: { createdAt: 'desc' },
    });

    const sourceVideoUrl =
      schedule.lastSourceListingVideoUrl ??
      toAbsoluteMediaUrl(property.videoUrl) ??
      null;

    const introStatus = this.resolveIntroDisplayStatus({
      lastIntroVideoUsed: schedule.lastIntroVideoUsed,
      lastIntroVideoError: schedule.lastIntroVideoError,
      lastIntroVideoAttemptId: schedule.lastIntroVideoAttemptId,
      lastFinalVideoUrl: schedule.lastFinalVideoUrl,
      predictedIntroFound: Boolean(predictedIntro),
    });

    return {
      scheduleId: schedule.id,
      listingId: property.id,
      listingTitle: property.title,
      rawPropertyType,
      normalizedPropertyType,
      normalizedPropertyTypeLabel: NORMALIZED_PROPERTY_TYPE_LABELS[normalizedPropertyType],
      structuralPropertyType: structuralType,
      structuralPropertyTypeLabel: SOCIAL_INTRO_PROPERTY_TYPE_LABELS[structuralType],
      lookupOrder,
      predictedIntro: predictedIntro
        ? {
            id: predictedIntro.intro.id,
            title: predictedIntro.intro.title,
            propertyType: predictedIntro.matchedPropertyType,
            propertyTypeLabel:
              SOCIAL_INTRO_PROPERTY_TYPE_LABELS[predictedIntro.matchedPropertyType],
            videoUrl: predictedIntro.intro.videoUrl,
          }
        : null,
      introVideoStatus: introStatus.status,
      introVideoStatusReason: introStatus.reason,
      introVideoIdUsed: schedule.lastIntroVideoIdUsed,
      introVideoAttemptId: schedule.lastIntroVideoAttemptId,
      introVideoTitle: schedule.lastIntroVideoTitle,
      matchedIntroPropertyType: schedule.lastMatchedIntroPropertyType,
      sourceVideoUrl,
      finalVideoUrl: schedule.lastFinalVideoUrl,
      finalVideoGeneratedAt: schedule.lastFinalVideoGeneratedAt?.toISOString() ?? null,
      totalReelDurationSec: schedule.lastTotalReelDurationSec,
      lastIntroVideoError: schedule.lastIntroVideoError,
      lastFfmpegError: schedule.lastIntroVideoError ?? lastLog?.introVideoError ?? null,
      lastFacebookError: schedule.lastError ?? lastLog?.lastError ?? null,
      lastLogId: lastLog?.id ?? null,
    };
  }

  private resolveIntroDisplayStatus(input: {
    lastIntroVideoUsed: boolean;
    lastIntroVideoError: string | null;
    lastIntroVideoAttemptId: string | null;
    lastFinalVideoUrl: string | null;
    predictedIntroFound: boolean;
  }): { status: 'YES' | 'NO' | 'ERROR'; reason: string } {
    if (input.lastIntroVideoError) {
      return { status: 'ERROR', reason: input.lastIntroVideoError };
    }
    if (input.lastIntroVideoUsed) {
      return { status: 'YES', reason: 'Úvodní video bylo spojeno do finálního videa' };
    }
    if (input.lastIntroVideoAttemptId && input.lastFinalVideoUrl) {
      return {
        status: 'ERROR',
        reason: 'Úvodní video bylo nalezeno, ale spojení selhalo — použita jen ukázka inzerátu',
      };
    }
    if (!input.predictedIntroFound) {
      return {
        status: 'NO',
        reason: 'Nenalezeno aktivní úvodní video pro normalizovanou kategorii',
      };
    }
    if (!input.lastFinalVideoUrl) {
      return {
        status: 'NO',
        reason: 'Úvodní video je k dispozici, ale finální video ještě nebylo přegenerováno',
      };
    }
    return { status: 'NO', reason: 'Úvodní video nebylo použito' };
  }

  private async resolveSampleProperty(
    propertyType: SocialIntroPropertyType,
    propertyId?: string,
  ) {
    if (propertyId) {
      const row = await this.prisma.property.findUnique({ where: { id: propertyId } });
      if (!row || row.deletedAt) throw new NotFoundException('Inzerát nenalezen.');
      return row;
    }

    const candidates = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        videoUrl: { not: null },
        approved: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    const match = candidates.find((p) => {
      const order = buildIntroVideoLookupOrder({
        propertyTypeKey: p.propertyTypeKey,
        propertyType: p.propertyType,
        offerType: p.offerType,
        title: p.title,
        description: p.description,
      });
      return order.includes(propertyType);
    });

    if (!match) {
      throw new NotFoundException(
        `Nenalezen testovací inzerát s videem pro typ ${propertyType}. Zadejte propertyId.`,
      );
    }
    return match;
  }
}
