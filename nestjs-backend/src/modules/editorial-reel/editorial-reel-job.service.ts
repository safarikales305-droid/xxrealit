import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EditorialReelJobStatus, NewsSourceType } from '@prisma/client';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import { EditorialReelRenderService } from './editorial-reel-render.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
import type { CreateReelJobInput } from './editorial-reel.types';

const PENDING_KEY = 'editorial_reel_pending';

type PendingBuffer = {
  postIds: string[];
  since: string;
  categoryId?: string | null;
};

@Injectable()
export class EditorialReelJobService {
  private readonly log = new Logger(EditorialReelJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: EditorialReelSettingsService,
    private readonly render: EditorialReelRenderService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly socialPublisher: SocialPublisherService,
  ) {}

  async listJobs(limit = 50) {
    return this.prisma.editorialReelJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        category: true,
        template: true,
        shortsCollection: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
        segments: {
          orderBy: { sortOrder: 'asc' },
          include: {
            post: {
              select: {
                id: true,
                title: true,
                youtubeVideoId: true,
                youtubeThumbnailUrl: true,
                youtubeChannelTitle: true,
              },
            },
          },
        },
      },
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.editorialReelJob.findUnique({
      where: { id },
      include: {
        category: true,
        template: true,
        shortsCollection: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
        segments: {
          orderBy: { sortOrder: 'asc' },
          include: { post: true },
        },
      },
    });
    if (!job) throw new NotFoundException('Reel job nenalezen.');
    return job;
  }

  async createManualJob(input: CreateReelJobInput) {
    const posts = await this.loadPosts(input.postIds);
    if (posts.length < 2) {
      throw new Error('Reel vyžaduje alespoň 2 videa.');
    }
    const template = await this.resolveTemplate(input.templateId);
    const collection = await this.createShortsCollection(posts, input.title ?? `Reel — ${posts.length} videí`);
    const dedupeKey = `manual:${posts.map((p) => p.id).sort().join(',')}:${Date.now()}`;
    const job = await this.prisma.editorialReelJob.create({
      data: {
        status: EditorialReelJobStatus.QUEUED,
        title: input.title ?? `Reel — ${posts.length} videí`,
        templateId: template?.id,
        categoryId: input.categoryId ?? null,
        videoCount: posts.length,
        shortsCollectionId: collection.id,
        dedupeKey,
        segments: {
          create: posts.map((post, i) => this.segmentData(post, i)),
        },
      },
    });
    return job;
  }

  async enqueueFromNewPost(postId: string, sourceId?: string | null) {
    const cfg = this.settings.getCached();
    if (!cfg.enabled) return { queued: false, reason: 'DISABLED' };

    const source = sourceId
      ? await this.prisma.newsSource.findUnique({ where: { id: sourceId } })
      : null;
    if (source?.type === NewsSourceType.YOUTUBE_CHANNEL && source.youtubeUseForReel === false) {
      return { queued: false, reason: 'SOURCE_REEL_DISABLED' };
    }

    if (cfg.categorySlugs.length > 0 && source?.contentCategoryId) {
      const cat = await this.prisma.contentSourceCategory.findUnique({
        where: { id: source.contentCategoryId },
      });
      if (cat && !cfg.categorySlugs.includes(cat.slug)) {
        return { queued: false, reason: 'CATEGORY_FILTER' };
      }
    }

    const buffer = await this.getPendingBuffer();
    if (!buffer.postIds.includes(postId)) buffer.postIds.push(postId);
    if (!buffer.since) buffer.since = new Date().toISOString();
    if (source?.contentCategoryId && !buffer.categoryId) {
      buffer.categoryId = source.contentCategoryId;
    }
    await this.savePendingBuffer(buffer);

    const ageHours =
      (Date.now() - new Date(buffer.since).getTime()) / (60 * 60 * 1000);
    const shouldCreate =
      buffer.postIds.length >= cfg.videosPerReel ||
      (buffer.postIds.length >= cfg.minVideos && ageHours >= cfg.maxWaitHours);

    if (!shouldCreate) {
      return { queued: false, reason: 'BUFFERING', pending: buffer.postIds.length };
    }

    const take = Math.min(buffer.postIds.length, cfg.videosPerReel);
    const postIds = buffer.postIds.slice(0, take);
    await this.savePendingBuffer({
      postIds: buffer.postIds.slice(take),
      since: buffer.postIds.length > take ? buffer.since : '',
      categoryId: buffer.postIds.length > take ? buffer.categoryId : null,
    });

    const dedupeKey = `auto:${postIds.sort().join(',')}`;
    const existing = await this.prisma.editorialReelJob.findUnique({ where: { dedupeKey } });
    if (existing) return { queued: false, reason: 'DUPLICATE', jobId: existing.id };

    const posts = await this.loadPosts(postIds);
    const template = await this.resolveTemplate(cfg.templateId ?? undefined);
    const collection = await this.createShortsCollection(
      posts,
      `${cfg.introText} (${posts.length} videí)`,
    );

    const job = await this.prisma.editorialReelJob.create({
      data: {
        status: EditorialReelJobStatus.QUEUED,
        title: `${cfg.introText} — ${posts.length} nových videí`,
        templateId: template?.id,
        categoryId: buffer.categoryId ?? null,
        videoCount: posts.length,
        shortsCollectionId: collection.id,
        dedupeKey,
        segments: {
          create: posts.map((post, i) => this.segmentData(post, i)),
        },
      },
    });

    return { queued: true, jobId: job.id };
  }

  async processQueuedJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (job.status !== EditorialReelJobStatus.QUEUED && job.status !== EditorialReelJobStatus.FAILED) {
      return { skipped: true, status: job.status };
    }

    await this.prisma.editorialReelJob.update({
      where: { id: jobId },
      data: { status: EditorialReelJobStatus.RENDERING, renderError: null },
    });

    let tmpRoot: string | null = null;
    try {
      const template = job.template ?? (await this.resolveTemplate());
      if (!template) throw new Error('Chybí šablona Reel.');

      const musicPath = await this.resolveMusicPath(template.musicTrackId);
      const segments = job.segments.map((s) => ({
        thumbnailUrl:
          s.thumbnailUrl ??
          s.post.youtubeThumbnailUrl ??
          (s.post.youtubeVideoId
            ? `https://i.ytimg.com/vi/${s.post.youtubeVideoId}/hqdefault.jpg`
            : ''),
        title: s.title ?? s.post.title ?? '',
        channelTitle: s.channelTitle ?? s.post.youtubeChannelTitle ?? undefined,
        categoryLabel: s.categoryLabel ?? undefined,
      }));

      const rendered = await this.render.render({
        template,
        segments,
        musicFilePath: musicPath,
      });
      tmpRoot = rendered.tmpRoot;

      const mp4 = await readFile(rendered.outputPath);
      const videoUrl = await this.cloudinary.uploadVideoBuffer(mp4, `editorial-reel-${jobId}.mp4`);

      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.READY,
          videoUrl,
          renderedAt: new Date(),
          videoCount: segments.length,
        },
      });

      const cfg = this.settings.getCached();
      if (cfg.autoPublish) {
        await this.publishJob(jobId);
      }

      return { ok: true, videoUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`Reel render failed ${jobId}: ${message}`);
      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.FAILED,
          renderError: message.slice(0, 4000),
        },
      });
      return { ok: false, error: message };
    } finally {
      if (tmpRoot) await this.render.cleanup(tmpRoot);
    }
  }

  async publishJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job.videoUrl?.trim()) {
      throw new Error('Reel nemá vyrenderované video.');
    }
    if (job.status === EditorialReelJobStatus.PUBLISHED) {
      return { alreadyPublished: true, permalink: job.facebookPermalink };
    }

    await this.prisma.editorialReelJob.update({
      where: { id: jobId },
      data: { status: EditorialReelJobStatus.PUBLISHING, publishError: null },
    });

    try {
      const cfg = this.settings.getCached();
      const collectionUrl = job.shortsCollectionId
        ? `${getSiteOriginForOg()}/?tab=shorts&collection=${encodeURIComponent(job.shortsCollectionId)}&source=facebook-reel`
        : cfg.ctaUrl;
      const message = `${job.title ?? 'Novinky z XXREALIT'}\n\n${collectionUrl}`;

      const result = await this.socialPublisher.publishPropertyAsFacebookReel({
        videoUrl: job.videoUrl,
        message,
        title: job.title ?? 'XXREALIT Reel',
      });

      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.PUBLISHED,
          publishedAt: new Date(),
          facebookPostId: result.externalPostId ?? result.externalReelId ?? null,
          facebookPermalink: result.reelPublishedUrl ?? result.publishedUrl ?? null,
        },
      });

      const now = new Date();
      for (const seg of job.segments) {
        await this.prisma.post.update({
          where: { id: seg.postId },
          data: {
            lastUsedInReelAt: now,
            reelUsageCount: { increment: 1 },
          },
        });
      }

      return { ok: true, permalink: result.reelPublishedUrl ?? result.publishedUrl ?? undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.READY,
          publishError: message.slice(0, 4000),
        },
      });
      throw err;
    }
  }

  private segmentData(
    post: {
      id: string;
      title: string;
      youtubeThumbnailUrl: string | null;
      youtubeChannelTitle: string | null;
      youtubeVideoId: string | null;
      newsSource?: {
        contentCategory?: { label: string } | null;
        name: string;
      } | null;
    },
    sortOrder: number,
  ) {
    return {
      postId: post.id,
      sortOrder,
      thumbnailUrl:
        post.youtubeThumbnailUrl ??
        (post.youtubeVideoId ? `https://i.ytimg.com/vi/${post.youtubeVideoId}/hqdefault.jpg` : null),
      title: post.title,
      channelTitle: post.youtubeChannelTitle ?? post.newsSource?.name ?? null,
      categoryLabel: post.newsSource?.contentCategory?.label ?? null,
    };
  }

  private async loadPosts(ids: string[]) {
    const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
    const posts = await this.prisma.post.findMany({
      where: {
        id: { in: unique },
        type: 'YOUTUBE_VIDEO',
        publishedAt: { not: null },
        hiddenFromShorts: false,
      },
      include: {
        newsSource: { include: { contentCategory: true } },
      },
    });
    const order = new Map(unique.map((id, i) => [id, i]));
    return posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private async createShortsCollection(
    posts: Array<{ id: string; youtubeVideoId: string | null }>,
    title: string,
  ) {
    return this.prisma.shortsCollection.create({
      data: {
        title,
        source: 'facebook-reel',
        items: {
          create: posts.map((post, i) => ({
            postId: post.id,
            feedKey: post.youtubeVideoId ? `youtube:${post.youtubeVideoId}` : `post:${post.id}`,
            sortOrder: i,
          })),
        },
      },
    });
  }

  private async resolveTemplate(templateId?: string) {
    if (templateId) {
      const t = await this.prisma.editorialReelTemplate.findUnique({ where: { id: templateId } });
      if (t) return t;
    }
    return this.prisma.editorialReelTemplate.findFirst({
      where: { isDefault: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async resolveMusicPath(musicTrackId?: string | null): Promise<string | null> {
    let fileKey: string | null = null;
    if (musicTrackId) {
      const track = await this.prisma.editorialReelMusicTrack.findUnique({ where: { id: musicTrackId } });
      if (track?.active && track.fileKey) fileKey = track.fileKey;
    } else {
      const track = await this.prisma.editorialReelMusicTrack.findFirst({
        where: { isDefault: true, active: true },
      });
      if (track?.fileKey) fileKey = track.fileKey;
    }
    if (!fileKey) return null;
    if (!fileKey.startsWith('http')) return fileKey;
    const tmp = join(tmpdir(), `reel-music-${randomBytes(6).toString('hex')}.mp3`);
    const res = await fetch(fileKey, { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(tmp, buf);
    return tmp;
  }

  private async getPendingBuffer(): Promise<PendingBuffer> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: PENDING_KEY } });
    const raw = row?.valueJson as PendingBuffer | undefined;
    if (!raw || !Array.isArray(raw.postIds)) {
      return { postIds: [], since: '' };
    }
    return {
      postIds: raw.postIds.filter((x) => typeof x === 'string'),
      since: typeof raw.since === 'string' ? raw.since : '',
      categoryId: raw.categoryId ?? null,
    };
  }

  private async savePendingBuffer(buffer: PendingBuffer) {
    await this.prisma.appSetting.upsert({
      where: { key: PENDING_KEY },
      create: { key: PENDING_KEY, valueJson: buffer as object },
      update: { valueJson: buffer as object },
    });
  }
}
