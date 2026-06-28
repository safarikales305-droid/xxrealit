import { Injectable } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishStatus,
  SocialPublishTriggerSource,
  FacebookPostType,
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
    publishedUrl?: string | null;
    lastError?: string | null;
    facebookPostType?: FacebookPostType | null;
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
        publishedUrl: input.publishedUrl ?? null,
        lastError: input.lastError ?? null,
        facebookPostType: input.facebookPostType ?? null,
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
      publishedUrl: row.publishedUrl,
      lastError: row.lastError,
      facebookPostType: row.facebookPostType,
      triggerSource: row.triggerSource,
      triggeredBy: row.triggeredBy,
      lastApiResponse: row.queue?.lastApiResponse ?? null,
      processedAt: row.queue?.processedAt?.toISOString() ?? null,
    }));
  }
}
