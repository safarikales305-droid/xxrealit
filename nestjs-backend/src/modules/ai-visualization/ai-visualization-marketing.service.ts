import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiVisualizationEventName,
  AiVisualizationMarketingReelStatus,
  Prisma,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../../database/prisma.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import { classifyMetaGraphError, isMetaGraphAuthError } from '../social/autopost/meta-graph-error.util';
import { FacebookGraphPublishError } from '../social/autopost/facebook-graph-autopost.util';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { AiVisualizationStorageService } from './ai-visualization-storage.service';
import { AiVisualizationMarketingRenderService } from './ai-visualization-marketing-render.service';
import {
  buildFacebookReelCaption,
  buildMarketingCtaUrl,
  resolveCopyVariant,
  type MarketingReelContext,
} from './ai-visualization-marketing-copy.util';

const ACTIVE_ROOT_STATUSES: AiVisualizationMarketingReelStatus[] = [
  'QUEUED',
  'RENDERING',
  'READY',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'WAITING_FOR_FACEBOOK',
  'RETRY_WAIT',
];

const MAX_REEL_ATTEMPTS = 5;
const STALE_RENDERING_MS = 30 * 60 * 1000;
const STALE_PUBLISHING_MS = 25 * 60 * 1000;
const TICK_MS = 15_000;

/** Backoff minutes: ~1, 5, 15, 60, 60… */
export function marketingReelRetryDelayMinutes(retryCount: number): number {
  const schedule = [1, 5, 15, 60, 60, 120];
  return schedule[Math.min(Math.max(retryCount, 1), schedule.length) - 1] ?? 60;
}

@Injectable()
export class AiVisualizationMarketingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiVisualizationMarketingService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiVisualizationSettingsService,
    private readonly storage: AiVisualizationStorageService,
    private readonly render: AiVisualizationMarketingRenderService,
    private readonly socialPublisher: SocialPublisherService,
    private readonly socialSettings: SocialAutopostSettingsService,
    private readonly shortsMusic: ShortsMusicService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.log.log('[AI_VISUALIZATION_REEL] AI visualization marketing worker started');
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async onVisualizationCompleted(visualizationId: string) {
    const cfg = await this.settings.getSettings();
    if (!cfg.marketingReelsEnabled) return;

    const viz = await this.prisma.aiVisualization.findUnique({
      where: { id: visualizationId },
      include: {
        renovationEstimates: { orderBy: { calculatedAt: 'desc' }, take: 1 },
        renovationRequests: {
          where: { status: { in: ['SENT', 'COMPANIES_RESPONDING', 'OFFERS_RECEIVED'] } },
          include: { _count: { select: { recipients: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!viz || viz.status !== 'COMPLETED') return;
    if (!viz.originalCloudinaryId || !viz.resultCloudinaryId) return;

    const existing = await this.prisma.aiVisualizationMarketingReel.findUnique({
      where: { visualizationId },
    });
    if (existing && existing.status !== 'FAILED' && existing.status !== 'CANCELLED') {
      return;
    }

    await this.track(visualizationId, 'visualization_marketing_eligible', viz.userId, viz.anonymousSessionId);

    if (!viz.marketingConsent) {
      await this.prisma.aiVisualizationMarketingReel.upsert({
        where: { visualizationId },
        create: {
          visualizationId,
          rootSessionId: this.rootSessionId(viz),
          status: 'SKIPPED_NO_CONSENT',
        },
        update: { status: 'SKIPPED_NO_CONSENT' },
      });
      return;
    }

    const rootSessionId = this.rootSessionId(viz);
    const existingSessionReel = await this.prisma.aiVisualizationMarketingReel.findFirst({
      where: {
        status: { in: ACTIVE_ROOT_STATUSES },
        visualization: { anonymousSessionId: viz.anonymousSessionId },
      },
    });
    if (existingSessionReel && existingSessionReel.visualizationId !== visualizationId) {
      this.log.debug(`Skip marketing reel — session ${viz.anonymousSessionId} already has a reel`);
      return;
    }

    if (!cfg.marketingPublishEachVariant && viz.parentId) {
      const sibling = await this.prisma.aiVisualizationMarketingReel.findFirst({
        where: {
          rootSessionId,
          status: { in: ACTIVE_ROOT_STATUSES },
          NOT: { visualizationId },
        },
      });
      if (sibling) {
        this.log.debug(`Skip marketing reel for variant ${visualizationId} (root ${rootSessionId})`);
        return;
      }
    }

    const estimate = viz.renovationEstimates[0];
    const request = viz.renovationRequests[0];
    const contractorCount = request?._count.recipients ?? 0;
    const scheduledPublishAt = await this.computeNextPublishSlot(cfg.marketingMaxReelsPerDay, cfg.marketingMinIntervalMinutes, cfg.marketingPublishMode);

    const created = await this.prisma.aiVisualizationMarketingReel.upsert({
      where: { visualizationId },
      create: {
        visualizationId,
        rootSessionId,
        status: 'QUEUED',
        scheduledPublishAt,
        estimateMin: estimate?.estimateMin,
        estimateMax: estimate?.estimateMax,
        contractorCount,
        copyVariant: estimate || contractorCount ? (contractorCount > 0 ? 'C' : 'B') : 'A',
      },
      update: {
        status: 'QUEUED',
        scheduledPublishAt,
        lastError: null,
        estimateMin: estimate?.estimateMin,
        estimateMax: estimate?.estimateMax,
        contractorCount,
      },
    });

    await this.prisma.aiVisualizationMarketingReel.update({
      where: { id: created.id },
      data: {
        facebookCaption: buildFacebookReelCaption(
          this.buildContext(created.id, estimate ?? null, contractorCount, cfg, estimate?.estimateMin, estimate?.estimateMax),
        ),
        copyVariant: resolveCopyVariant(
          this.buildContext(created.id, estimate ?? null, contractorCount, cfg, estimate?.estimateMin, estimate?.estimateMax),
        ),
      },
    });

    await this.track(visualizationId, 'visualization_reel_queued', viz.userId, viz.anonymousSessionId);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    const started = Date.now();
    try {
      await this.socialSettings.reload();
      const cfg = await this.settings.getSettings();
      if (!cfg.marketingReelsEnabled) return;

      const now = new Date();
      await this.recoverStaleJobs(now);

      const job = await this.pickNextJob(now);
      if (!job) return;

      await this.processMarketingJob(job.id, cfg, now);
    } catch (err) {
      this.log.warn(`[AI_VISUALIZATION_REEL] Marketing tick error: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.ticking = false;
      const durationMs = Date.now() - started;
      if (durationMs > 5000) {
        this.log.warn(`[AI_VISUALIZATION_REEL] tick slow durationMs=${durationMs}`);
      }
    }
  }

  private async recoverStaleJobs(now: Date) {
    const staleRenderBefore = new Date(now.getTime() - STALE_RENDERING_MS);
    const stalePublishBefore = new Date(now.getTime() - STALE_PUBLISHING_MS);

    const staleRendering = await this.prisma.aiVisualizationMarketingReel.findMany({
      where: { status: 'RENDERING', renderStartedAt: { lt: staleRenderBefore } },
      take: 3,
    });
    for (const row of staleRendering) {
      this.log.warn(`[AI_VISUALIZATION_REEL] recover stale RENDERING jobId=${row.id}`);
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: row.id },
        data: {
          status: row.videoUrl ? 'READY' : 'QUEUED',
          lastError: 'Obnoveno po timeoutu renderu.',
          failurePhase: 'VIDEO_RENDER',
        },
      });
    }

    const stalePublishing = await this.prisma.aiVisualizationMarketingReel.findMany({
      where: { status: 'PUBLISHING', publishStartedAt: { lt: stalePublishBefore } },
      take: 3,
    });
    for (const row of stalePublishing) {
      if (row.facebookPostId || row.facebookPermalink) {
        await this.prisma.aiVisualizationMarketingReel.update({
          where: { id: row.id },
          data: { status: 'PUBLISHED', publishedAt: row.publishedAt ?? now },
        });
        continue;
      }
      this.log.warn(`[AI_VISUALIZATION_REEL] recover stale PUBLISHING jobId=${row.id}`);
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: row.id },
        data: {
          status: 'RETRY_WAIT',
          nextRetryAt: now,
          scheduledPublishAt: now,
          lastError: 'Obnoveno po timeoutu publikování.',
          failurePhase: 'FACEBOOK_PUBLISH',
        },
      });
    }
  }

  private async pickNextJob(now: Date) {
    return this.prisma.aiVisualizationMarketingReel.findFirst({
      where: {
        OR: [
          { status: 'QUEUED' },
          {
            status: 'RETRY_WAIT',
            retryCount: { lt: MAX_REEL_ATTEMPTS },
            nextRetryAt: { lte: now },
          },
          {
            status: 'READY',
            OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }],
          },
          {
            status: 'WAITING_FOR_FACEBOOK',
            videoUrl: { not: null },
            OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }],
          },
        ],
      },
      orderBy: [{ scheduledPublishAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async processMarketingJob(
    jobId: string,
    cfg: Awaited<ReturnType<AiVisualizationSettingsService['getSettings']>>,
    now: Date,
  ) {
    const job = await this.prisma.aiVisualizationMarketingReel.findUnique({ where: { id: jobId } });
    if (!job) return;

    this.log.log(
      `[AI_VISUALIZATION_REEL] jobId=${job.id} visualizationId=${job.visualizationId} state=${job.status} attempt=${job.retryCount}`,
    );

    if (job.status === 'QUEUED' || (job.status === 'RETRY_WAIT' && !job.videoUrl)) {
      await this.runRender(job.id, cfg);
      return;
    }

    if (job.status === 'RETRY_WAIT' && job.videoUrl) {
      if (!job.nextRetryAt || job.nextRetryAt > now) return;
      await this.runPublish(job.id, cfg);
      return;
    }

    if (job.status === 'READY' || job.status === 'WAITING_FOR_FACEBOOK') {
      if (job.scheduledPublishAt && job.scheduledPublishAt > now) return;
      if (!cfg.marketingPublishFacebook) return;
      await this.runPublish(job.id, cfg);
    }
  }

  private async runRender(reelId: string, cfg: Awaited<ReturnType<AiVisualizationSettingsService['getSettings']>>) {
    const reel = await this.prisma.aiVisualizationMarketingReel.update({
      where: { id: reelId },
      data: { status: 'RENDERING', renderStartedAt: new Date(), lastError: null },
      include: { visualization: true },
    });
    const viz = reel.visualization;
    if (viz.status !== 'COMPLETED' || !viz.originalCloudinaryId || !viz.resultCloudinaryId) {
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: { status: 'CANCELLED', lastError: 'Vizualizace již není k dispozici.' },
      });
      return;
    }

    let tmpRoot = '';
    try {
      const beforeBuffer = await this.storage.downloadBuffer(viz.originalCloudinaryId);
      const afterBuffer = await this.storage.downloadBuffer(viz.resultCloudinaryId);
      const ctx = this.buildContext(reel.id, null, reel.contractorCount ?? 0, cfg, reel.estimateMin, reel.estimateMax);

      let musicFilePath: string | null = null;
      if (cfg.marketingMusicEnabled) {
        try {
          musicFilePath = await this.shortsMusic.resolveActiveTrackFilePath();
        } catch {
          musicFilePath = null;
        }
      }

      const rendered = await this.render.render({
        beforeBuffer,
        afterBuffer,
        context: ctx,
        musicFilePath,
        musicVolumePercent: cfg.marketingMusicVolumePercent,
      });
      tmpRoot = rendered.tmpRoot;
      const mp4 = await readFile(rendered.outputPath);
      const uploaded = await this.storage.uploadMarketingReelVideo(mp4);

      const fbReady = this.socialSettings.isFacebookPublishingConfigured();
      const nextStatus: AiVisualizationMarketingReelStatus = fbReady ? 'READY' : 'WAITING_FOR_FACEBOOK';

      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: {
          status: nextStatus,
          videoCloudinaryId: uploaded.publicId,
          videoUrl: uploaded.secureUrl,
          renderCompletedAt: new Date(),
          scheduledPublishAt: reel.scheduledPublishAt ?? new Date(),
          facebookCaption: buildFacebookReelCaption(ctx),
          copyVariant: resolveCopyVariant(ctx),
          failurePhase: null,
          metaErrorCode: null,
          metaErrorSubcode: null,
          httpStatus: null,
        },
      });

      await this.track(viz.id, 'visualization_reel_rendered', viz.userId, viz.anonymousSessionId, { reelId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryCount = reel.retryCount + 1;
      const delayMin = marketingReelRetryDelayMinutes(retryCount);
      const nextRetryAt = new Date(Date.now() + delayMin * 60 * 1000);
      const permanent = retryCount >= MAX_REEL_ATTEMPTS;
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: {
          status: permanent ? 'FAILED' : 'RETRY_WAIT',
          lastError: message.slice(0, 2000),
          failurePhase: 'VIDEO_RENDER',
          retryCount,
          nextRetryAt: permanent ? null : nextRetryAt,
          scheduledPublishAt: permanent ? reel.scheduledPublishAt : nextRetryAt,
          lastAttemptAt: new Date(),
        },
      });
      this.log.warn(
        `[AI_VISUALIZATION_REEL] render failed jobId=${reelId} attempt=${retryCount} permanent=${permanent}`,
      );
      await this.track(viz.id, 'visualization_reel_failed', viz.userId, viz.anonymousSessionId, { reelId, message });
    } finally {
      if (tmpRoot) await this.render.cleanup(tmpRoot);
    }
  }

  private async runPublish(reelId: string, cfg: Awaited<ReturnType<AiVisualizationSettingsService['getSettings']>>) {
    const reel = await this.prisma.aiVisualizationMarketingReel.findUnique({
      where: { id: reelId },
      include: { visualization: true },
    });
    if (!reel?.videoUrl) return;

    if (!this.socialSettings.isFacebookPublishingConfigured()) {
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: { status: 'WAITING_FOR_FACEBOOK' },
      });
      return;
    }

    const todayCount = await this.countPublishedToday();
    if (todayCount >= cfg.marketingMaxReelsPerDay) {
      const next = await this.computeNextPublishSlot(cfg.marketingMaxReelsPerDay, cfg.marketingMinIntervalMinutes, 'SCHEDULED');
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: { status: 'READY', scheduledPublishAt: next },
      });
      return;
    }

    await this.prisma.aiVisualizationMarketingReel.update({
      where: { id: reelId },
      data: { status: 'PUBLISHING', publishStartedAt: new Date(), lastAttemptAt: new Date() },
    });

    const ctx = this.buildContext(
      reel.id,
      null,
      reel.contractorCount ?? 0,
      cfg,
      reel.estimateMin,
      reel.estimateMax,
    );
    const caption = reel.facebookCaption ?? buildFacebookReelCaption(ctx);

    try {
      const result = await this.socialPublisher.publishPropertyAsFacebookReel({
        videoUrl: reel.videoUrl,
        message: caption,
        title: 'AI vizualizace XXREALIT',
      });
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          facebookPostId: result.externalPostId ?? result.externalReelId ?? null,
          facebookPermalink: result.publishedUrl ?? null,
          failurePhase: null,
          metaErrorCode: null,
          metaErrorSubcode: null,
          httpStatus: null,
          lastError: null,
        },
      });
      await this.track(reel.visualizationId, 'visualization_reel_published', reel.visualization.userId, reel.visualization.anonymousSessionId, {
        reelId,
      });
    } catch (err) {
      const graph =
        err instanceof FacebookGraphPublishError && err.graphError
          ? err.graphError
          : undefined;
      const kind = graph
        ? classifyMetaGraphError({
            code: graph.code,
            message: graph.message,
            httpStatus: graph.httpStatus,
            error_subcode: graph.error_subcode,
          })
        : 'UNKNOWN';
      const rateLimited =
        kind === 'RATE_LIMIT' ||
        kind === 'META_TEMPORARY' ||
        (err instanceof Error && /rate limit|#4|timeout/i.test(err.message));
      const permanentAuth = graph ? isMetaGraphAuthError(kind) : false;
      const retryCount = reel.retryCount + 1;
      const delayMin = marketingReelRetryDelayMinutes(retryCount);
      const nextRetryAt = new Date(Date.now() + delayMin * 60 * 1000);
      const permanent = permanentAuth || (!rateLimited && retryCount >= MAX_REEL_ATTEMPTS);
      const phase = graph ? 'FACEBOOK_PUBLISH' : 'FACEBOOK_UPLOAD';
      const message = err instanceof Error ? err.message : String(err);

      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: {
          status: permanent ? 'FAILED' : 'RETRY_WAIT',
          lastError: message.slice(0, 2000),
          failurePhase: phase,
          metaErrorCode: graph?.code ?? null,
          metaErrorSubcode: graph?.error_subcode ?? null,
          httpStatus: graph?.httpStatus ?? null,
          retryCount,
          nextRetryAt: permanent ? null : nextRetryAt,
          scheduledPublishAt: permanent ? reel.scheduledPublishAt : nextRetryAt,
          lastAttemptAt: new Date(),
        },
      });
      this.log.warn(
        `[AI_VISUALIZATION_REEL] publish failed jobId=${reelId} attempt=${retryCount} kind=${kind} permanent=${permanent}`,
      );
      await this.track(reel.visualizationId, 'visualization_reel_failed', reel.visualization.userId, reel.visualization.anonymousSessionId, {
        reelId,
        kind,
        rateLimited,
      });
    }
  }

  async listAdmin(limit = 50) {
    const rows = await this.prisma.aiVisualizationMarketingReel.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        visualization: {
          select: {
            originalPreviewUrl: true,
            resultPreviewUrl: true,
            propertyType: true,
          },
        },
      },
    });
    return { items: rows };
  }

  async adminStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [queued, publishedToday, publishedTotal, failed] = await Promise.all([
      this.prisma.aiVisualizationMarketingReel.count({
        where: { status: { in: ['QUEUED', 'RENDERING', 'READY', 'SCHEDULED', 'WAITING_FOR_FACEBOOK', 'RETRY_WAIT', 'PUBLISHING'] } },
      }),
      this.prisma.aiVisualizationMarketingReel.count({
        where: { status: 'PUBLISHED', publishedAt: { gte: startOfDay } },
      }),
      this.prisma.aiVisualizationMarketingReel.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.aiVisualizationMarketingReel.count({ where: { status: 'FAILED' } }),
    ]);
    return { queued, publishedToday, publishedTotal, failed };
  }

  async adminFunnelStats(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const [
      seoCtaClicks,
      uploads,
      completed,
      estimates,
      leadEmails,
      requests,
      companiesContacted,
    ] = await Promise.all([
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_seo_cta_click' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_upload' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_complete' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_estimate_complete' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'renovation_lead_email_entered' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'renovation_request_sent' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'renovation_request_sent' },
      }),
    ]);
    return {
      days,
      seoCtaClicks,
      uploads,
      completedVisualizations: completed,
      estimatesCreated: estimates,
      leadEmails,
      contractorRequests: requests,
      companiesContacted,
    };
  }

  async adminGetDetail(reelId: string) {
    const reel = await this.prisma.aiVisualizationMarketingReel.findUnique({
      where: { id: reelId },
      include: {
        visualization: {
          select: {
            status: true,
            completedAt: true,
            marketingConsent: true,
            originalPreviewUrl: true,
            resultPreviewUrl: true,
          },
        },
      },
    });
    if (!reel) return null;
    const adminStatus =
      reel.status === 'SKIPPED_NO_CONSENT' ? 'NOT_ELIGIBLE_NO_CONSENT' : reel.status;
    const timeline = [
      { step: 'Visualization completed', ok: reel.visualization.status === 'COMPLETED' },
      { step: 'Reel created', ok: true },
      { step: 'Video rendered', ok: Boolean(reel.videoUrl && reel.renderCompletedAt) },
      {
        step: 'Facebook upload',
        ok: reel.status === 'PUBLISHED' || Boolean(reel.videoUrl),
        failed: reel.failurePhase === 'FACEBOOK_UPLOAD' && reel.status === 'FAILED',
      },
      {
        step: 'Facebook publish',
        ok: reel.status === 'PUBLISHED',
        failed: reel.failurePhase === 'FACEBOOK_PUBLISH' && reel.status === 'FAILED',
      },
    ];
    return {
      ...reel,
      adminStatus,
      timeline,
    };
  }

  async adminAction(reelId: string, action: 'publish_now' | 'retry' | 'skip') {
    if (action === 'skip') {
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: { status: 'SKIPPED' },
      });
      return { ok: true };
    }
    if (action === 'retry') {
      await this.prisma.aiVisualizationMarketingReel.update({
        where: { id: reelId },
        data: {
          status: 'QUEUED',
          lastError: null,
          nextRetryAt: null,
          scheduledPublishAt: new Date(),
          failurePhase: null,
          metaErrorCode: null,
          metaErrorSubcode: null,
          httpStatus: null,
          retryCount: 0,
        },
      });
      void this.tick();
      return { ok: true };
    }
    await this.prisma.aiVisualizationMarketingReel.update({
      where: { id: reelId },
      data: { status: 'READY', scheduledPublishAt: new Date(), nextRetryAt: null },
    });
    void this.tick();
    return { ok: true };
  }

  private rootSessionId(viz: { id: string; parentId: string | null }) {
    return viz.parentId ?? viz.id;
  }

  private buildContext(
    marketingReelId: string,
    estimate: { estimateMin: number; estimateMax: number } | null,
    contractorCount: number,
    cfg: Awaited<ReturnType<AiVisualizationSettingsService['getSettings']>>,
    estimateMin?: number | null,
    estimateMax?: number | null,
  ): MarketingReelContext {
    const min = estimateMin ?? estimate?.estimateMin ?? null;
    const max = estimateMax ?? estimate?.estimateMax ?? null;
    const hasEstimate = min != null && max != null;
    return {
      hasEstimate,
      estimateMin: min,
      estimateMax: max,
      contractorCount,
      showEstimate: cfg.marketingShowEstimateInReel,
      showContractors: cfg.marketingShowContractorsInReel,
      ctaUrl: buildMarketingCtaUrl(resolveFrontendUrl(this.config), marketingReelId, cfg.marketingCtaPath),
    };
  }

  private async computeNextPublishSlot(
    maxPerDay: number,
    minIntervalMinutes: number,
    mode: string,
  ): Promise<Date> {
    const now = new Date();
    const last = await this.prisma.aiVisualizationMarketingReel.findFirst({
      where: { status: 'PUBLISHED', publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
    });
    let candidate = now;
    if (last?.publishedAt) {
      const gap = new Date(last.publishedAt.getTime() + minIntervalMinutes * 60 * 1000);
      if (gap > candidate) candidate = gap;
    }
    const todayCount = await this.countPublishedToday();
    if (todayCount >= maxPerDay) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      if (tomorrow > candidate) candidate = tomorrow;
    }
    if (mode === 'IMMEDIATE' && todayCount < maxPerDay) {
      return candidate > now ? candidate : now;
    }
    return candidate;
  }

  private async countPublishedToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.aiVisualizationMarketingReel.count({
      where: { status: 'PUBLISHED', publishedAt: { gte: start } },
    });
  }

  private async track(
    visualizationId: string,
    eventName: AiVisualizationEventName,
    userId?: string | null,
    anonymousSessionId?: string,
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.aiVisualizationEvent.create({
      data: {
        eventName,
        visualizationId,
        userId: userId ?? undefined,
        anonymousSessionId,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
