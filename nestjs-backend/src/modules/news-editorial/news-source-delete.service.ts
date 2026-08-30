import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EditorialReelJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ShortsMixedFeedService } from '../feed/shorts-mixed-feed.service';
import { NewsAuditService } from './news-audit.service';

const PENDING_KEY = 'editorial_reel_pending';

export type NewsSourceDeletePreview = {
  sourceId: string;
  sourceName: string;
  channelId: string | null;
  videosCount: number;
  postsCount: number;
  shortsCount: number;
  pendingReelSegments: number;
};

export type NewsSourceDeleteResult = {
  success: true;
  sourceDeleted: true;
  videosDeleted: number;
  postsDeleted: number;
  shortsRemoved: number;
  pendingReelSegmentsRemoved: number;
  collectionsCleaned: number;
  reelJobsCancelled: number;
};

@Injectable()
export class NewsSourceDeleteService {
  private readonly log = new Logger(NewsSourceDeleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly shortsFeed: ShortsMixedFeedService,
  ) {}

  async getDeletePreview(sourceId: string): Promise<NewsSourceDeletePreview> {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Zdroj nenalezen.');

    const posts = await this.prisma.post.findMany({
      where: { newsSourceId: sourceId, type: 'YOUTUBE_VIDEO' },
      select: { id: true, publishedAt: true, hiddenFromShorts: true },
    });
    const postIds = posts.map((p) => p.id);
    const shortsCount = posts.filter(
      (p) => p.publishedAt && !p.hiddenFromShorts,
    ).length;

    const pendingReelSegments = postIds.length
      ? await this.prisma.editorialReelSegment.count({
          where: {
            postId: { in: postIds },
            job: {
              status: {
                in: [
                  EditorialReelJobStatus.DRAFT,
                  EditorialReelJobStatus.QUEUED,
                  EditorialReelJobStatus.RENDERING,
                ],
              },
            },
          },
        })
      : 0;

    return {
      sourceId: source.id,
      sourceName: source.name,
      channelId: source.channelId,
      videosCount: posts.length,
      postsCount: posts.length,
      shortsCount,
      pendingReelSegments,
    };
  }

  async removeWithContent(sourceId: string): Promise<NewsSourceDeleteResult> {
    const preview = await this.getDeletePreview(sourceId);
    this.log.log(`[YOUTUBE][SOURCE:${sourceId}] delete requested`);

    const postIds = (
      await this.prisma.post.findMany({
        where: { newsSourceId: sourceId, type: 'YOUTUBE_VIDEO' },
        select: { id: true },
      })
    ).map((p) => p.id);

    let pendingReelSegmentsRemoved = 0;
    let reelJobsCancelled = 0;
    let collectionsCleaned = 0;

    if (postIds.length > 0) {
      const activeJobs = await this.prisma.editorialReelJob.findMany({
        where: {
          status: {
            in: [
              EditorialReelJobStatus.DRAFT,
              EditorialReelJobStatus.QUEUED,
              EditorialReelJobStatus.RENDERING,
            ],
          },
          segments: { some: { postId: { in: postIds } } },
        },
        include: { segments: true },
      });

      for (const job of activeJobs) {
        const removed = job.segments.filter((s) => postIds.includes(s.postId));
        pendingReelSegmentsRemoved += removed.length;
        await this.prisma.editorialReelSegment.deleteMany({
          where: { id: { in: removed.map((s) => s.id) } },
        });
        const remaining = job.segments.length - removed.length;
        if (remaining < 2) {
          await this.prisma.editorialReelJob.update({
            where: { id: job.id },
            data: {
              status: EditorialReelJobStatus.FAILED,
              failedStage: 'COLLECTING',
              errorCode: 'NOT_ENOUGH_VALID_SEGMENTS',
              renderError: 'Reel zrušen — zdroj smazán, nedostatek segmentů.',
            },
          });
          reelJobsCancelled += 1;
        } else {
          await this.prisma.editorialReelJob.update({
            where: { id: job.id },
            data: { videoCount: remaining },
          });
        }
      }

      await this.prisma.shortsCollectionItem.deleteMany({
        where: { postId: { in: postIds } },
      });

      const emptyCollections = await this.prisma.shortsCollection.findMany({
        where: { items: { none: {} } },
        select: { id: true },
      });
      if (emptyCollections.length > 0) {
        await this.prisma.shortsCollection.deleteMany({
          where: { id: { in: emptyCollections.map((c) => c.id) } },
        });
        collectionsCleaned = emptyCollections.length;
      }
    }

    await this.removeFromPendingBuffer(postIds);

    const deleteResult = await this.prisma.post.deleteMany({
      where: { newsSourceId: sourceId, type: 'YOUTUBE_VIDEO' },
    });

    await this.prisma.newsSource.delete({ where: { id: sourceId } });

    this.shortsFeed.invalidatePoolCache();

    this.log.log(
      `[YOUTUBE][SOURCE:${sourceId}] videos removed: ${deleteResult.count}, posts removed: ${deleteResult.count}, reel segments removed: ${pendingReelSegmentsRemoved}`,
    );
    await this.audit.log(
      'YOUTUBE_SOURCE_DELETED',
      `Smazán YouTube zdroj ${preview.sourceName} včetně ${deleteResult.count} importovaných videí`,
      {
        metadata: {
          sourceId,
          videosDeleted: deleteResult.count,
          pendingReelSegmentsRemoved,
        },
      },
    );

    return {
      success: true,
      sourceDeleted: true,
      videosDeleted: deleteResult.count,
      postsDeleted: deleteResult.count,
      shortsRemoved: preview.shortsCount,
      pendingReelSegmentsRemoved,
      collectionsCleaned,
      reelJobsCancelled,
    };
  }

  private async removeFromPendingBuffer(postIds: string[]) {
    if (postIds.length === 0) return;
    const row = await this.prisma.appSetting.findUnique({ where: { key: PENDING_KEY } });
    const raw = row?.valueJson as { postIds?: string[]; since?: string; categoryId?: string | null } | undefined;
    if (!raw?.postIds?.length) return;
    const idSet = new Set(postIds);
    const next = raw.postIds.filter((id) => !idSet.has(id));
    await this.prisma.appSetting.upsert({
      where: { key: PENDING_KEY },
      create: { key: PENDING_KEY, valueJson: { postIds: next, since: raw.since ?? '' } },
      update: {
        valueJson: {
          postIds: next,
          since: next.length ? raw.since ?? '' : '',
          categoryId: next.length ? raw.categoryId ?? null : null,
        },
      },
    });
  }
}
