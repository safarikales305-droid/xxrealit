import { Prisma, ReelPlatformPublishStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { activeJobWhere, galleryVideoWhere, masterVideoAssetWhere } from './ai-influencer-job-status.util';

export type AiInfluencerDashboardStats = {
  jobsStartedToday: number;
  jobsCompletedToday: number;
  activeJobs: number;
  publishedVideos: number;
  publishedVideosToday: number;
  failedJobsToday: number;
  galleryVideos: number;
  costTodayCzk: number;
  costMonthCzk: number;
  jobsWeek: number;
  failedAllTime: number;
};

function dayStartLocal(): Date {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

function monthStartLocal(dayStart: Date): Date {
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
}

function weekStartLocal(dayStart: Date): Date {
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  return weekStart;
}

/** Job with at least one platform publish target in PUBLISHED state. */
export function publishedVideoWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return {
    isTest: false,
    AND: [
      masterVideoAssetWhere(),
      {
        OR: [
          { facebookPublishStatus: ReelPlatformPublishStatus.PUBLISHED },
          { instagramPublishStatus: ReelPlatformPublishStatus.PUBLISHED },
          { youtubePublishStatus: ReelPlatformPublishStatus.PUBLISHED },
          { postId: { not: null } },
        ],
      },
    ],
  };
}

/** Master video finished today (renderedAt preferred, updatedAt fallback). */
export function completedVideoTodayWhere(dayStart: Date): Prisma.AiInfluencerReelJobWhereInput {
  return {
    isTest: false,
    AND: [
      masterVideoAssetWhere(),
      {
        OR: [
          { renderedAt: { gte: dayStart } },
          {
            AND: [{ renderedAt: null }, { updatedAt: { gte: dayStart } }],
          },
        ],
      },
    ],
  };
}

export function publishedVideoTodayWhere(dayStart: Date): Prisma.AiInfluencerReelJobWhereInput {
  return {
    AND: [
      publishedVideoWhere(),
      {
        OR: [
          { publishedAt: { gte: dayStart } },
          { facebookPublishedAt: { gte: dayStart } },
          { instagramPublishedAt: { gte: dayStart } },
          { youtubePublishedAt: { gte: dayStart } },
          { updatedAt: { gte: dayStart } },
        ],
      },
    ],
  };
}

export async function aggregateAiInfluencerDashboardStats(
  prisma: PrismaService,
): Promise<AiInfluencerDashboardStats> {
  const dayStart = dayStartLocal();
  const weekStart = weekStartLocal(dayStart);
  const monthStart = monthStartLocal(dayStart);

  const [
    jobsStartedToday,
    jobsCompletedToday,
    activeJobs,
    publishedVideos,
    publishedVideosToday,
    failedJobsToday,
    galleryVideos,
    costToday,
    costMonth,
    jobsWeek,
    failedAllTime,
  ] = await Promise.all([
    prisma.aiInfluencerReelJob.count({
      where: { createdAt: { gte: dayStart }, isTest: false },
    }),
    prisma.aiInfluencerReelJob.count({ where: completedVideoTodayWhere(dayStart) }),
    prisma.aiInfluencerReelJob.count({ where: activeJobWhere() }),
    prisma.aiInfluencerReelJob.count({ where: publishedVideoWhere() }),
    prisma.aiInfluencerReelJob.count({ where: publishedVideoTodayWhere(dayStart) }),
    prisma.aiInfluencerReelJob.count({
      where: { status: 'FAILED', updatedAt: { gte: dayStart }, isTest: false },
    }),
    prisma.aiInfluencerReelJob.count({ where: galleryVideoWhere() }),
    prisma.aiInfluencerReelJob.aggregate({
      where: { createdAt: { gte: dayStart }, isTest: false },
      _sum: { totalExternalCost: true },
    }),
    prisma.aiInfluencerReelJob.aggregate({
      where: { createdAt: { gte: monthStart }, isTest: false },
      _sum: { totalExternalCost: true },
    }),
    prisma.aiInfluencerReelJob.count({
      where: { createdAt: { gte: weekStart }, isTest: false },
    }),
    prisma.aiInfluencerReelJob.count({ where: { status: 'FAILED', isTest: false } }),
  ]);

  return {
    jobsStartedToday,
    jobsCompletedToday,
    activeJobs,
    publishedVideos,
    publishedVideosToday,
    failedJobsToday,
    galleryVideos,
    costTodayCzk: costToday._sum.totalExternalCost ?? 0,
    costMonthCzk: costMonth._sum.totalExternalCost ?? 0,
    jobsWeek,
    failedAllTime,
  };
}
