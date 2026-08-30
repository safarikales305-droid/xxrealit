import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EditorialReelJobStatus, NewsSourceType, type EditorialReelTemplate } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import { EditorialReelRenderService } from './editorial-reel-render.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { ReelHookService } from './reel-hook.service';
import { shortenReelTitle } from './reel-title.util';
import { sortPostsForReelLead } from './reel-segment-scoring.util';
import { resolveShortsLogoPath } from '../properties/shorts-overlay-assets';

const PENDING_KEY = 'editorial_reel_pending';

type ReelFailedStage = 'COLLECTING' | 'RENDERING' | 'VALIDATION' | 'PUBLISHING';

function parseReelError(err: unknown): { message: string; code: string; stage: ReelFailedStage } {
  const message = err instanceof Error ? err.message : String(err);
  let code = 'UNKNOWN_ERROR';
  let stage: ReelFailedStage = 'RENDERING';
  if (message.includes('NOT_ENOUGH_VALID_SEGMENTS')) {
    code = 'NOT_ENOUGH_VALID_SEGMENTS';
    stage = 'COLLECTING';
  } else if (message.includes('ffmpeg') || message.includes('FFmpeg') || message.includes('FFMPEG')) {
    code = message.includes('není dostupný') ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_RENDER_ERROR';
    stage = 'RENDERING';
  } else if (message.includes('thumbnail') || message.includes('Thumbnail')) {
    code = 'THUMBNAIL_ERROR';
    stage = 'COLLECTING';
  } else if (
    message.includes('IMAGE_PROCESSING_ERROR') ||
    message.includes('sharp') ||
    message.includes('Sharp') ||
    message.includes('SHARP_RUNTIME')
  ) {
    code = message.includes('SHARP_RUNTIME') ? 'SHARP_RUNTIME_ERROR' : 'IMAGE_PROCESSING_ERROR';
    stage = 'RENDERING';
  } else if (message.includes('Cloudinary') || message.includes('upload')) {
    code = 'STORAGE_UPLOAD_ERROR';
    stage = 'RENDERING';
  } else if (message.includes('Meta') || message.includes('Facebook') || message.includes('Graph')) {
    code = 'META_API_ERROR';
    stage = 'PUBLISHING';
  } else if (message.includes('šablona') || message.includes('template')) {
    code = 'TEMPLATE_MISSING';
    stage = 'COLLECTING';
  }
  return { message, code, stage };
}

type PendingBuffer = {
  postIds: string[];
  since: string;
  categoryId?: string | null;
};

type CreateReelJobInput = {
  postIds: string[];
  title?: string;
  templateId?: string;
  categoryId?: string;
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
    private readonly shortsMusic: ShortsMusicService,
    private readonly reelHook: ReelHookService,
  ) {}

  async listJobs(limit = 50) {
    return this.prisma.editorialReelJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        category: true,
        template: { include: { musicTrack: { select: { id: true, title: true } } } },
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
        template: { include: { musicTrack: { select: { id: true, title: true } } } },
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
    const posts = sortPostsForReelLead(await this.loadPosts(input.postIds));
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
        templateSnapshot: template ? this.snapshotTemplate(template) : undefined,
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

    const posts = sortPostsForReelLead(await this.loadPosts(postIds));
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
        templateSnapshot: template ? this.snapshotTemplate(template) : undefined,
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
    if (
      job.status !== EditorialReelJobStatus.QUEUED &&
      job.status !== EditorialReelJobStatus.FAILED
    ) {
      return { skipped: true, status: job.status };
    }

    this.log.log(`[REEL][JOB:${jobId}] render started`);
    await this.prisma.editorialReelJob.update({
      where: { id: jobId },
      data: {
        status: EditorialReelJobStatus.RENDERING,
        renderError: null,
        publishError: null,
        failedStage: null,
        errorCode: null,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    let tmpRoot: string | null = null;
    try {
      const cfg = this.settings.getCached();
      const template =
        this.templateFromSnapshot(job.templateSnapshot) ??
        job.template ??
        (await this.resolveTemplate(job.templateId ?? cfg.templateId ?? undefined));
      if (!template) throw new Error('Chybí šablona Reel.');

      const musicPath = await this.resolveMusicPath(template.musicTrackId ?? cfg.musicTrackId);
      const segmentRows = job.segments.map((s) => ({
        thumbnailUrl:
          s.thumbnailUrl ??
          s.post.youtubeThumbnailUrl ??
          (s.post.youtubeVideoId
            ? `https://i.ytimg.com/vi/${s.post.youtubeVideoId}/hqdefault.jpg`
            : ''),
        title: shortenReelTitle(s.title ?? s.post.title ?? ''),
        channelTitle: s.channelTitle ?? s.post.youtubeChannelTitle ?? undefined,
        categoryLabel: s.categoryLabel ?? undefined,
      }));

      const hookText = template.generateHookText !== false
        ? await this.reelHook.generateHookText({
            titles: segmentRows.map((s) => s.title).filter(Boolean),
            categoryLabel: segmentRows[0]?.categoryLabel ?? job.category?.label ?? null,
            channelTitles: segmentRows.map((s) => s.channelTitle).filter(Boolean) as string[],
            mode: template.hookMode ?? 'AI_FALLBACK',
          })
        : template.introText?.trim() || 'Novinky z realit a bydlení';

      const renderTemplate = { ...template, introText: hookText };
      const logoPath = template.showLogo ? resolveShortsLogoPath() : null;

      this.log.log(`[REEL][JOB:${jobId}] collecting media — ${segmentRows.length} segments`);

      const rendered = await this.render.render({
        template: renderTemplate,
        segments: segmentRows,
        musicFilePath: musicPath,
        logoPath,
        minSegments: cfg.minVideos,
      });
      tmpRoot = rendered.tmpRoot;

      this.log.log(
        `[REEL][JOB:${jobId}] valid segments ${rendered.validSegmentCount}/${segmentRows.length}`,
      );

      const mp4 = await readFile(rendered.outputPath);
      const videoUrl = await this.cloudinary.uploadVideoBuffer(mp4, `editorial-reel-${jobId}.mp4`);

      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.READY,
          videoUrl,
          renderedAt: new Date(),
          videoCount: rendered.validSegmentCount,
          renderError: null,
          failedStage: null,
          errorCode: null,
        },
      });

      this.log.log(`[REEL][JOB:${jobId}] render completed`);

      if (cfg.autoPublish) {
        try {
          await this.publishJob(jobId);
        } catch (publishErr) {
          const parsed = parseReelError(publishErr);
          this.log.error(`[REEL][JOB:${jobId}][FAILED][PUBLISHING] ${parsed.message}`);
          return { ok: false, error: parsed.message, stage: 'PUBLISHING' };
        }
      }

      return { ok: true, videoUrl };
    } catch (err) {
      const parsed = parseReelError(err);
      this.log.error(`[REEL][JOB:${jobId}][FAILED][${parsed.stage}] ${parsed.message}`);
      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.FAILED,
          failedStage: parsed.stage,
          errorCode: parsed.code,
          renderError: parsed.message.slice(0, 4000),
        },
      });
      return { ok: false, error: parsed.message, stage: parsed.stage };
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

    this.log.log(`[REEL][JOB:${jobId}] publish started`);
    await this.prisma.editorialReelJob.update({
      where: { id: jobId },
      data: {
        status: EditorialReelJobStatus.PUBLISHING,
        publishError: null,
        failedStage: null,
        errorCode: null,
      },
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
          publishError: null,
          failedStage: null,
          errorCode: null,
        },
      });

      this.log.log(`[REEL][JOB:${jobId}] published`);

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
      const parsed = parseReelError(err);
      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: {
          status: EditorialReelJobStatus.READY,
          failedStage: 'PUBLISHING',
          errorCode: parsed.code,
          publishError: parsed.message.slice(0, 4000),
        },
      });
      throw err;
    }
  }

  async retryRender(jobId: string) {
    const job = await this.getJob(jobId);
    if (job.status !== EditorialReelJobStatus.FAILED && job.status !== EditorialReelJobStatus.QUEUED) {
      await this.prisma.editorialReelJob.update({
        where: { id: jobId },
        data: { status: EditorialReelJobStatus.QUEUED },
      });
    }
    return this.processQueuedJob(jobId);
  }

  async retryPublish(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job.videoUrl?.trim()) {
      throw new Error('Reel nemá vyrenderované video — nejdříve spusťte render.');
    }
    return this.publishJob(jobId);
  }

  private snapshotTemplate(template: EditorialReelTemplate) {
    return {
      id: template.id,
      name: template.name,
      introSec: template.introSec,
      segmentSec: template.segmentSec,
      outroSec: template.outroSec,
      videosPerReel: template.videosPerReel,
      transition: template.transition,
      showLogo: template.showLogo,
      showVideoTitle: template.showVideoTitle,
      showChannelTitle: template.showChannelTitle,
      showCategory: template.showCategory,
      ctaText: template.ctaText,
      introText: template.introText,
      hookMode: template.hookMode,
      generateHookText: template.generateHookText,
      useFirstVideoAsIntro: template.useFirstVideoAsIntro,
      showFirstVideoTitle: template.showFirstVideoTitle,
      musicTrackId: template.musicTrackId,
      narrationMode: template.narrationMode,
    };
  }

  private templateFromSnapshot(
    raw: unknown,
  ): Pick<
    EditorialReelTemplate,
    | 'introSec'
    | 'segmentSec'
    | 'outroSec'
    | 'introText'
    | 'ctaText'
    | 'transition'
    | 'showVideoTitle'
    | 'showChannelTitle'
    | 'showCategory'
    | 'showLogo'
    | 'musicTrackId'
    | 'hookMode'
    | 'generateHookText'
    | 'useFirstVideoAsIntro'
    | 'showFirstVideoTitle'
  > | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    return {
      introSec: Number(o.introSec) || 2,
      segmentSec: Number(o.segmentSec) || 4,
      outroSec: Number(o.outroSec) || 3,
      introText: typeof o.introText === 'string' ? o.introText : null,
      ctaText: typeof o.ctaText === 'string' ? o.ctaText : 'Další videa najdete na XXREALIT.cz',
      transition: (o.transition as EditorialReelTemplate['transition']) ?? 'FADE',
      showVideoTitle: o.showVideoTitle !== false,
      showChannelTitle: o.showChannelTitle !== false,
      showCategory: o.showCategory !== false,
      showLogo: o.showLogo !== false,
      musicTrackId: typeof o.musicTrackId === 'string' ? o.musicTrackId : null,
      hookMode: (o.hookMode as EditorialReelTemplate['hookMode']) ?? 'AI_FALLBACK',
      generateHookText: o.generateHookText !== false,
      useFirstVideoAsIntro: o.useFirstVideoAsIntro !== false,
      showFirstVideoTitle: o.showFirstVideoTitle !== false,
    };
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
    return this.shortsMusic.resolveActiveTrackFilePath(musicTrackId);
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
