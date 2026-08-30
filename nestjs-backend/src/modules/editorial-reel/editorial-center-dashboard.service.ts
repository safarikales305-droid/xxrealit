import { Injectable } from '@nestjs/common';
import { EditorialReelJobStatus, NewsSourceType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsEditorialSettingsService } from '../news-editorial/news-editorial-settings.service';
import type { EditorialCenterDashboard } from './editorial-reel.types';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';

@Injectable()
export class EditorialCenterDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newsSettings: NewsEditorialSettingsService,
    private readonly reelSettings: EditorialReelSettingsService,
  ) {}

  async getDashboard(): Promise<EditorialCenterDashboard> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [
      activeYoutube,
      activeRss,
      videosToday,
      articlesToday,
      shortsPosts,
      syncErrors,
      reelsWeek,
      lastReel,
    ] = await Promise.all([
      this.prisma.newsSource.count({
        where: { type: NewsSourceType.YOUTUBE_CHANNEL, enabled: true },
      }),
      this.prisma.newsSource.count({
        where: { type: { not: NewsSourceType.YOUTUBE_CHANNEL }, enabled: true },
      }),
      this.prisma.post.count({
        where: {
          type: 'YOUTUBE_VIDEO',
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.newsArticle.count({
        where: { publishedAt: { gte: todayStart } },
      }),
      this.prisma.post.count({
        where: {
          type: { in: ['YOUTUBE_VIDEO', 'NEWS_ARTICLE'] },
          publishedAt: { not: null },
          hiddenFromShorts: false,
        },
      }),
      this.prisma.newsSource.count({
        where: {
          OR: [{ health: 'ERROR' }, { lastError: { not: null } }],
          enabled: true,
        },
      }),
      this.prisma.editorialReelJob.count({
        where: {
          status: EditorialReelJobStatus.PUBLISHED,
          publishedAt: { gte: weekStart },
        },
      }),
      this.prisma.editorialReelJob.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true },
      }),
    ]);

    const newsCfg = this.newsSettings.getCached();
    const reelCfg = this.reelSettings.getCached();

    return {
      activeYoutubeChannels: activeYoutube,
      activeRssSources: activeRss,
      videosImportedToday: videosToday,
      articlesImportedToday: articlesToday,
      shortsContentCount: shortsPosts,
      autoPublishingActive:
        newsCfg.enabled &&
        (newsCfg.autoPublishArticles || newsCfg.youtubeCreatePortalPost !== false),
      facebookReelsThisWeek: reelsWeek,
      syncErrors,
      reelAutomationActive: reelCfg.enabled,
      lastReelAt: lastReel?.createdAt?.toISOString() ?? null,
      lastReelStatus: lastReel?.status ?? null,
    };
  }
}
