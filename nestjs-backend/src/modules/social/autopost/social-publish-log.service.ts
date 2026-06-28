import { Injectable } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishStatus,
  SocialPublishTriggerSource,
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
    triggerSource: SocialPublishTriggerSource;
    triggeredByUserId?: string | null;
  }) {
    return this.prisma.socialPublishLog.create({
      data: {
        platform: input.platform ?? SocialPlatform.FACEBOOK,
        contentType: input.contentType,
        contentId: input.contentId,
        queueId: input.queueId ?? null,
        status: input.status,
        externalPostId: input.externalPostId ?? null,
        publishedUrl: input.publishedUrl ?? null,
        lastError: input.lastError ?? null,
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
      },
    });
    return rows;
  }
}
