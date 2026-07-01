import { Injectable } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishStatus,
  SocialPublishTriggerSource,
  FacebookPostType,
  SocialPublishKind,
  SocialIntroPropertyType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { pragueDateKey } from './social-publish-schedule.util';

@Injectable()
export class SocialPublishLogService {
  constructor(private readonly prisma: PrismaService) {}

  async wasPublishedToday(input: {
    platform?: SocialPlatform;
    contentType: SocialPublishContentType;
    contentId: string;
  }): Promise<boolean> {
    const today = pragueDateKey(new Date());
    const logs = await this.prisma.socialPublishLog.findMany({
      where: {
        platform: input.platform ?? SocialPlatform.FACEBOOK,
        contentType: input.contentType,
        contentId: input.contentId,
        status: SocialPublishStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true },
    });
    return logs.some((l) => pragueDateKey(l.createdAt) === today);
  }

  async writeLog(input: {
    platform?: SocialPlatform;
    contentType: SocialPublishContentType;
    contentId: string;
    queueId?: string | null;
    status: SocialPublishStatus;
    externalPostId?: string | null;
    externalReelId?: string | null;
    publishedUrl?: string | null;
    reelPublishedUrl?: string | null;
    lastError?: string | null;
    facebookPostType?: FacebookPostType | null;
    publishKind?: SocialPublishKind | null;
    contentTitle?: string | null;
    teaserDurationSec?: number | null;
    originalVideoDurationSec?: number | null;
    introVideoUsed?: boolean | null;
    introVideoPropertyType?: SocialIntroPropertyType | null;
    introVideoDurationSec?: number | null;
    totalReelDurationSec?: number | null;
    introVideoError?: string | null;
    introVideoIdUsed?: string | null;
    introVideoTitle?: string | null;
    sourceListingVideoUrl?: string | null;
    finalVideoUrl?: string | null;
    finalVideoGeneratedAt?: Date | string | null;
    graphApiResponse?: unknown;
    triggerSource: SocialPublishTriggerSource;
    triggeredByUserId?: string | null;
    scheduleId?: string | null;
  }) {
    return this.prisma.socialPublishLog.create({
      data: {
        platform: input.platform ?? SocialPlatform.FACEBOOK,
        contentType: input.contentType,
        contentId: input.contentId,
        queueId: input.queueId ?? null,
        scheduleId: input.scheduleId ?? null,
        status: input.status,
        externalPostId: input.externalPostId ?? null,
        externalReelId: input.externalReelId ?? null,
        publishedUrl: input.publishedUrl ?? null,
        reelPublishedUrl: input.reelPublishedUrl ?? null,
        lastError: input.lastError ?? null,
        facebookPostType: input.facebookPostType ?? null,
        publishKind: input.publishKind ?? null,
        contentTitle: input.contentTitle ?? null,
        teaserDurationSec: input.teaserDurationSec ?? null,
        originalVideoDurationSec: input.originalVideoDurationSec ?? null,
        introVideoUsed: input.introVideoUsed === true,
        introVideoPropertyType: input.introVideoPropertyType ?? null,
        introVideoDurationSec: input.introVideoDurationSec ?? null,
        totalReelDurationSec: input.totalReelDurationSec ?? null,
        introVideoError: input.introVideoError ?? null,
        introVideoIdUsed: input.introVideoIdUsed ?? null,
        introVideoTitle: input.introVideoTitle ?? null,
        sourceListingVideoUrl: input.sourceListingVideoUrl ?? null,
        finalVideoUrl: input.finalVideoUrl ?? null,
        finalVideoGeneratedAt: input.finalVideoGeneratedAt
          ? new Date(input.finalVideoGeneratedAt)
          : null,
        graphApiResponse:
          input.graphApiResponse != null ? (input.graphApiResponse as object) : undefined,
        triggerSource: input.triggerSource,
        triggeredByUserId: input.triggeredByUserId ?? null,
      },
    });
  }

  async listForProperty(propertyId: string, limit = 50) {
    const rows = await this.prisma.socialPublishLog.findMany({
      where: {
        contentId: propertyId,
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
        queue: { select: { lastApiResponse: true, processedAt: true } },
      },
    });
    return rows.map((row) => ({
      ...row,
      lastApiResponse: row.queue?.lastApiResponse ?? null,
      processedAt: row.queue?.processedAt?.toISOString() ?? null,
    }));
  }

  async listForSchedule(scheduleId: string, contentId: string, limit = 50) {
    const rows = await this.prisma.socialPublishLog.findMany({
      where: {
        OR: [{ scheduleId }, { contentId, triggerSource: 'SCHEDULE' }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
        queue: { select: { lastApiResponse: true, processedAt: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      externalPostId: row.externalPostId,
      externalReelId: row.externalReelId,
      publishedUrl: row.publishedUrl,
      reelPublishedUrl: row.reelPublishedUrl,
      lastError: row.lastError,
      facebookPostType: row.facebookPostType,
      publishKind: row.publishKind,
      contentTitle: row.contentTitle,
      teaserDurationSec: row.teaserDurationSec,
      originalVideoDurationSec: row.originalVideoDurationSec,
      introVideoUsed: row.introVideoUsed,
      introVideoPropertyType: row.introVideoPropertyType,
      introVideoDurationSec: row.introVideoDurationSec,
      totalReelDurationSec: row.totalReelDurationSec,
      introVideoError: row.introVideoError,
      introVideoIdUsed: row.introVideoIdUsed,
      introVideoTitle: row.introVideoTitle,
      sourceListingVideoUrl: row.sourceListingVideoUrl,
      finalVideoUrl: row.finalVideoUrl,
      finalVideoGeneratedAt: row.finalVideoGeneratedAt?.toISOString() ?? null,
      triggerSource: row.triggerSource,
      triggeredBy: row.triggeredBy,
      lastApiResponse: row.graphApiResponse ?? row.queue?.lastApiResponse ?? null,
      processedAt: row.queue?.processedAt?.toISOString() ?? null,
    }));
  }
}
