import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export type SchedulerTickDetail = {
  scheduleId: string;
  contentId: string;
  outcome: 'published' | 'failed' | 'skipped';
  error?: string;
  externalPostId?: string;
  publishedUrl?: string;
  graphResponse?: unknown;
};

@Injectable()
export class SocialPublishSchedulerLogService {
  constructor(private readonly prisma: PrismaService) {}

  async writeTick(input: {
    source: string;
    dueCount: number;
    publishedCount: number;
    failedCount: number;
    skippedCount: number;
    details?: SchedulerTickDetail[];
  }) {
    return this.prisma.socialPublishSchedulerLog.create({
      data: {
        source: input.source,
        dueCount: input.dueCount,
        publishedCount: input.publishedCount,
        failedCount: input.failedCount,
        skippedCount: input.skippedCount,
        details: input.details?.length ? (input.details as object) : undefined,
      },
    });
  }

  async listRecent(limit = 30) {
    return this.prisma.socialPublishSchedulerLog.findMany({
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  }
}
