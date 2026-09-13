import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AiInfluencerReelJobStatus,
  AiInfluencerTopicCandidateStatus,
  NewsArticleStatus,
  Prisma,
  ProviderGenerationStatus,
  ProviderGenerationType,
  ReelPlatformPublishStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { mergeRenderSettings, REEL_CANVAS_HEIGHT, REEL_CANVAS_WIDTH, type AiInfluencerRenderSettings } from './ai-influencer-render.types';
import { appendTimelineEvent } from './ai-influencer-timeline.util';
import {
  activeJobWhere,
  ACTIVE_JOB_STATUSES,
  galleryVideoWhere,
  hasMasterVideoAsset,
  isAdminCancellableStatus,
  isForceCancellableStatus,
  isActiveGenerationStatus,
  isCompletedGenerationStatus,
  isFailedGenerationStatus,
  isQueuedGenerationStatus,
  queuedJobWhere,
  recentCompletedVideoWhere,
  resolveMasterVideoUrl,
  workerQueueWhere,
} from './ai-influencer-job-status.util';
import {
  AI_INFLUENCER_CLAIM_STALE_MS,
  AI_INFLUENCER_QUEUE_STALE_MS,
  AI_INFLUENCER_QUEUE_STALLED_MS,
  AI_INFLUENCER_VIDEO_AGENT_SUBMIT_STALE_MS,
  AI_INFLUENCER_STORAGE_STUCK_MS,
  AI_INFLUENCER_STORAGE_TIMEOUT_MS,
} from './ai-influencer.constants';
import {
  bypassesDuplicateGate,
  bypassesQualityGate,
  buildSourceModeMeta,
  type AiInfluencerSourceMode,
} from './ai-influencer-source-mode.util';
import { AiInfluencerWorkerService } from './ai-influencer-worker.service';
import {
  isAuthError,
  isTransientError,
  progressForStatus,
  RENDER_PROGRESS,
  retryDelayMs,
  type ProgressMeta,
} from './ai-influencer-progress.util';
import { resumeJobStatus, resolveFailedStage } from './ai-influencer-retry.util';
import {
  nextFacebookPublishRetryMeta,
  shouldRetryFacebookPublish,
} from './meta-facebook-publish-retry.util';
import { OpenAiService } from '../openai/openai.service';
import {
  decodeHtmlEntities,
  ensureBrandMention,
  normalizeArticleTitle,
  titleSimilarity,
} from './ai-influencer-text.util';
import { prepareSpeechTextForProvider } from './ai-influencer-pronunciation.util';
import { runQualityGate } from './ai-influencer-quality-gate.util';
import { computeProductionReadiness } from './ai-influencer-preflight.util';
import {
  getRendererRuntimeReadiness,
  resolveVideoAgentCanonicalReady,
} from './ai-influencer-provider-readiness.util';
import { buildJobAdminDisplay, type JobDisplayInput } from './ai-influencer-job-display.util';
import { buildGalleryVideoMeta } from './ai-influencer-video-gallery.util';
import {
  buildFixedVideoAgentTestScript,
  buildProductionTestStatus,
  hashFixedTestScript,
  isProductionTestJob,
  resolveJobTargetDurationSec,
} from './ai-influencer-production-test.util';
import { AiProviderService } from '../openai/ai-provider.service';
import {
  extractPipelineErrorCode,
  extractPipelineErrorMessage,
  pipelineError,
  resolvePipelineFailedStage,
} from './ai-influencer-pipeline-stage.util';
import { getElevenLabsRuntimeConfig } from './ai-influencer-runtime-config.util';
import { HeyGenRuntimeConfigService } from './heygen-runtime-config.service';
import { maskProviderJobId } from './heygen-video-agent-poll.util';
import type { HeyGenVideoAgentPollResult } from './providers/heygen-video-agent.provider';
import { resolveShortsLogoPath } from '../properties/shorts-overlay-assets';
import { AiInfluencerPublishService } from './ai-influencer-publish.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerRenderService } from './ai-influencer-render.service';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { ArticleMediaProvider } from './providers/article-media.provider';
import { PropertyMediaProvider } from './providers/property-media.provider';
import { OpenAiScriptProvider } from './providers/openai-script.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { HeyGenVideoAgentProvider } from './providers/heygen-video-agent.provider';
import { HeyGenVideoAgentMediaService } from './heygen-video-agent-media.service';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import {
  buildHeyGenVideoAgentPrompt,
  collectStoryboardMediaUrls,
} from './heygen-video-agent-prompt.util';
import {
  inferJobGenerationMode,
  isAvatarFallbackAllowed,
  getJobSnapshotGenerationMode,
  isActiveVideoAgentJob,
  isVideoAgentExternalJobId,
  mergeJobRenderMeta,
  parseVideoAgentSessionId,
  readJobRenderMeta,
  resolveJobProviderJobId,
  resolveVideoGenerationMode,
  toVideoAgentExternalJobId,
  VIDEO_AGENT_EXTERNAL_PREFIX,
  videoAgentPollRatio,
  videoAgentTimedOut,
} from './ai-influencer-video-agent.util';
import {
  extractSessionIdForRecovery,
  hasPersistedVideoAgentProviderId,
  isVideoAgentSubmitStale,
  isVideoAgentSubmitUnknown,
  shouldBlockVideoAgentResubmit,
  shouldResumeVideoAgentPolling,
} from './ai-influencer-video-agent-persist.util';
import {
  isElevenLabsRequiredForJob,
  resolveVoiceEngine,
  shouldSkipVoicePhaseForVideoAgent,
} from './voice-engine.util';
import { ProviderGenerationService } from './provider-generation.service';
import type { ReelScriptPayload } from './ai-influencer.types';
import { validateAndNormalizeStoryboard } from './ai-influencer-storyboard.util';
import { FfmpegRenderError } from './ai-influencer-ffmpeg.util';
import {
  isJobCancelledState,
  isProviderSubmittedForCancel,
  shouldBlockAutoPublish,
  shouldSkipPipelineForCancel,
  type AiInfluencerCancelPhase,
} from './ai-influencer-cancel.util';
import {
  buildVideoGenerationConflictBody,
  estimateHeyGenCostCzk,
  estimateHeyGenCredits,
  type ActiveVideoGenerationConflict,
  videoGenerationLockWhere,
} from './ai-influencer-single-flight.util';
import {
  assessStaleActiveJob,
  type AiInfluencerRepairReport,
} from './ai-influencer-job-repair.util';

export type HeyGenPortalSyncResult = {
  scanned: number;
  foundInHeyGen: number;
  recovered: number;
  storedInGallery: number;
  stillProcessing: number;
  providerIdMissing: number;
  unmatched: number;
  errors: number;
  newHeyGenCreateCalls: number;
  details: Array<{ jobId: string; title: string; outcome: string; message?: string }>;
};

type AiInfluencerJobWithRelations = Prisma.AiInfluencerReelJobGetPayload<{
  include: {
    article: true;
    property: true;
    profile: true;
    candidate: true;
  };
}>;

function errorCode(err: unknown): string | null {
  return extractPipelineErrorCode(err);
}

function failedStageLabel(
  stage: AiInfluencerReelJobStatus,
  err: unknown,
  message: string,
): string {
  return resolvePipelineFailedStage({
    jobStatus: stage,
    error: err,
    message,
    errorCode: extractPipelineErrorCode(err),
  });
}

@Injectable()
export class AiInfluencerJobService {
  private readonly log = new Logger(AiInfluencerJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiInfluencerSettingsService,
    private readonly registry: AiInfluencerProviderRegistry,
    private readonly scriptProvider: OpenAiScriptProvider,
    private readonly mediaProvider: ArticleMediaProvider,
    private readonly propertyMediaProvider: PropertyMediaProvider,
    private readonly render: AiInfluencerRenderService,
    private readonly generationCache: ProviderGenerationService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly shortsMusic: ShortsMusicService,
    private readonly publish: AiInfluencerPublishService,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly videoAgent: HeyGenVideoAgentProvider,
    private readonly heygenMedia: HeyGenVideoAgentMediaService,
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly openAi: OpenAiService,
    private readonly aiProvider: AiProviderService,
    private readonly heygenConfig: HeyGenRuntimeConfigService,
    @Inject(forwardRef(() => AiInfluencerWorkerService))
    private readonly worker: AiInfluencerWorkerService,
  ) {}

  async listJobs(limit = 50) {
    const jobs = await this.prisma.aiInfluencerReelJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        article: { select: { id: true, title: true, publishedAt: true, status: true } },
        property: { select: { id: true, title: true } },
        profile: { select: { id: true, name: true, slug: true } },
        candidate: { select: { reelPotentialScore: true } },
      },
    });
    const cfg = this.settings.getCached();
    const workerElevenConfigured = getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED';
    return jobs.map((j) =>
      this.enrichJobRow(
        {
          ...j,
          article: j.article
            ? { ...j.article, title: decodeHtmlEntities(j.article.title) }
            : null,
          property: j.property
            ? { ...j.property, title: decodeHtmlEntities(j.property.title) }
            : null,
        },
        cfg,
        workerElevenConfigured,
      ),
    );
  }

  async listActiveJobs() {
    const active = await this.prisma.aiInfluencerReelJob.findMany({
      where: activeJobWhere(),
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        article: { select: { id: true, title: true } },
        property: { select: { id: true, title: true } },
        candidate: { select: { reelPotentialScore: true } },
      },
    });
    const cfg = this.settings.getCached();
    const workerElevenConfigured = getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED';
    const heygenConfigured = this.heygenConfig.isApiKeyConfigured();
    return active
      .filter((j) => {
        const meta = readJobRenderMeta(j.renderSettingsJson);
        return !shouldSkipPipelineForCancel(j.status, meta);
      })
      .map((j) => {
      const display = buildJobAdminDisplay(j, cfg, { workerElevenConfigured, heygenConfigured });
      const meta = readJobRenderMeta(j.renderSettingsJson);
      const providerJobId = resolveJobProviderJobId(meta, j.avatarExternalJobId);
      const testLabel =
        j.isTest && meta.testKind === 'VIDEO_AGENT'
          ? 'TEST – Video Agent'
          : j.isTest
            ? 'TEST – Kompletní pipeline'
            : null;
      return {
        id: j.id,
        isTest: j.isTest,
        testKind: meta.testKind ?? null,
        status: j.status,
        progressPercent: j.progressPercent,
        currentStep: j.currentStep,
        errorMessage: display.displayErrorMessage ?? j.errorMessage,
        errorCode: display.displayErrorCode ?? j.errorCode,
        failedStage: display.failedStageResolved ?? j.failedStage,
        skipReason: j.skipReason,
        facebookPublishStatus: j.facebookPublishStatus,
        youtubePublishStatus: j.youtubePublishStatus,
        articleTitle:
          testLabel ??
          decodeHtmlEntities(j.article?.title ?? j.property?.title ?? 'Inzerát'),
        score: j.candidate?.reelPotentialScore ?? null,
        updatedAt: j.updatedAt,
        createdAt: j.createdAt,
        generationMode: display.generationMode,
        retryLabel: display.retryLabel,
        errorKind: display.errorKind,
        pipelineSteps: display.pipelineSteps,
        sourceType: j.propertyId ? 'property' : 'article',
        providerJobId: providerJobId ? maskProviderJobId(providerJobId) : null,
        providerLastPolledAt: meta.providerLastPolledAt ?? null,
        heygenCreditsEstimated: meta.heygenCreditsEstimated ?? null,
        estimatedCostCzk: j.avatarCostEstimated ?? null,
        totalCostCzk: j.totalExternalCost ?? null,
        canonicalJobId: j.id,
      };
    });
  }

  async findActiveVideoGenerationJob(
    excludeJobId?: string,
  ): Promise<ActiveVideoGenerationConflict | null> {
    const row = await this.prisma.aiInfluencerReelJob.findFirst({
      where: videoGenerationLockWhere(excludeJobId),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        article: { select: { title: true } },
        property: { select: { title: true } },
      },
    });
    if (!row) return null;
    return {
      activeJobId: row.id,
      status: row.status,
      createdAt: row.createdAt,
      articleTitle: row.article?.title ?? row.property?.title ?? null,
    };
  }

  async assertNoActiveVideoGeneration(excludeJobId?: string): Promise<void> {
    const active = await this.findActiveVideoGenerationJob(excludeJobId);
    if (active) {
      throw new ConflictException(buildVideoGenerationConflictBody(active));
    }
  }

  /** Po nasazení — max 1 aktivní job; starší duplicity se ukončí nebo obnoví z HeyGen. */
  async reconcileLegacyActiveVideoJobs(limit = 10): Promise<{ scanned: number; reconciled: number }> {
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: activeJobWhere(),
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, renderSettingsJson: true, avatarExternalJobId: true, createdAt: true },
    });
    if (rows.length <= 1) return { scanned: rows.length, reconciled: 0 };

    let reconciled = 0;
    const [, ...duplicates] = rows;
    for (const row of duplicates) {
      const meta = readJobRenderMeta(row.renderSettingsJson);
      const ageMs = Date.now() - row.createdAt.getTime();
      const providerSubmitted = isProviderSubmittedForCancel(meta, row.avatarExternalJobId);
      try {
        if (providerSubmitted) {
          const result = await this.reconcileHeyGenJob(row.id);
          if (result.outcome === 'RECOVERED' || result.outcome === 'ALREADY_ARCHIVED') {
            reconciled += 1;
            continue;
          }
          await this.forceCancelJob(row.id, 'Legacy reconciliation — duplicitní aktivní job');
          reconciled += 1;
        } else if (ageMs > 30 * 60 * 1000) {
          await this.forceCancelJob(row.id, 'Legacy reconciliation — zastaralý job bez provider ID');
          reconciled += 1;
        }
      } catch (err) {
        this.log.warn(
          `Legacy active job reconcile ${row.id} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { scanned: rows.length, reconciled };
  }

  async getJob(id: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id },
      include: {
        article: true,
        property: true,
        profile: true,
        candidate: true,
      },
    });
    if (!job) throw new NotFoundException('AI Influencer job nenalezen.');
    const cfg = this.settings.getCached();
    const enriched = this.enrichJobRow(job, cfg, getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED');
    return {
      ...enriched,
      gallery: buildGalleryVideoMeta(job),
      isTest: job.isTest,
    } as AiInfluencerJobWithRelations & {
      gallery: ReturnType<typeof buildGalleryVideoMeta>;
      isTest: boolean;
    };
  }

  async listArticles(limit = 40) {
    const articles = await this.prisma.newsArticle.findMany({
      where: { status: NewsArticleStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        category: true,
        ogImageUrl: true,
        aiInfluencerReelJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, candidate: { select: { reelPotentialScore: true } } },
        },
        aiReelCandidates: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
          select: { reelPotentialScore: true, reasoningSummary: true },
        },
      },
    });
    return articles.map((a) => ({
      id: a.id,
      title: decodeHtmlEntities(a.title),
      publishedAt: a.publishedAt,
      category: a.category,
      ogImageUrl: a.ogImageUrl,
      reelScore: a.aiReelCandidates[0]?.reelPotentialScore ?? null,
      latestJob: a.aiInfluencerReelJobs[0] ?? null,
    }));
  }

  async createJobFromArticle(
    articleId: string,
    options?: { force?: boolean; sourceMode?: AiInfluencerSourceMode },
  ): Promise<{
    jobId: string;
    status: string;
    progress: number;
    articleTitle: string;
    generationMode: 'VIDEO_AGENT' | 'AVATAR';
    sourceType: 'ARTICLE';
    sourceId: string;
  }> {
    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || article.status !== NewsArticleStatus.PUBLISHED) {
      throw new BadRequestException('Článek není publikovaný.');
    }
    const profile = await this.registry.getDefaultProfile();
    await this.assertProductionReadyForNewJob();
    const cfg = this.settings.getCached();
    const generationMode = resolveVideoGenerationMode(cfg);
    const sourceMode: AiInfluencerSourceMode =
      options?.sourceMode ?? (options?.force === true ? 'MANUAL' : 'AUTO');
    const bypassQuality =
      sourceMode === 'MANUAL' ||
      sourceMode === 'RETRY' ||
      sourceMode === 'TEST' ||
      options?.force === true;
    const targetDurationSec = cfg.targetDurationSec ?? 40;
    const initialRenderMeta = this.buildInitialJobRenderMeta(
      buildSourceModeMeta(sourceMode, {
        manualRequestedAt: sourceMode === 'MANUAL' ? new Date().toISOString() : undefined,
        heygenCreditsEstimated: estimateHeyGenCredits(targetDurationSec),
      }),
    );
    const job = await this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.aiInfluencerReelJob.count({ where: videoGenerationLockWhere() });
      if (activeCount > 0) {
        const active = await tx.aiInfluencerReelJob.findFirst({
          where: videoGenerationLockWhere(),
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, createdAt: true, article: { select: { title: true } } },
        });
        if (active) {
          throw new ConflictException(
            buildVideoGenerationConflictBody({
              activeJobId: active.id,
              status: active.status,
              createdAt: active.createdAt,
              articleTitle: active.article?.title ?? null,
            }),
          );
        }
      }
      return tx.aiInfluencerReelJob.create({
        data: {
          articleId,
          profileId: profile.id,
          status: AiInfluencerReelJobStatus.EVALUATING,
          sourceType: 'ARTICLE',
          forceOverride: bypassQuality,
          progressPercent: 3,
          currentStep: 'Čeká ve frontě',
          estimatedDurationSec: targetDurationSec,
          avatarCostEstimated: estimateHeyGenCostCzk(targetDurationSec, cfg.avatarCostPerSecCzk),
          renderSettingsJson: initialRenderMeta as object,
          timelineEvents: appendTimelineEvent(null, 'JOB_CREATED') as object,
        },
      });
    });
    this.scheduleBootstrapCreatedJob(job.id);
    const refreshed = await this.getJob(job.id);
    return {
      jobId: refreshed.id,
      status: refreshed.status,
      progress: refreshed.progressPercent,
      articleTitle: decodeHtmlEntities(article.title),
      generationMode,
      sourceType: 'ARTICLE',
      sourceId: articleId,
    };
  }

  async createJobFromTopicCandidate(candidateId: string): Promise<{
    jobId: string;
    status: string;
    progress: number;
    title: string;
    generationMode: 'VIDEO_AGENT' | 'AVATAR';
    estimatedCostCzk: number;
  }> {
    const candidate = await this.prisma.aiInfluencerTopicCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new NotFoundException('Návrh tématu nenalezen.');
    if (
      candidate.status === AiInfluencerTopicCandidateStatus.VIDEO_QUEUED ||
      candidate.status === AiInfluencerTopicCandidateStatus.VIDEO_CREATED
    ) {
      throw new BadRequestException('Video z tohoto návrhu již bylo spuštěno.');
    }
    if (!candidate.proposedScriptJson) {
      throw new BadRequestException('Chybí schválený scénář — nejdříve zobrazte náhled scénáře.');
    }

    await this.assertProductionReadyForNewJob();
    await this.assertNoActiveVideoGeneration();

    const profile = await this.registry.getDefaultProfile();
    const cfg = this.settings.getCached();
    const generationMode = resolveVideoGenerationMode(cfg);
    const script = candidate.proposedScriptJson as import('./ai-influencer.types').ReelScriptPayload;
    const targetDurationSec = script.estimatedDuration ?? candidate.estimatedDurationSec ?? cfg.targetDurationSec ?? 35;
    const scriptHash = createHash('sha256')
      .update(JSON.stringify({ candidateId, script }))
      .digest('hex');

    const initialRenderMeta = mergeJobRenderMeta(this.buildInitialJobRenderMeta(), {
      sourceMode: 'MANUAL',
      manualRequested: true,
      manualRequestedAt: new Date().toISOString(),
      bypassQualityGate: true,
      topicCandidateId: candidateId,
      topicCandidateApproved: true,
      heygenCreditsEstimated: estimateHeyGenCredits(targetDurationSec),
      sourceAttribution: candidate.sourceJson,
    });

    const job = await this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.aiInfluencerReelJob.count({ where: videoGenerationLockWhere() });
      if (activeCount > 0) {
        const active = await tx.aiInfluencerReelJob.findFirst({
          where: videoGenerationLockWhere(),
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, createdAt: true, article: { select: { title: true } } },
        });
        if (active) {
          throw new ConflictException(
            buildVideoGenerationConflictBody({
              activeJobId: active.id,
              status: active.status,
              createdAt: active.createdAt,
              articleTitle: active.article?.title ?? candidate.title,
            }),
          );
        }
      }
      const created = await tx.aiInfluencerReelJob.create({
        data: {
          profileId: profile.id,
          status: AiInfluencerReelJobStatus.SCRIPT_READY,
          sourceType: 'TOPIC_CANDIDATE',
          forceOverride: true,
          progressPercent: 25,
          currentStep: 'Storyboard schválen — start výroby',
          estimatedDurationSec: targetDurationSec,
          selectedHook: script.hook,
          scriptJson: script as object,
          spokenText: script.spokenText,
          captionTitle: script.captionTitle ?? candidate.proposedTitle ?? candidate.title,
          captionDescription: script.captionDescription ?? candidate.summary,
          hashtags: Array.isArray(script.hashtags) ? script.hashtags.join(' ') : null,
          scenesJson: script.scenes as object,
          scriptHash,
          avatarCostEstimated: estimateHeyGenCostCzk(targetDurationSec, cfg.avatarCostPerSecCzk),
          renderSettingsJson: initialRenderMeta as object,
          timelineEvents: appendTimelineEvent(null, 'TOPIC_VIDEO_JOB_CREATED') as object,
        },
      });
      await tx.aiInfluencerTopicCandidate.update({
        where: { id: candidateId },
        data: {
          status: AiInfluencerTopicCandidateStatus.VIDEO_QUEUED,
          createdVideoJobId: created.id,
        },
      });
      return created;
    });

    this.scheduleBootstrapCreatedJob(job.id);
    const refreshed = await this.getJob(job.id);
    return {
      jobId: refreshed.id,
      status: refreshed.status,
      progress: refreshed.progressPercent,
      title: candidate.title,
      generationMode,
      estimatedCostCzk: estimateHeyGenCostCzk(targetDurationSec, cfg.avatarCostPerSecCzk),
    };
  }

  /** Posune nově vytvořený job přes několik synchronních fází, dokud nenarazí na čekání/poll. */
  private scheduleBootstrapCreatedJob(jobId: string): void {
    this.worker.wake();
    void this.bootstrapCreatedJob(jobId).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`bootstrapCreatedJob ${jobId} failed: ${message}`);
      try {
        const existing = await this.prisma.aiInfluencerReelJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });
        if (
          !existing ||
          existing.status === AiInfluencerReelJobStatus.FAILED ||
          existing.status === AiInfluencerReelJobStatus.CANCELLED
        ) {
          return;
        }
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: {
            status: AiInfluencerReelJobStatus.FAILED,
            errorCode: 'BOOTSTRAP_FAILED',
            errorMessage: message.slice(0, 500),
            failedStage: 'QUEUE',
            currentStep: 'Bootstrap selhal',
          },
        });
      } catch (updateErr) {
        this.log.error(
          `Failed to mark job ${jobId} FAILED after bootstrap error: ${updateErr instanceof Error ? updateErr.message : updateErr}`,
        );
      }
    });
  }

  /** Znovu nabídne workeru joby ve frontě, které dlouho nepostoupily. */
  async recoverStaleQueuedJobs(limit = 5): Promise<number> {
    const staleBefore = new Date(Date.now() - AI_INFLUENCER_QUEUE_STALE_MS);
    const stalledBefore = new Date(Date.now() - AI_INFLUENCER_QUEUE_STALLED_MS);
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        AND: [
          workerQueueWhere(),
          { updatedAt: { lte: staleBefore } },
          {
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, renderSettingsJson: true, createdAt: true, updatedAt: true },
    });
    let recovered = 0;
    for (const row of rows) {
      const waitMs = Date.now() - row.createdAt.getTime();
      if (waitMs >= AI_INFLUENCER_QUEUE_STALLED_MS) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: row.id },
          data: {
            errorCode: 'STALLED_QUEUE',
            currentStep: 'Fronta zaseknutá – worker znovu spouští job',
            renderSettingsJson: mergeJobRenderMeta(row.renderSettingsJson, {
              queueStalledAt: new Date().toISOString(),
              queueWarning: 'Worker ještě dlouho job nepřevzal – automatická obnova',
              claimedAt: undefined,
            }) as object,
          },
        });
      } else if (waitMs >= 30_000) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: row.id },
          data: {
            renderSettingsJson: mergeJobRenderMeta(row.renderSettingsJson, {
              queueWarning: 'Worker ještě job nepřevzal',
            }) as object,
          },
        });
      }
      this.scheduleBootstrapCreatedJob(row.id);
      recovered += 1;
    }
    return recovered;
  }

  async getTodayJobsDiagnostic() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: { createdAt: { gte: dayStart }, isTest: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        progressPercent: true,
        currentStep: true,
        isTest: true,
        errorCode: true,
        errorMessage: true,
        skipReason: true,
        avatarExternalJobId: true,
        renderSettingsJson: true,
      },
    });
    return rows.map((row) => {
      const meta =
        row.renderSettingsJson && typeof row.renderSettingsJson === 'object'
          ? (row.renderSettingsJson as { generationMode?: string; videoGenerationMode?: string })
          : {};
      const generationMode = meta.generationMode ?? meta.videoGenerationMode ?? null;
      const visibility =
        isActiveGenerationStatus(row.status) || isQueuedGenerationStatus(row.status)
          ? 'ACTIVE_OR_QUEUED'
          : isCompletedGenerationStatus(row.status)
            ? 'COMPLETED'
            : isFailedGenerationStatus(row.status)
              ? row.status.startsWith('SKIPPED')
                ? 'SKIPPED'
                : 'FAILED_OR_CANCELLED'
              : 'UNCLASSIFIED';
      return {
        jobId: row.id,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        status: row.status,
        progress: row.progressPercent,
        currentStage: row.currentStep,
        isTest: row.isTest,
        generationMode,
        providerJobId: row.avatarExternalJobId,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        skipReason: row.skipReason,
        visibility,
        enqueued: row.status === AiInfluencerReelJobStatus.EVALUATING,
        workerClaimed: !isQueuedGenerationStatus(row.status) && isActiveGenerationStatus(row.status),
      };
    });
  }

  private async bootstrapCreatedJob(jobId: string): Promise<void> {
    await this.tryClaimQueuedJob(jobId, 'bootstrap');
    await this.advanceJobChain(jobId, 12);
  }

  /** Atomicky převzme job ve frontě workerem nebo bootstrapem. */
  async tryClaimQueuedJob(jobId: string, workerInstanceId: string): Promise<boolean> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        renderSettingsJson: true,
        updatedAt: true,
      },
    });
    if (!job) return false;
    const meta = readJobRenderMeta(job.renderSettingsJson);
    if (shouldSkipPipelineForCancel(job.status, meta)) return false;
    const isQueued =
      job.status === AiInfluencerReelJobStatus.EVALUATING && job.progressPercent <= 10;
    if (!isQueued) return true;

    const claimMeta = readJobRenderMeta(job.renderSettingsJson);
    if (claimMeta.claimedAt) {
      const claimAge = Date.now() - new Date(claimMeta.claimedAt).getTime();
      if (claimAge < AI_INFLUENCER_CLAIM_STALE_MS) return true;
    }

    const updated = await this.prisma.aiInfluencerReelJob.updateMany({
      where: {
        id: jobId,
        status: AiInfluencerReelJobStatus.EVALUATING,
        progressPercent: { lte: 10 },
      },
      data: {
        progressPercent: 8,
        currentStep: 'Worker zpracovává',
        lastAttemptAt: new Date(),
      },
    });
    if (updated.count === 0) return false;

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          claimedAt: new Date().toISOString(),
          workerInstanceId,
          productionStartedAt: claimMeta.productionStartedAt ?? new Date().toISOString(),
          queueWarning: undefined,
          queueStalledAt: undefined,
        }) as object,
      },
    });
    return true;
  }

  async runJobNow(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (
      job.status === AiInfluencerReelJobStatus.PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED
    ) {
      throw new BadRequestException('Dokončený job nelze znovu spustit.');
    }
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.EVALUATING,
        progressPercent: 3,
        currentStep: 'Čeká ve frontě',
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        failedStage: null,
        skipReason: null,
        forceOverride: true,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          ...buildSourceModeMeta('MANUAL', { manualRequestedAt: new Date().toISOString() }),
          claimedAt: undefined,
          queueStalledAt: undefined,
          queueWarning: undefined,
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'MANUAL_RUN_NOW'),
      },
    });
    this.scheduleBootstrapCreatedJob(jobId);
    return this.getJob(jobId);
  }

  /** Worker i bootstrap — několik fází za tick, dokud pipeline nečeká na provider nebo selže. */
  async advanceJobChain(jobId: string, maxSteps = 3): Promise<void> {
    for (let step = 0; step < maxSteps; step += 1) {
      const before = await this.prisma.aiInfluencerReelJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!before || this.shouldPausePipelineAdvance(await this.getJob(jobId))) {
        return;
      }
      try {
        await this.advanceJob(jobId);
      } catch (err) {
        this.log.error(
          `advanceJobChain ${jobId} step ${step + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      const after = await this.prisma.aiInfluencerReelJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!after || after.status === before.status || this.shouldPausePipelineAdvance(await this.getJob(jobId))) {
        return;
      }
    }
  }

  private shouldPausePipelineAdvance(
    job: Pick<
      AiInfluencerJobWithRelations,
      'status' | 'nextRetryAt' | 'renderSettingsJson' | 'isTest'
    >,
  ): boolean {
    if (job.nextRetryAt && job.nextRetryAt.getTime() > Date.now()) {
      return true;
    }
    if (
      job.status === AiInfluencerReelJobStatus.PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.CANCELLED ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_QUALITY ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_DUPLICATE ||
      job.status === AiInfluencerReelJobStatus.FAILED
    ) {
      return true;
    }
    if (job.status === AiInfluencerReelJobStatus.SCRIPT_READY) {
      const meta = readJobRenderMeta(job.renderSettingsJson);
      const cfg = this.settings.getCached();
      const autoAdvance =
        cfg.approvalMode !== 'MANUAL' ||
        job.isTest ||
        meta.isProductionTest === true ||
        meta.topicCandidateApproved === true;
      return !autoAdvance;
    }
    return false;
  }


  async createJobFromProperty(
    propertyId: string,
    options?: {
      force?: boolean;
      publishFacebook?: boolean;
      publishInstagram?: boolean;
      publishYoutube?: boolean;
      publishPortal?: boolean;
    },
  ): Promise<AiInfluencerJobWithRelations> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !property.isActive) {
      throw new BadRequestException('Inzerát není aktivní nebo neexistuje.');
    }

    const existing = await this.prisma.aiInfluencerReelJob.findFirst({
      where: {
        propertyId,
        status: {
          in: [
            AiInfluencerReelJobStatus.READY,
            AiInfluencerReelJobStatus.PUBLISHED,
            AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
            AiInfluencerReelJobStatus.PUBLISHING,
            AiInfluencerReelJobStatus.RENDERING,
            AiInfluencerReelJobStatus.VOICE_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.SCRIPT_GENERATING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && !options?.force) {
      return this.getJob(existing.id);
    }

    const profile = await this.registry.getDefaultProfile();
    await this.assertProductionReadyForNewJob();
    const cfg = this.settings.getCached();
    await this.assertNoActiveVideoGeneration();
    const targetDurationSec = cfg.targetDurationSec ?? 40;
    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        propertyId,
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.SCRIPT_GENERATING,
        sourceType: 'REAL_ESTATE_LISTING',
        forceOverride: options?.force === true,
        progressPercent: 25,
        currentStep: 'Scénář',
        estimatedDurationSec: targetDurationSec,
        avatarCostEstimated: estimateHeyGenCostCzk(targetDurationSec, cfg.avatarCostPerSecCzk),
        renderSettingsJson: this.buildInitialJobRenderMeta({
          heygenCreditsEstimated: estimateHeyGenCredits(targetDurationSec),
          propertyPublish: {
            facebook: options?.publishFacebook,
            instagram: options?.publishInstagram,
            youtube: options?.publishYoutube,
            portal: options?.publishPortal,
          },
        }) as object,
      },
    });
    this.scheduleBootstrapCreatedJob(job.id);
    return this.getJob(job.id);
  }

  async approveScript(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (job.status !== AiInfluencerReelJobStatus.SCRIPT_READY) {
      throw new BadRequestException('Job není ve stavu SCRIPT_READY.');
    }
    await this.assertProductionReadyForNewJob();
    const cfg = this.settings.getCached();
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const mode = inferJobGenerationMode(meta, cfg, {
      voiceStorageUrl: job.voiceStorageUrl,
      avatarExternalJobId: job.avatarExternalJobId,
      baseMasterUrl: job.baseMasterUrl,
    });
    const voiceEngine = resolveVoiceEngine(meta, cfg);
    const skipVoice = shouldSkipVoicePhaseForVideoAgent(
      { ...meta, generationModeUsed: mode, voiceEngine },
      cfg,
    );
    const nextStatus = skipVoice
      ? AiInfluencerReelJobStatus.SCRIPT_READY
      : AiInfluencerReelJobStatus.VOICE_GENERATING;
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          videoGenerationMode: mode,
          generationModeUsed: mode,
          voiceEngine: skipVoice ? 'HEYGEN' : 'ELEVENLABS',
          providerJobType: mode === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'AVATAR',
        }) as object,
      },
    });
    await this.advanceJobChain(jobId, 6);
    return this.getJob(jobId);
  }

  async forceStartJob(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (job.status !== AiInfluencerReelJobStatus.SKIPPED_QUALITY) {
      throw new BadRequestException('Force start je dostupný pouze pro SKIPPED_QUALITY.');
    }
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.CANDIDATE,
        forceOverride: true,
        skipReason: null,
        errorMessage: null,
        failedStage: null,
        progressPercent: 15,
        currentStep: 'Kandidát vybrán (ruční override)',
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          ...buildSourceModeMeta('MANUAL'),
          evaluationScoreWarning: job.skipReason ?? undefined,
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'MANUAL_OVERRIDE'),
      },
    });
    this.scheduleBootstrapCreatedJob(jobId);
    return this.getJob(jobId);
  }

  async skipJob(jobId: string, reason?: string): Promise<AiInfluencerJobWithRelations> {
    const result = await this.forceCancelJob(jobId, reason ?? 'Přeskočeno administrátorem');
    if ('cleanedOrphan' in result && result.cleanedOrphan) {
      throw new NotFoundException(result.message);
    }
    return result as AiInfluencerJobWithRelations;
  }

  async cancelJob(
    jobId: string,
    reason?: string,
    cancelledBy = 'admin',
  ): Promise<AiInfluencerJobWithRelations> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: {
        article: true,
        property: true,
        profile: true,
        candidate: true,
      },
    });
    if (!job) {
      throw new NotFoundException('AI Influencer job nenalezen.');
    }
    if (!isAdminCancellableStatus(job.status)) {
      throw new BadRequestException(
        `Job nelze zrušit — stav ${job.status} je finální. Použijte vynucené ukončení.`,
      );
    }
    return this.applyJobCancel(job, reason ?? 'Zrušeno administrátorem', cancelledBy, false);
  }

  async forceCancelJob(
    jobId: string,
    reason?: string,
    cancelledBy = 'admin',
  ): Promise<
    | (AiInfluencerJobWithRelations & { cleanedOrphan?: false })
    | { success: true; cleanedOrphan: true; jobId: string; message: string }
  > {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      include: {
        article: true,
        property: true,
        profile: true,
        candidate: true,
      },
    });
    if (!job) {
      return {
        success: true,
        cleanedOrphan: true,
        jobId,
        message: 'Ghost/orphan záznam vyčištěn — job v DB neexistuje.',
      };
    }
    if (job.status === AiInfluencerReelJobStatus.CANCELLED) {
      const cfg = this.settings.getCached();
      const enriched = this.enrichJobRow(job, cfg, getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED');
      return {
        ...enriched,
        gallery: buildGalleryVideoMeta(job),
        isTest: job.isTest,
        cleanedOrphan: false,
      } as AiInfluencerJobWithRelations & { cleanedOrphan: false };
    }
    if (!isForceCancellableStatus(job.status)) {
      throw new BadRequestException(`Job ${jobId} nelze vynutit — stav ${job.status}.`);
    }
    return this.applyJobCancel(job, reason ?? 'Vynuceně ukončeno administrátorem', cancelledBy, true);
  }

  private async applyJobCancel(
    job: AiInfluencerJobWithRelations,
    cancelReason: string,
    cancelledBy: string,
    force: boolean,
  ): Promise<AiInfluencerJobWithRelations & { cleanedOrphan?: false }> {
    const jobId = job.id;
    const meta = readJobRenderMeta(job.renderSettingsJson);
    if (!force && shouldSkipPipelineForCancel(job.status, meta) && job.status === AiInfluencerReelJobStatus.CANCELLED) {
      return job as AiInfluencerJobWithRelations & { cleanedOrphan?: false };
    }

    const now = new Date().toISOString();
    const providerSubmitted = isProviderSubmittedForCancel(meta, job.avatarExternalJobId);
    const cancelPhase: AiInfluencerCancelPhase = providerSubmitted
      ? 'CANCELLED_PROVIDER_CONTINUES'
      : 'CANCELLED';

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.CANCELLED,
        skipReason: cancelReason,
        progressPercent: 100,
        currentStep:
          cancelPhase === 'CANCELLED_PROVIDER_CONTINUES'
            ? 'Zrušeno (HeyGen může pokračovat)'
            : 'Zrušeno',
        nextRetryAt: null,
        failedStage: null,
        errorCode: force ? 'FORCE_CANCELLED' : job.errorCode,
        errorMessage: null,
        facebookPublishStatus:
          job.facebookPublishStatus === ReelPlatformPublishStatus.PUBLISHED
            ? job.facebookPublishStatus
            : ReelPlatformPublishStatus.SKIPPED,
        instagramPublishStatus:
          job.instagramPublishStatus === ReelPlatformPublishStatus.PUBLISHED
            ? job.instagramPublishStatus
            : ReelPlatformPublishStatus.SKIPPED,
        youtubePublishStatus:
          job.youtubePublishStatus === ReelPlatformPublishStatus.PUBLISHED
            ? job.youtubePublishStatus
            : ReelPlatformPublishStatus.SKIPPED,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          cancelPhase,
          cancelRequestedAt: now,
          cancelledAt: now,
          cancelledBy,
          cancelReason,
          autoPublish: false,
          providerWasSubmitted: providerSubmitted,
          creditLikelyConsumed: providerSubmitted,
          videoAgentSubmitInFlight: false,
          claimedAt: undefined,
          workerInstanceId: undefined,
          queueWarning: undefined,
          queueStalledAt: undefined,
        }) as object,
        timelineEvents: appendTimelineEvent(
          appendTimelineEvent(job.timelineEvents, force ? 'FORCE_CANCEL_REQUESTED' : 'CANCEL_REQUESTED'),
          cancelPhase === 'CANCELLED_PROVIDER_CONTINUES' ? 'CANCELLED_PROVIDER_CONTINUES' : 'CANCELLED',
          cancelReason,
        ),
      },
    });

    this.worker.wake();
    return this.getJob(jobId);
  }

  async repairAiInfluencerJobs(options?: { limit?: number }): Promise<AiInfluencerRepairReport> {
    const limit = Math.max(1, Math.min(options?.limit ?? 40, 100));
    const report: AiInfluencerRepairReport = {
      ok: true,
      scanned: 0,
      recovered: 0,
      cancelled: 0,
      completed: 0,
      orphaned: 0,
      duplicates: 0,
      stale: 0,
      newHeyGenCreateCalls: 0,
      details: [],
    };

    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: activeJobWhere(),
      orderBy: { createdAt: 'asc' },
      take: limit * 2,
      include: {
        article: { select: { id: true, title: true } },
        property: { select: { id: true, title: true } },
      },
    });
    report.scanned = rows.length;

    const byArticle = new Map<string, typeof rows>();
    for (const row of rows) {
      const sourceKey = row.articleId ?? row.propertyId ?? row.id;
      const bucket = byArticle.get(sourceKey) ?? [];
      bucket.push(row);
      byArticle.set(sourceKey, bucket);
    }

    for (const [, group] of byArticle) {
      if (group.length <= 1) continue;
      const [keep, ...dupes] = group.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      for (const dupe of dupes) {
        await this.applyJobCancel(
          dupe as AiInfluencerJobWithRelations,
          'Duplicitní aktivní job — ponechán nejstarší',
          'repair',
          true,
        );
        report.duplicates += 1;
        report.cancelled += 1;
        report.details.push({
          jobId: dupe.id,
          outcome: 'CANCELLED_DUPLICATE',
          message: `Ponechán ${keep.id}`,
        });
      }
    }

    const refreshed = await this.prisma.aiInfluencerReelJob.findMany({
      where: activeJobWhere(),
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const row of refreshed) {
      const meta = readJobRenderMeta(row.renderSettingsJson);
      if (shouldSkipPipelineForCancel(row.status, meta)) {
        continue;
      }

      const stale = assessStaleActiveJob(row, meta);
      if (stale.stale) {
        report.stale += 1;
      }

      const sessionId = extractSessionIdForRecovery(meta, row.avatarExternalJobId);

      if (stale.reason === 'STORAGE_STALE' && (meta.providerOutputUrl || sessionId)) {
        try {
          await this.retryStorageJob(row.id);
          report.recovered += 1;
          report.details.push({ jobId: row.id, outcome: 'STORAGE_RECOVERED', message: stale.message ?? undefined });
          continue;
        } catch (err) {
          report.details.push({
            jobId: row.id,
            outcome: 'STORAGE_RECOVERY_FAILED',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (sessionId && (stale.reason === 'PROVIDER_POLL_STALE' || stale.reason === 'PROVIDER_MAX_AGE')) {
        try {
          const poll = await this.videoAgent.pollSession(sessionId);
          if (poll.status === 'QUEUED' || poll.status === 'PROCESSING' || poll.status === 'GENERATING') {
            await this.runVideoAgentPoll(row.id);
            report.details.push({ jobId: row.id, outcome: 'PROVIDER_STILL_PROCESSING' });
            continue;
          }
          if (poll.videoUrl) {
            await this.runVideoAgentPoll(row.id);
            report.recovered += 1;
            report.completed += 1;
            report.details.push({ jobId: row.id, outcome: 'PROVIDER_RECOVERED' });
            continue;
          }
          if (poll.status === 'FAILED') {
            await this.prisma.aiInfluencerReelJob.update({
              where: { id: row.id },
              data: {
                status: AiInfluencerReelJobStatus.FAILED,
                errorCode: poll.errorCode ?? 'HEYGEN_FAILED',
                errorMessage: poll.errorMessage ?? 'HeyGen selhal',
                progressPercent: 100,
                currentStep: 'Generování selhalo',
              },
            });
            report.details.push({ jobId: row.id, outcome: 'PROVIDER_FAILED' });
            continue;
          }
        } catch {
          report.details.push({ jobId: row.id, outcome: 'PROVIDER_NOT_FOUND' });
          report.orphaned += 1;
          await this.applyJobCancel(
            row as AiInfluencerJobWithRelations,
            'ORPHANED — provider job nenalezen',
            'repair',
            true,
          );
          report.cancelled += 1;
          continue;
        }
      }

      if (
        stale.stale &&
        (stale.reason === 'ORPHAN_NO_PROVIDER' ||
          stale.reason === 'SCRIPT_STALE' ||
          stale.reason === 'STORAGE_STALE')
      ) {
        await this.applyJobCancel(
          row as AiInfluencerJobWithRelations,
          stale.message ?? 'STALE — automatická oprava',
          'repair',
          true,
        );
        report.cancelled += 1;
        if (stale.reason === 'ORPHAN_NO_PROVIDER') report.orphaned += 1;
        report.details.push({
          jobId: row.id,
          outcome: stale.reason === 'ORPHAN_NO_PROVIDER' ? 'ORPHANED' : 'STALE_CANCELLED',
          message: stale.message ?? undefined,
        });
      }
    }

    return report;
  }

  async retryStorageJob(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const providerUrl = meta.providerOutputUrl?.trim();
    const sessionId = extractSessionIdForRecovery(meta, job.avatarExternalJobId);

    if (hasMasterVideoAsset(job)) {
      return job;
    }

    if (!providerUrl && !sessionId) {
      throw new BadRequestException('Chybí URL výsledku z HeyGen — nelze znovu uložit bez nové generace.');
    }

    let downloadUrl = providerUrl ?? null;
    if (!downloadUrl && sessionId) {
      const poll = await this.videoAgent.pollSession(sessionId);
      if (!poll.videoUrl) {
        throw new BadRequestException('HeyGen ještě nevrátil video URL.');
      }
      downloadUrl = poll.videoUrl;
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        errorCode: null,
        errorMessage: null,
        failedStage: null,
        nextRetryAt: null,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          providerOutputUrl: downloadUrl ?? undefined,
          pipelineStage: 'STORING_RETRY',
        }) as object,
      },
    });

    await this.ingestHeyGenProviderVideo(jobId, sessionId ?? 'retry', {
      status: 'READY',
      sessionStatus: meta.providerStatus ?? 'completed',
      videoUrl: downloadUrl!,
      videoId: meta.heygenVideoAgentVideoId ?? undefined,
    });

    return this.getJob(jobId);
  }

  async deleteJob(jobId: string, options?: { historyOnly?: boolean }) {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('AI Influencer job nenalezen.');

    const processing = ACTIVE_JOB_STATUSES;
    if (processing.includes(job.status)) {
      throw new BadRequestException('Nejdříve zrušte aktivní job.');
    }

    if (
      (job.status === AiInfluencerReelJobStatus.PUBLISHED ||
        job.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED) &&
      !options?.historyOnly
    ) {
      throw new BadRequestException(
        'Publikované video lze odstranit pouze z admin historie (historyOnly).',
      );
    }

    await this.prisma.aiInfluencerReelJob.delete({ where: { id: jobId } });
    return { ok: true, deletedId: jobId };
  }

  async deleteFailedJobs() {
    const result = await this.prisma.aiInfluencerReelJob.deleteMany({
      where: { status: AiInfluencerReelJobStatus.FAILED },
    });
    return { ok: true, deleted: result.count };
  }

  async listVideos(limit = 60, options?: { includeTest?: boolean }) {
    const cfg = this.settings.getCached();
    const workerElevenConfigured = getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED';
    const includeTest = options?.includeTest ?? false;
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: galleryVideoWhere({ includeTest }),
      orderBy: [{ renderedAt: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        article: { select: { id: true, title: true, category: true } },
        property: { select: { id: true, title: true } },
        candidate: { select: { reelPotentialScore: true } },
      },
    });
    return this.mapGalleryJobRows(rows, cfg, workerElevenConfigured);
  }

  async listRecentCompleted(limit = 10) {
    const cfg = this.settings.getCached();
    const workerElevenConfigured = getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED';
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: recentCompletedVideoWhere(),
      orderBy: [{ renderedAt: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        article: { select: { id: true, title: true, category: true } },
        property: { select: { id: true, title: true } },
        candidate: { select: { reelPotentialScore: true } },
      },
    });
    return this.mapGalleryJobRows(rows, cfg, workerElevenConfigured);
  }

  private mapGalleryJobRows(
    rows: Array<
      Prisma.AiInfluencerReelJobGetPayload<{
        include: {
          article: { select: { id: true; title: true; category: true } };
          property: { select: { id: true; title: true } };
          candidate: { select: { reelPotentialScore: true } };
        };
      }>
    >,
    cfg: ReturnType<AiInfluencerSettingsService['getCached']>,
    workerElevenConfigured: boolean,
  ) {
    return rows.map((j) => {
      const enriched = this.enrichJobRow(
        {
          ...j,
          article: j.article
            ? { ...j.article, title: decodeHtmlEntities(j.article.title) }
            : null,
          property: j.property
            ? { ...j.property, title: decodeHtmlEntities(j.property.title) }
            : null,
        },
        cfg,
        workerElevenConfigured,
      );
      return {
        ...enriched,
        gallery: buildGalleryVideoMeta(j),
        isTest: j.isTest,
      };
    });
  }

  async createProductionTestJob(options?: {
    articleId?: string;
    mode?: 'full' | 'video_agent';
  }) {
    if (options?.mode === 'video_agent') {
      return this.createVideoAgentPipelineTestJob();
    }

    await this.assertProductionReadyForNewJob({ requireScriptProvider: true });
    await this.assertNoActiveVideoGeneration();
    const profile = await this.registry.getDefaultProfile();
    const cfg = this.settings.getCached();
    const generationMode = resolveVideoGenerationMode(cfg);

    let articleId = options?.articleId?.trim();
    if (!articleId) {
      const latest = await this.prisma.newsArticle.findFirst({
        where: { status: NewsArticleStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        select: { id: true },
      });
      if (!latest) {
        throw new BadRequestException('Není k dispozici testovací článek.');
      }
      articleId = latest.id;
    }

    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || article.status !== NewsArticleStatus.PUBLISHED) {
      throw new BadRequestException('Článek není publikovaný.');
    }

    const initialRenderMeta = mergeJobRenderMeta(this.buildInitialJobRenderMeta(), {
      isProductionTest: true,
      testKind: 'FULL',
      testDurationSec: 12,
      videoGenerationMode: generationMode,
      generationModeUsed: generationMode,
      voiceEngine: generationMode === 'VIDEO_AGENT' ? 'HEYGEN' : 'ELEVENLABS',
      providerJobType: generationMode === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'AVATAR',
      allowAvatarFallback: false,
    });

    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        articleId,
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.EVALUATING,
        sourceType: 'ARTICLE',
        isTest: true,
        forceOverride: true,
        estimatedDurationSec: 12,
        progressPercent: 5,
        currentStep: 'Zakládám test job',
        facebookPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        instagramPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        youtubePublishStatus: ReelPlatformPublishStatus.SKIPPED,
        renderSettingsJson: initialRenderMeta as object,
        timelineEvents: appendTimelineEvent(null, 'TEST_JOB_CREATED') as object,
      },
    });

    this.scheduleBootstrapCreatedJob(job.id);
    const refreshed = await this.getJob(job.id);
    return {
      jobId: refreshed.id,
      status: refreshed.status,
      progressPercent: refreshed.progressPercent,
      progressLabel: refreshed.currentStep ?? 'Zakládám job',
      generationMode,
      articleTitle: decodeHtmlEntities(article.title),
      testKind: 'FULL' as const,
    };
  }

  /** Core pipeline test s fixním scénářem — bez OpenAI, stejná orchestrace jako produkce. */
  async createVideoAgentPipelineTestJob() {
    await this.assertProductionReadyForNewJob({ requireScriptProvider: false });
    await this.assertNoActiveVideoGeneration();
    const profile = await this.registry.getDefaultProfile();
    const cfg = this.settings.getCached();
    const generationMode = resolveVideoGenerationMode(cfg);
    if (generationMode !== 'VIDEO_AGENT') {
      throw new BadRequestException({
        message: 'Test Video Agentu vyžaduje režim VIDEO_AGENT v nastavení.',
        code: 'VIDEO_AGENT_MODE_REQUIRED',
      });
    }

    const fixedScript = buildFixedVideoAgentTestScript();
    const scriptHash = hashFixedTestScript(fixedScript);
    const initialRenderMeta = mergeJobRenderMeta(this.buildInitialJobRenderMeta(), {
      isProductionTest: true,
      testKind: 'VIDEO_AGENT',
      useFixedTestScript: true,
      testDurationSec: 10,
      videoGenerationMode: 'VIDEO_AGENT',
      generationModeUsed: 'VIDEO_AGENT',
      allowAvatarFallback: false,
    });

    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.SCRIPT_READY,
        sourceType: 'ARTICLE',
        isTest: true,
        forceOverride: true,
        estimatedDurationSec: fixedScript.estimatedDuration,
        progressPercent: 25,
        currentStep: 'Fixní test scénář připraven',
        scriptJson: fixedScript as object,
        scenesJson: fixedScript.scenes as object,
        spokenText: fixedScript.spokenText,
        spokenTextTts: fixedScript.spokenText,
        captionTitle: fixedScript.captionTitle,
        captionDescription: fixedScript.captionDescription,
        hashtags: fixedScript.hashtags.join(' '),
        scriptHash,
        facebookPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        instagramPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        youtubePublishStatus: ReelPlatformPublishStatus.SKIPPED,
        renderSettingsJson: initialRenderMeta as object,
        timelineEvents: appendTimelineEvent(null, 'TEST_JOB_CREATED', 'VIDEO_AGENT_FIXED_SCRIPT') as object,
      },
    });

    this.scheduleBootstrapCreatedJob(job.id);
    const refreshed = await this.getJob(job.id);
    return {
      jobId: refreshed.id,
      status: refreshed.status,
      progressPercent: refreshed.progressPercent,
      progressLabel: refreshed.currentStep ?? 'Fixní test scénář',
      generationMode,
      articleTitle: 'Video Agent test',
      testKind: 'VIDEO_AGENT' as const,
    };
  }

  async getLastProductionTestVerification(): Promise<{
    status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
    jobId: string | null;
    verifiedAt: string | null;
    testKind: 'FULL' | 'VIDEO_AGENT' | null;
  }> {
    const lastPass = await this.prisma.aiInfluencerReelJob.findFirst({
      where: {
        isTest: true,
        OR: [
          { finalMasterUrl: { not: null } },
          { baseMasterUrl: { not: null } },
          { videoUrl: { not: null } },
        ],
        status: {
          in: [
            AiInfluencerReelJobStatus.READY,
            AiInfluencerReelJobStatus.PUBLISHED,
            AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, updatedAt: true, renderSettingsJson: true },
    });
    if (lastPass) {
      const meta = readJobRenderMeta(lastPass.renderSettingsJson);
      return {
        status: 'VERIFIED',
        jobId: lastPass.id,
        verifiedAt: lastPass.updatedAt.toISOString(),
        testKind: meta.testKind === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'FULL',
      };
    }

    const lastFail = await this.prisma.aiInfluencerReelJob.findFirst({
      where: { isTest: true, status: AiInfluencerReelJobStatus.FAILED },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (lastFail) {
      return { status: 'FAILED', jobId: lastFail.id, verifiedAt: null, testKind: null };
    }

    return { status: 'UNVERIFIED', jobId: null, verifiedAt: null, testKind: null };
  }

  async getActiveProductionTestJob() {
    const running = await this.prisma.aiInfluencerReelJob.findFirst({
      where: {
        isTest: true,
        status: {
          in: [
            AiInfluencerReelJobStatus.EVALUATING,
            AiInfluencerReelJobStatus.CANDIDATE,
            AiInfluencerReelJobStatus.SCRIPT_GENERATING,
            AiInfluencerReelJobStatus.SCRIPT_READY,
            AiInfluencerReelJobStatus.VOICE_GENERATING,
            AiInfluencerReelJobStatus.VOICE_READY,
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_READY,
            AiInfluencerReelJobStatus.RENDERING,
            AiInfluencerReelJobStatus.PUBLISHING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (running) return buildProductionTestStatus(running);

    const latest = await this.prisma.aiInfluencerReelJob.findFirst({
      where: { isTest: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return null;
    return buildProductionTestStatus(latest);
  }

  async getProductionTestStatus(jobId: string) {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({ where: { id: jobId } });
    if (!job?.isTest) {
      throw new NotFoundException('Test job nenalezen.');
    }
    return buildProductionTestStatus(job);
  }

  async deleteProductionTestJob(jobId: string) {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({ where: { id: jobId } });
    if (!job?.isTest) {
      throw new NotFoundException('Test job nenalezen.');
    }
    await this.prisma.aiInfluencerReelJob.delete({ where: { id: jobId } });
    return { ok: true, deletedId: jobId };
  }

  async getHeyGenJobDiagnostics(jobId: string) {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        failedStage: true,
        errorCode: true,
        errorMessage: true,
        avatarExternalJobId: true,
        avatarStorageUrl: true,
        baseMasterUrl: true,
        videoUrl: true,
        finalMasterUrl: true,
        renderSettingsJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Job nenalezen.');

    const meta = readJobRenderMeta(job.renderSettingsJson);
    const providerJobId =
      meta.heygenVideoAgentSessionId ?? parseVideoAgentSessionId(job.avatarExternalJobId);
    const masterVideoUrl = resolveMasterVideoUrl(job);

    let providerStatus: string | null = null;
    let providerOutputUrl: string | null = meta.providerOutputUrl ?? null;
    if (providerJobId) {
      try {
        const poll = await this.videoAgent.pollSession(providerJobId);
        providerStatus = poll.sessionStatus ?? poll.status;
        providerOutputUrl = poll.videoUrl ?? providerOutputUrl;
      } catch {
        providerStatus = 'POLL_ERROR';
      }
    }

    return {
      jobId: job.id,
      status: job.status,
      stage: job.failedStage,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      providerJobId: providerJobId ? maskProviderJobId(providerJobId) : null,
      providerJobIdSaved: Boolean(providerJobId),
      providerStatus,
      providerOutputUrlPresent: Boolean(providerOutputUrl),
      masterVideoUrlPresent: Boolean(masterVideoUrl),
      heygenMedia: meta.heygenMediaPrepStats
        ? {
            mediaSelected: meta.heygenMediaPrepStats.selected,
            publicAlready: meta.heygenMediaPrepStats.publicAlready,
            rehosted: meta.heygenMediaPrepStats.rehosted,
            invalid: meta.heygenMediaPrepStats.invalid,
            skipped: meta.heygenMediaPrepStats.skipped,
            filesPayloadCount: meta.heygenPreparedMedia?.length ?? 0,
            issues: meta.heygenMediaIssues ?? [],
          }
        : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async reconcileHeyGenJob(jobId: string) {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const sessionId =
      meta.heygenVideoAgentSessionId ?? parseVideoAgentSessionId(job.avatarExternalJobId);

    if (hasMasterVideoAsset(job)) {
      if (
        job.status === AiInfluencerReelJobStatus.FAILED ||
        job.status === AiInfluencerReelJobStatus.AVATAR_READY ||
        job.status === AiInfluencerReelJobStatus.RENDERING
      ) {
        await this.archiveVideoFromBaseMaster(job);
      }
      return {
        ok: true,
        outcome: 'ALREADY_ARCHIVED' as const,
        providerJobId: sessionId ? maskProviderJobId(sessionId) : null,
        masterVideoUrl: resolveMasterVideoUrl(job),
        message: 'Video je již uložené v XXREALIT.',
      };
    }

    if (!sessionId) {
      return {
        ok: false,
        outcome: 'NO_PROVIDER_JOB' as const,
        providerJobId: null,
        message: 'Job nemá uložené HeyGen session ID.',
      };
    }

    const poll = await this.videoAgent.pollSession(sessionId);
    if (poll.status === 'QUEUED' || poll.status === 'PROCESSING' || poll.status === 'GENERATING') {
      if (job.status === AiInfluencerReelJobStatus.FAILED) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: {
            status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
            failedStage: null,
            errorCode: null,
            errorMessage: null,
            nextRetryAt: null,
            timelineEvents: appendTimelineEvent(job.timelineEvents, 'HEYGEN_RECONCILE_RESUME'),
          },
        });
      }
      return {
        ok: true,
        outcome: 'PROVIDER_RUNNING' as const,
        providerJobId: maskProviderJobId(sessionId),
        providerStatus: poll.sessionStatus ?? poll.status,
        message: 'HeyGen job stále běží — polling pokračuje.',
      };
    }

    if (poll.status === 'FAILED') {
      return {
        ok: false,
        outcome: 'PROVIDER_FAILED' as const,
        providerJobId: maskProviderJobId(sessionId),
        providerStatus: poll.sessionStatus ?? poll.status,
        message: poll.errorMessage ?? 'HeyGen job selhal.',
        errorCode: poll.errorCode ?? 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
      };
    }

    if (!poll.videoUrl) {
      return {
        ok: false,
        outcome: 'PROVIDER_RUNNING' as const,
        providerJobId: maskProviderJobId(sessionId),
        providerStatus: poll.sessionStatus ?? poll.status,
        message: 'HeyGen je hotový/neznámý stav, ale video URL zatím není k dispozici.',
      };
    }

    await this.ingestHeyGenProviderVideo(jobId, sessionId, poll);
    const updated = await this.getJob(jobId);
    return {
      ok: true,
      outcome: 'RECOVERED' as const,
      providerJobId: maskProviderJobId(sessionId),
      providerStatus: poll.sessionStatus ?? poll.status,
      masterVideoUrl: resolveMasterVideoUrl(updated),
      message: 'Video bylo staženo z HeyGen a uloženo do XXREALIT.',
    };
  }

  async reconcilePendingHeyGenJobs(limit = 5): Promise<{ scanned: number; recovered: number }> {
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        status: {
          in: [
            AiInfluencerReelJobStatus.FAILED,
            AiInfluencerReelJobStatus.VOICE_READY,
            AiInfluencerReelJobStatus.SCRIPT_READY,
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_READY,
            AiInfluencerReelJobStatus.RENDERING,
          ],
        },
        OR: [
          { avatarExternalJobId: { startsWith: VIDEO_AGENT_EXTERNAL_PREFIX } },
          { progressPercent: { gte: 40, lte: 55 } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(limit, 5) * 6,
      select: {
        id: true,
        finalMasterUrl: true,
        baseMasterUrl: true,
        videoUrl: true,
        avatarStorageUrl: true,
        avatarExternalJobId: true,
        renderSettingsJson: true,
        progressPercent: true,
        status: true,
      },
    });

    const candidates = rows
      .filter((row) => {
        if (hasMasterVideoAsset(row)) return false;
        const meta = readJobRenderMeta(row.renderSettingsJson);
        return (
          hasPersistedVideoAgentProviderId(meta, row.avatarExternalJobId) ||
          isVideoAgentSubmitUnknown(meta) ||
          (meta.videoAgentSubmitInFlight === true && row.progressPercent >= 40)
        );
      })
      .slice(0, limit);

    let recovered = 0;
    for (const row of candidates) {
      try {
        const meta = readJobRenderMeta(row.renderSettingsJson);
        if (
          !hasPersistedVideoAgentProviderId(meta, row.avatarExternalJobId) &&
          isVideoAgentSubmitStale(meta, AI_INFLUENCER_VIDEO_AGENT_SUBMIT_STALE_MS)
        ) {
          await this.markVideoAgentProviderReferenceLost(row.id, meta);
          continue;
        }
        const result = await this.reconcileHeyGenJob(row.id);
        if (result.outcome === 'RECOVERED' || result.outcome === 'ALREADY_ARCHIVED') {
          recovered += 1;
        } else if (result.outcome === 'PROVIDER_RUNNING') {
          await this.runVideoAgentPoll(row.id);
          recovered += 1;
        }
      } catch (err) {
        this.log.warn(
          `HeyGen reconcile ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { scanned: candidates.length, recovered };
  }

  async retryJob(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (job.status === AiInfluencerReelJobStatus.SKIPPED_QUALITY) {
      return this.forceStartJob(jobId);
    }
    const jobMeta = readJobRenderMeta(job.renderSettingsJson);
    const resumeStatus = resumeJobStatus(
      job.status,
      job.failedStage,
      {
        spokenText: job.spokenText,
        voiceStorageUrl: job.voiceStorageUrl,
        avatarStorageUrl: job.avatarStorageUrl,
        avatarExternalJobId: job.avatarExternalJobId,
        providerJobId: resolveJobProviderJobId(jobMeta, job.avatarExternalJobId),
        baseMasterUrl: job.baseMasterUrl,
        generationMode: getJobSnapshotGenerationMode(jobMeta, this.settings.getCached()),
      },
      job.errorMessage,
      job.errorCode,
    );
    const progress = progressForStatus(resumeStatus);
    const clearVideoAgentSession =
      job.errorCode === 'HEYGEN_VIDEO_AGENT_BAD_REQUEST' ||
      /invalid url in files\[/i.test(job.errorMessage ?? '');
    const retryMeta = mergeJobRenderMeta(job.renderSettingsJson, {
      ...buildSourceModeMeta('RETRY'),
      ...(clearVideoAgentSession
        ? {
            heygenVideoAgentSessionId: undefined,
            heygenVideoAgentVideoId: undefined,
            providerJobId: undefined,
            videoAgentSubmitInFlight: false,
            videoAgentSubmittedAt: undefined,
          }
        : {}),
    });
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: resumeStatus,
        errorCode: null,
        errorMessage: null,
        failedStage: null,
        nextRetryAt: null,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        forceOverride: true,
        progressPercent: progress.percent,
        currentStep: progress.step,
        renderSettingsJson: retryMeta as object,
        ...(clearVideoAgentSession ? { avatarExternalJobId: null } : {}),
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'RETRY', resumeStatus),
      },
    });
    this.scheduleBootstrapCreatedJob(jobId);
    return this.getJob(jobId);
  }

  /**
   * Posune job o jednu fázi. Každé volání provede maximálně jednu pipeline operaci.
   * Další fáze běží přes opakované volání (worker tick / explicitní retry).
   */
  async advanceJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    if (
      job.status === AiInfluencerReelJobStatus.PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.CANCELLED ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_QUALITY ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_DUPLICATE ||
      shouldSkipPipelineForCancel(job.status, meta)
    ) {
      return;
    }
    if (job.nextRetryAt && job.nextRetryAt.getTime() > Date.now()) {
      return;
    }

    try {
      switch (job.status) {
        case AiInfluencerReelJobStatus.EVALUATING:
          await this.runEvaluation(jobId);
          return;
        case AiInfluencerReelJobStatus.CANDIDATE:
          await this.runScriptGeneration(jobId);
          return;
        case AiInfluencerReelJobStatus.SCRIPT_GENERATING:
          await this.runScriptGeneration(jobId);
          return;
        case AiInfluencerReelJobStatus.SCRIPT_READY: {
          const meta = readJobRenderMeta(job.renderSettingsJson);
          const cfg = this.settings.getCached();
          const autoAdvance =
            cfg.approvalMode !== 'MANUAL' ||
            job.isTest ||
            meta.isProductionTest === true ||
            meta.topicCandidateApproved === true;
          if (autoAdvance) {
            if (shouldSkipVoicePhaseForVideoAgent(meta, cfg)) {
              await this.runVideoAgentStart(jobId);
            } else {
              await this.prisma.aiInfluencerReelJob.update({
                where: { id: jobId },
                data: {
                  status: AiInfluencerReelJobStatus.VOICE_GENERATING,
                  renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
                    voiceEngine: resolveVoiceEngine(meta, cfg),
                  }) as object,
                },
              });
              await this.runVoiceGeneration(jobId);
            }
          }
          return;
        }
        case AiInfluencerReelJobStatus.RENDERING:
          await this.runRender(jobId);
          return;
        case AiInfluencerReelJobStatus.FAILED:
          return;
        case AiInfluencerReelJobStatus.READY:
          await this.runAutoPublish(jobId);
          return;
        case AiInfluencerReelJobStatus.PUBLISHING:
          await this.runAutoPublish(jobId);
          return;
        case AiInfluencerReelJobStatus.VOICE_GENERATING:
          await this.runVoiceGeneration(jobId);
          return;
        case AiInfluencerReelJobStatus.VOICE_READY:
          await this.runAvatarStart(jobId);
          return;
        case AiInfluencerReelJobStatus.AVATAR_GENERATING:
          await this.runAvatarPoll(jobId);
          return;
        case AiInfluencerReelJobStatus.AVATAR_READY:
          await this.runRender(jobId);
          return;
        default:
          return;
      }
    } catch (err) {
      const message = extractPipelineErrorMessage(err);
      const current = await this.prisma.aiInfluencerReelJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      const stageAtFailure = current?.status ?? job.status;
      await this.failJob(jobId, stageAtFailure, errorCode(err), message, err);
      throw err;
    }
  }

  private async setProgressMeta(
    jobId: string,
    meta: ProgressMeta,
    timelineLabel?: string,
  ): Promise<void> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      select: { timelineEvents: true },
    });
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: meta.percent,
        currentStep: meta.step,
        timelineEvents: timelineLabel
          ? appendTimelineEvent(job?.timelineEvents, timelineLabel, meta.step)
          : undefined,
      },
    });
  }

  private async setProgress(
    jobId: string,
    status: AiInfluencerReelJobStatus,
    avatarPollRatio?: number,
    timelineLabel?: string,
  ): Promise<void> {
    const meta = progressForStatus(status, avatarPollRatio);
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      select: { timelineEvents: true, renderSettingsJson: true },
    });
    const heartbeatAt = new Date().toISOString();
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: meta.percent,
        currentStep: meta.step,
        lastAttemptAt: new Date(),
        renderSettingsJson: mergeJobRenderMeta(job?.renderSettingsJson, {
          pipelineStage: meta.stepKey,
          lastHeartbeatAt: heartbeatAt,
        }) as object,
        timelineEvents: timelineLabel
          ? appendTimelineEvent(job?.timelineEvents, timelineLabel, meta.step)
          : undefined,
      },
    });
  }

  private async runEvaluation(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job.article) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { status: AiInfluencerReelJobStatus.CANDIDATE },
      });
      return;
    }

    await this.aiProvider.assertScriptGenerationReady();

    await this.setProgress(jobId, AiInfluencerReelJobStatus.EVALUATING, undefined, 'EVALUATION_STARTED');
    if (job.candidateId && !bypassesQualityGate(job)) {
      if (job.status !== AiInfluencerReelJobStatus.CANDIDATE) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.CANDIDATE },
        });
      }
      return;
    }

    const article = job.article;
    const { result, costCzk } = await this.scriptProvider.evaluateArticle({
      id: article.id,
      title: decodeHtmlEntities(article.title),
      perex: decodeHtmlEntities(article.perex ?? ''),
      bodyMarkdown: article.bodyMarkdown,
      category: article.category,
      region: article.region,
      publishedAt: article.publishedAt,
      ogImageUrl: article.ogImageUrl,
      factClaimsJson: article.factClaimsJson,
    });

    const candidate = await this.prisma.articleReelCandidate.create({
      data: {
        articleId: article.id,
        reelPotentialScore: result.reelPotentialScore,
        topicInterest: result.topicInterest,
        freshness: result.freshness,
        hookPotential: result.hookPotential,
        practicalValue: result.practicalValue,
        emotionalInterest: result.emotionalInterest,
        visualPotential: result.visualPotential,
        localInterest: result.localInterest,
        sourceTrust: result.sourceTrust,
        duplicationPenalty: result.duplicationPenalty,
        reasoningSummary: result.reasoningSummary,
      },
    });

    const cfg = this.settings.getCached();
    const bypassQuality = bypassesQualityGate(job);
    const passes = result.reelPotentialScore >= cfg.minScore || bypassQuality;
    const nextStatus = passes
      ? AiInfluencerReelJobStatus.CANDIDATE
      : AiInfluencerReelJobStatus.SKIPPED_QUALITY;
    const progress = progressForStatus(nextStatus);
    const scoreWarning =
      bypassQuality && result.reelPotentialScore < cfg.minScore
        ? `AI score ${result.reelPotentialScore}/${cfg.minScore} – ručně vyžádáno, pokračuji ve výrobě`
        : null;

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        candidateId: candidate.id,
        status: nextStatus,
        contentFormat: result.contentFormat ?? undefined,
        aiCostEstimated: { increment: costCzk },
        totalExternalCost: { increment: costCzk },
        skipReason: passes
          ? null
          : `Nízký potenciál pro AI Reel — score ${result.reelPotentialScore} / ${cfg.minScore}`,
        errorMessage: null,
        failedStage: null,
        progressPercent: progress.percent,
        currentStep: passes
          ? scoreWarning ??
            `Kandidát · score ${result.reelPotentialScore}/${cfg.minScore}`
          : `Nevybráno · score ${result.reelPotentialScore}/${cfg.minScore}`,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          evaluationScore: result.reelPotentialScore,
          evaluationScoreWarning: scoreWarning ?? undefined,
        }) as object,
        timelineEvents: appendTimelineEvent(
          appendTimelineEvent(job.timelineEvents, 'EVALUATION_SCORE', String(result.reelPotentialScore)),
          passes ? 'CANDIDATE_SELECTED' : 'SKIPPED_QUALITY',
        ),
      },
    });
  }

  private async runScriptGeneration(jobId: string): Promise<void> {
    const existing = await this.getJob(jobId);
    if (existing.scriptHash && existing.spokenText) {
      if (existing.status !== AiInfluencerReelJobStatus.SCRIPT_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.SCRIPT_READY },
        });
      }
      if (this.settings.getCached().approvalMode !== 'MANUAL') {
        await this.advanceJob(jobId);
      }
      return;
    }

    await this.aiProvider.assertScriptGenerationReady();

    if (!bypassesDuplicateGate(existing) && (await this.isDuplicateTopic(existing))) {
      const progress = progressForStatus(AiInfluencerReelJobStatus.SKIPPED_DUPLICATE);
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          status: AiInfluencerReelJobStatus.SKIPPED_DUPLICATE,
          skipReason: 'Velmi podobné AI Reel již existuje (posledních 7 dní)',
          progressPercent: progress.percent,
          currentStep: progress.step,
          timelineEvents: appendTimelineEvent(existing.timelineEvents, 'SKIPPED_DUPLICATE'),
        },
      });
      return;
    }

    await this.setProgress(jobId, AiInfluencerReelJobStatus.SCRIPT_GENERATING, undefined, 'SCRIPT_STARTED');
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { status: AiInfluencerReelJobStatus.SCRIPT_GENERATING },
    });

    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();

    let script: ReelScriptPayload;
    let hookCandidates: string[];
    let selectedHook: string;
    let costCzk: number;
    let scriptHash: string;
    let scenes: ReelScriptPayload['scenes'];

    if (job.propertyId && job.property) {
      const property = job.property;
      const generated = await this.scriptProvider.generatePropertyScript({
        property: {
          id: property.id,
          title: property.title,
          description: property.description,
          offerType: property.offerType,
          propertyType: property.propertyType,
          subType: property.subType,
          city: property.city,
          district: property.district,
          region: property.region,
          area: property.area,
          landArea: property.landArea,
          floor: property.floor,
          price: property.price,
          currency: property.currency,
          condition: property.condition,
          equipment: property.equipment,
          imageCount: property.images.length,
        },
        targetDurationSec: resolveJobTargetDurationSec(job.renderSettingsJson, cfg.targetDurationSec),
        personalityPrompt: job.profile.personalityPrompt,
        brandingSettings: cfg,
      });
      script = generated.script;
      hookCandidates = generated.hookCandidates;
      selectedHook = generated.selectedHook;
      costCzk = generated.costCzk;
      scriptHash = generated.scriptHash;
    } else if (job.article) {
      const generated = await this.scriptProvider.generateScript({
        article: {
          id: job.article.id,
          title: decodeHtmlEntities(job.article.title),
          perex: decodeHtmlEntities(job.article.perex ?? ''),
          bodyMarkdown: job.article.bodyMarkdown,
          category: job.article.category,
          region: job.article.region,
          publishedAt: job.article.publishedAt,
          ogImageUrl: job.article.ogImageUrl,
          factClaimsJson: job.article.factClaimsJson,
        },
        targetDurationSec: resolveJobTargetDurationSec(job.renderSettingsJson, cfg.targetDurationSec),
        personalityPrompt: job.profile.personalityPrompt,
        brandingSettings: cfg,
      });
      script = generated.script;
      hookCandidates = generated.hookCandidates;
      selectedHook = generated.selectedHook;
      costCzk = generated.costCzk;
      scriptHash = generated.scriptHash;
    } else {
      throw new BadRequestException('Job nemá zdrojový článek ani inzerát.');
    }

    const spokenWithBrand = ensureBrandMention(script.spokenText, cfg);
    script.spokenText = spokenWithBrand;
    const ttsPrepared = prepareSpeechTextForProvider(spokenWithBrand, 'ELEVENLABS', cfg);
    const spokenTextTts = ttsPrepared.speechText;

    const storyboard = validateAndNormalizeStoryboard(
      script,
      resolveJobTargetDurationSec(job.renderSettingsJson, cfg.targetDurationSec),
    );
    script.scenes = storyboard.scenes;

    if (job.propertyId) {
      scenes = await this.resolvePropertyScenes(job.propertyId, script);
    } else if (job.article) {
      scenes = await this.resolveScenes(job.article, script);
    } else {
      scenes = script.scenes;
    }
    const existingMeta = readJobRenderMeta(job.renderSettingsJson);
    const generationMode = getJobSnapshotGenerationMode(existingMeta, cfg);
    const voiceEngine = resolveVoiceEngine(existingMeta, cfg);
    const renderMeta = mergeJobRenderMeta(job.renderSettingsJson, {
      pronunciationRulesApplied: ttsPrepared.rulesApplied,
      videoGenerationMode: generationMode,
      generationModeUsed: generationMode,
      voiceEngine,
      providerJobType: generationMode === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'AVATAR',
    });
    const snapshotMeta = readJobRenderMeta(renderMeta);
    this.log.log(
      `Job ${jobId} script ready generationMode=${generationMode} voiceEngine=${voiceEngine} (snapshot)`,
    );
    const autoContinue =
      cfg.approvalMode !== 'MANUAL' || job.isTest || existingMeta.isProductionTest === true;
    const nextStatus = autoContinue
      ? shouldSkipVoicePhaseForVideoAgent(snapshotMeta, cfg)
        ? AiInfluencerReelJobStatus.SCRIPT_READY
        : AiInfluencerReelJobStatus.VOICE_GENERATING
      : AiInfluencerReelJobStatus.SCRIPT_READY;
    const progress = progressForStatus(
      autoContinue && shouldSkipVoicePhaseForVideoAgent(snapshotMeta, cfg)
        ? AiInfluencerReelJobStatus.SCRIPT_READY
        : nextStatus,
    );

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        hookCandidates,
        selectedHook,
        scriptJson: script as object,
        spokenText: spokenWithBrand,
        spokenTextTts,
        captionTitle: decodeHtmlEntities(script.captionTitle),
        captionDescription: script.captionDescription,
        hashtags: script.hashtags.join(' '),
        estimatedDurationSec: script.estimatedDuration,
        scriptHash,
        scenesJson: scenes as object,
        contentFormat: script.contentFormat ?? job.contentFormat ?? undefined,
        renderSettingsJson: renderMeta as object,
        aiCostEstimated: { increment: costCzk },
        totalExternalCost: { increment: costCzk },
        progressPercent: progress.percent,
        currentStep: progress.step,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'SCRIPT_GENERATED'),
      },
    });

    if (nextStatus === AiInfluencerReelJobStatus.VOICE_GENERATING) {
      await this.runVoiceGeneration(jobId);
    } else if (autoContinue && shouldSkipVoicePhaseForVideoAgent(snapshotMeta, cfg)) {
      await this.runVideoAgentStart(jobId);
    }
  }

  private async isDuplicateTopic(job: AiInfluencerJobWithRelations): Promise<boolean> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (job.propertyId) {
      const sameProperty = await this.prisma.aiInfluencerReelJob.findFirst({
        where: {
          propertyId: job.propertyId,
          id: { not: job.id },
          createdAt: { gte: since },
          status: {
            in: [
              AiInfluencerReelJobStatus.READY,
              AiInfluencerReelJobStatus.PUBLISHED,
              AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
              AiInfluencerReelJobStatus.PUBLISHING,
            ],
          },
        },
      });
      if (sameProperty) return true;
      return false;
    }

    if (!job.articleId || !job.article) return false;

    const sameArticle = await this.prisma.aiInfluencerReelJob.findFirst({
      where: {
        articleId: job.articleId,
        id: { not: job.id },
        createdAt: { gte: since },
        status: {
          in: [
            AiInfluencerReelJobStatus.READY,
            AiInfluencerReelJobStatus.PUBLISHED,
            AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
            AiInfluencerReelJobStatus.PUBLISHING,
          ],
        },
      },
    });
    if (sameArticle) return true;

    const recent = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        id: { not: job.id },
        createdAt: { gte: since },
        status: {
          notIn: [
            AiInfluencerReelJobStatus.FAILED,
            AiInfluencerReelJobStatus.CANCELLED,
            AiInfluencerReelJobStatus.SKIPPED_QUALITY,
            AiInfluencerReelJobStatus.SKIPPED_DUPLICATE,
          ],
        },
      },
      include: { article: { select: { title: true } } },
      take: 40,
      orderBy: { createdAt: 'desc' },
    });
    const title = job.article.title;
    for (const other of recent) {
      if (!other.article) continue;
      if (normalizeArticleTitle(title) === normalizeArticleTitle(other.article.title)) return true;
      if (titleSimilarity(title, other.article.title) >= 0.78) return true;
    }
    return false;
  }

  private async runVoiceGeneration(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const meta = readJobRenderMeta(job.renderSettingsJson);

    if (shouldSkipVoicePhaseForVideoAgent(meta, cfg)) {
      await this.runVideoAgentStart(jobId);
      return;
    }

    if (!isElevenLabsRequiredForJob(meta, cfg)) {
      throw Object.assign(new Error('Voice fáze byla spuštěna, ale ElevenLabs není vyžadován.'), {
        code: 'VOICE_ENGINE_MISMATCH',
        pipelineStage: 'VOICE',
      });
    }

    await this.setProgress(jobId, AiInfluencerReelJobStatus.VOICE_GENERATING, undefined, 'VOICE_STARTED');
    if (job.voiceStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.VOICE_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.VOICE_READY },
        });
      }
      return;
    }

    const spokenText = job.spokenTextTts?.trim() || job.spokenText?.trim();
    if (!spokenText) throw new Error('Chybí spokenText pro voice-over.');

    const voiceProvider = this.registry.getVoiceProvider(job.profile.voiceProvider);
    await this.elevenLabs.assertReadyForGeneration(job.profile.voiceId);

    const voiceId = this.registry.resolveVoiceId(job.profile.voiceId);
    const cached = job.voiceHash
      ? await this.generationCache.findCached(
          ProviderGenerationType.VOICE,
          job.voiceHash,
          voiceProvider.providerId,
        )
      : null;

    let voiceUrl = job.voiceStorageUrl;
    let voiceCost = 0;
    let voiceHash = job.voiceHash;

    if (cached?.status === ProviderGenerationStatus.READY && cached.storageUrl) {
      voiceUrl = cached.storageUrl;
      voiceCost = cached.costEstimated;
      voiceHash = cached.contentHash;
    } else {
      const result = await voiceProvider.generateSpeech({
        text: spokenText,
        voiceId: voiceId ?? undefined,
        language: job.profile.language,
        speed: job.profile.voiceSpeed ?? undefined,
        stability: job.profile.voiceStability ?? undefined,
        style: job.profile.voiceStyle ?? undefined,
      });
      const upload = await this.cloudinary.uploadShortsMusicBuffer(
        result.audioBuffer,
        `ai-influencer-voice-${jobId}.mp3`,
        result.mimeType,
      );
      voiceUrl = upload.url;
      voiceCost = result.costEstimatedCzk;
      voiceHash = result.contentHash;
      await this.generationCache.markReady({
        type: ProviderGenerationType.VOICE,
        contentHash: result.contentHash,
        provider: voiceProvider.providerId,
        jobId,
        storageUrl: voiceUrl,
        costEstimated: voiceCost,
      });
    }

    const progress = progressForStatus(AiInfluencerReelJobStatus.VOICE_READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.VOICE_READY,
        voiceStorageUrl: voiceUrl,
        voiceHash,
        voiceCostEstimated: voiceCost,
        totalExternalCost: { increment: voiceCost },
        progressPercent: progress.percent,
        currentStep: progress.step,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'VOICE_GENERATED'),
      },
    });
  }

  private canUseElevenLabsFallback(): boolean {
    return getElevenLabsRuntimeConfig().apiKeyPresence === 'CONFIGURED';
  }

  private async maybeRunVideoAgentFallback(
    jobId: string,
    reason: string,
    errorCode?: string | null,
  ): Promise<boolean> {
    if (
      errorCode === 'HEYGEN_NOT_CONFIGURED' ||
      /heygen_api_key|heygen api.*není nakonfigurován/i.test(reason)
    ) {
      return false;
    }
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const cfg = this.settings.getCached();
    if (!isAvatarFallbackAllowed(meta, cfg) || !this.canUseElevenLabsFallback()) {
      return false;
    }
    await this.runVideoAgentFallback(jobId, reason);
    return true;
  }

  private async runVideoAgentFallback(jobId: string, reason: string): Promise<void> {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const cfg = this.settings.getCached();
    if (!isAvatarFallbackAllowed(meta, cfg)) {
      throw Object.assign(new Error(reason), { code: 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE', pipelineStage: 'VIDEO_AGENT' });
    }
    if (!this.canUseElevenLabsFallback()) {
      throw Object.assign(new Error(`${reason} ElevenLabs fallback není nakonfigurován.`), {
        code: 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    this.log.warn(`Video Agent fallback for job ${jobId}: ${reason}`);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        avatarExternalJobId: null,
        status: AiInfluencerReelJobStatus.VOICE_GENERATING,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          usedVideoAgentFallback: true,
          fallbackNotice: 'Video Agent nebyl dostupný – použito standardní AI video.',
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'VIDEO_AGENT_FALLBACK', reason),
      },
    });
    await this.runVoiceGeneration(jobId);
  }

  async recoverStuckVideoAgentJobs(limit = 10): Promise<number> {
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        status: {
          in: [
            AiInfluencerReelJobStatus.VOICE_READY,
            AiInfluencerReelJobStatus.SCRIPT_READY,
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.FAILED,
          ],
        },
        progressPercent: { gte: 40 },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit * 3,
      select: {
        id: true,
        status: true,
        progressPercent: true,
        avatarExternalJobId: true,
        renderSettingsJson: true,
        finalMasterUrl: true,
        baseMasterUrl: true,
        videoUrl: true,
        avatarStorageUrl: true,
      },
    });

    let recovered = 0;
    for (const row of rows) {
      if (hasMasterVideoAsset(row)) continue;
      const meta = readJobRenderMeta(row.renderSettingsJson);
      const sessionId = extractSessionIdForRecovery(meta, row.avatarExternalJobId);
      if (sessionId) {
        try {
          if (row.status === AiInfluencerReelJobStatus.FAILED) {
            await this.prisma.aiInfluencerReelJob.update({
              where: { id: row.id },
              data: {
                status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
                errorCode: null,
                errorMessage: null,
                failedStage: null,
              },
            });
          }
          await this.runVideoAgentPoll(row.id);
          recovered += 1;
        } catch (err) {
          this.log.warn(
            `Video Agent recovery poll ${row.id} failed: ${err instanceof Error ? err.message : err}`,
          );
        }
        continue;
      }
      if (isVideoAgentSubmitStale(meta) && !sessionId) {
        await this.markVideoAgentProviderReferenceLost(row.id, meta);
        recovered += 1;
      }
    }
    return recovered;
  }

  /** Backend HeyGen polling — volat každý worker tick, nezávisle na advanceJobChain. */
  async pollHeyGenActiveJobs(limit = 20): Promise<{ polled: number; finalized: number; errors: number }> {
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        status: {
          in: [
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_READY,
            AiInfluencerReelJobStatus.FAILED,
          ],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit * 3,
      select: {
        id: true,
        status: true,
        errorCode: true,
        avatarExternalJobId: true,
        renderSettingsJson: true,
        baseMasterUrl: true,
        finalMasterUrl: true,
        videoUrl: true,
        avatarStorageUrl: true,
      },
    });

    let polled = 0;
    let finalized = 0;
    let errors = 0;
    for (const row of rows.slice(0, limit)) {
      if (hasMasterVideoAsset(row)) continue;
      const meta = readJobRenderMeta(row.renderSettingsJson);
      if (shouldSkipPipelineForCancel(row.status, meta)) continue;

      if (
        meta.pipelineStage === 'STORING' &&
        meta.storageStartedAt &&
        meta.providerOutputUrl &&
        !hasMasterVideoAsset(row)
      ) {
        const storageAge = Date.now() - Date.parse(meta.storageStartedAt);
        if (Number.isFinite(storageAge) && storageAge > AI_INFLUENCER_STORAGE_STUCK_MS) {
          try {
            await this.retryStorageJob(row.id);
            finalized += 1;
          } catch (err) {
            errors += 1;
            this.log.warn(
              `Storage recovery ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          continue;
        }
      }

      const sessionId = extractSessionIdForRecovery(meta, row.avatarExternalJobId);
      const hadGallery = hasMasterVideoAsset(row);

      try {
        if (
          row.status === AiInfluencerReelJobStatus.AVATAR_READY &&
          row.baseMasterUrl?.trim() &&
          !row.finalMasterUrl?.trim() &&
          !row.videoUrl?.trim()
        ) {
          await this.advanceJob(row.id);
          finalized += 1;
          continue;
        }

        if (!sessionId) continue;

        if (row.status === AiInfluencerReelJobStatus.FAILED) {
          if (row.errorCode === 'STORAGE_FAILED' || meta.pipelineStage === 'STORAGE_FAILED') {
            continue;
          }
          await this.prisma.aiInfluencerReelJob.update({
            where: { id: row.id },
            data: {
              status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
              errorCode: null,
              errorMessage: null,
              failedStage: null,
            },
          });
        }

        polled += 1;
        await this.runVideoAgentPoll(row.id);
        const after = await this.prisma.aiInfluencerReelJob.findUnique({
          where: { id: row.id },
          select: {
            status: true,
            finalMasterUrl: true,
            baseMasterUrl: true,
            videoUrl: true,
            avatarStorageUrl: true,
          },
        });
        if (after && !hadGallery && hasMasterVideoAsset(after)) {
          finalized += 1;
        } else if (
          after &&
          (after.status === AiInfluencerReelJobStatus.READY ||
            after.status === AiInfluencerReelJobStatus.PUBLISHED ||
            after.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED)
        ) {
          finalized += 1;
        }
      } catch (err) {
        errors += 1;
        this.log.warn(
          `HeyGen poll ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { polled, finalized, errors };
  }

  async countHeyGenPendingImport(): Promise<number> {
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        isTest: false,
        status: {
          in: [
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_READY,
            AiInfluencerReelJobStatus.FAILED,
          ],
        },
      },
      select: {
        id: true,
        avatarExternalJobId: true,
        renderSettingsJson: true,
        finalMasterUrl: true,
        baseMasterUrl: true,
        videoUrl: true,
        avatarStorageUrl: true,
      },
      take: 200,
    });
    return rows.filter((row) => {
      if (hasMasterVideoAsset(row)) return false;
      const meta = readJobRenderMeta(row.renderSettingsJson);
      return hasPersistedVideoAgentProviderId(meta, row.avatarExternalJobId);
    }).length;
  }

  /** Ruční / cron synchronizace dokončených HeyGen videí do portálu — bez nových CREATE. */
  async syncHeyGenVideosToPortal(options?: {
    limit?: number;
    sinceDays?: number;
  }): Promise<HeyGenPortalSyncResult> {
    const limit = Math.max(1, options?.limit ?? 30);
    const since = new Date(Date.now() - (options?.sinceDays ?? 14) * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        createdAt: { gte: since },
        status: {
          in: [
            AiInfluencerReelJobStatus.AVATAR_GENERATING,
            AiInfluencerReelJobStatus.AVATAR_READY,
            AiInfluencerReelJobStatus.FAILED,
            AiInfluencerReelJobStatus.RENDERING,
            AiInfluencerReelJobStatus.VOICE_READY,
            AiInfluencerReelJobStatus.SCRIPT_READY,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 4,
      include: { article: { select: { title: true } } },
    });

    const result: HeyGenPortalSyncResult = {
      scanned: 0,
      foundInHeyGen: 0,
      recovered: 0,
      storedInGallery: 0,
      stillProcessing: 0,
      providerIdMissing: 0,
      unmatched: 0,
      errors: 0,
      newHeyGenCreateCalls: 0,
      details: [],
    };

    for (const job of rows) {
      if (result.scanned >= limit) break;
      if (hasMasterVideoAsset(job)) continue;

      result.scanned += 1;
      const title = job.article?.title ?? job.captionTitle ?? job.id;
      const meta = readJobRenderMeta(job.renderSettingsJson);
      const sessionId = extractSessionIdForRecovery(meta, job.avatarExternalJobId);

      if (!sessionId) {
        result.providerIdMissing += 1;
        result.details.push({
          jobId: job.id,
          title,
          outcome: 'PROVIDER_ID_MISSING',
          message: 'Chybí HeyGen session ID — nelze bezpečně obnovit bez provider reference.',
        });
        continue;
      }

      try {
        const reconcile = await this.reconcileHeyGenJob(job.id);
        if (reconcile.outcome === 'RECOVERED' || reconcile.outcome === 'ALREADY_ARCHIVED') {
          result.foundInHeyGen += 1;
          result.recovered += 1;
          result.storedInGallery += 1;
          result.details.push({ jobId: job.id, title, outcome: reconcile.outcome });
          continue;
        }
        if (reconcile.outcome === 'PROVIDER_RUNNING') {
          result.foundInHeyGen += 1;
          result.stillProcessing += 1;
          await this.runVideoAgentPoll(job.id);
          const refreshed = await this.getJob(job.id);
          if (hasMasterVideoAsset(refreshed) || refreshed.status === AiInfluencerReelJobStatus.READY) {
            result.recovered += 1;
            result.storedInGallery += 1;
            result.details.push({ jobId: job.id, title, outcome: 'RECOVERED_AFTER_POLL' });
          } else {
            result.details.push({
              jobId: job.id,
              title,
              outcome: 'STILL_PROCESSING',
              message: reconcile.message ?? undefined,
            });
          }
          continue;
        }
        if (reconcile.outcome === 'NO_PROVIDER_JOB') {
          result.providerIdMissing += 1;
          result.details.push({ jobId: job.id, title, outcome: 'NO_PROVIDER_JOB' });
          continue;
        }
        result.unmatched += 1;
        result.details.push({
          jobId: job.id,
          title,
          outcome: reconcile.outcome,
          message: reconcile.message ?? undefined,
        });
      } catch (err) {
        result.errors += 1;
        result.details.push({
          jobId: job.id,
          title,
          outcome: 'ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  private async assertPaidGenerationPreflight(
    jobId: string,
    job: AiInfluencerJobWithRelations,
    cfg: ReturnType<AiInfluencerSettingsService['getCached']>,
    meta: ReturnType<typeof readJobRenderMeta>,
  ): Promise<void> {
    await this.aiProvider.assertScriptGenerationReady();
    if (isElevenLabsRequiredForJob(meta, cfg)) {
      await this.elevenLabs.assertReadyForGeneration(job.profile.voiceId);
    }
    this.heygenConfig.assertApiKeyConfigured('VIDEO_AGENT');
    const readiness = await this.videoAgent.getReadiness();
    if (!readiness.available) {
      throw Object.assign(new Error(readiness.message ?? 'HeyGen Video Agent není dostupný.'), {
        code:
          readiness.apiKeyPresence === 'MISSING'
            ? 'HEYGEN_NOT_CONFIGURED'
            : 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE',
        pipelineStage: 'VIDEO_AGENT',
      });
    }
    const storageDiag = this.cloudinary.getDiagnostics();
    if (!storageDiag.configured) {
      throw Object.assign(new Error('Cloudinary storage není nakonfigurován.'), {
        code: 'STORAGE_NOT_CONFIGURED',
        pipelineStage: 'STORAGE',
      });
    }
    const profile = await this.registry.getDefaultProfile();
    const heygenReadiness = await this.heygen.getGenerationReadiness(profile.avatarId);
    if (!heygenReadiness.ready) {
      throw Object.assign(new Error(heygenReadiness.message ?? 'HeyGen avatar není připraven.'), {
        code: 'HEYGEN_NOT_CONFIGURED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }
    this.log.log(`[AI-REEL][PREFLIGHT] AI_PREFLIGHT_PASSED jobId=${jobId}`);
  }

  private async persistVideoAgentProviderSession(
    jobId: string,
    input: {
      sessionId: string;
      videoId?: string | null;
      providerStatus?: string | null;
      renderMetaJson: Record<string, unknown>;
      timelineEvents: unknown;
      scriptEstimatedDuration?: number | null;
      avatarCostIncrement: number;
    },
  ): Promise<void> {
    const submittedAt = new Date().toISOString();
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        avatarExternalJobId: toVideoAgentExternalJobId(input.sessionId),
        avatarCostEstimated: input.avatarCostIncrement,
        totalExternalCost: { increment: input.avatarCostIncrement },
        progressPercent: 50,
        currentStep: 'HeyGen vyrábí video',
        lastAttemptAt: new Date(),
        renderSettingsJson: mergeJobRenderMeta(input.renderMetaJson, {
          videoGenerationMode: 'VIDEO_AGENT',
          generationModeUsed: 'VIDEO_AGENT',
          voiceEngine: 'HEYGEN',
          providerJobType: 'VIDEO_AGENT',
          providerJobId: input.sessionId,
          heygenVideoAgentSessionId: input.sessionId,
          heygenVideoAgentVideoId: input.videoId ?? undefined,
          videoAgentSubmittedAt: submittedAt,
          videoAgentSubmitInFlight: false,
          providerSubmitState: 'SUBMITTED',
          providerStatus: input.providerStatus ?? 'SUBMITTED',
          pipelineStage: 'VIDEO_AGENT_PROCESSING',
          lastHeartbeatAt: submittedAt,
        }) as object,
        timelineEvents: appendTimelineEvent(
          input.timelineEvents,
          'HEYGEN_PROVIDER_ID_PERSISTED',
          input.sessionId,
        ),
      },
    });
    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN_PROVIDER_ID_PERSISTED session=${input.sessionId.slice(0, 8)}…`,
    );
  }

  private async markVideoAgentProviderReferenceLost(
    jobId: string,
    meta: ReturnType<typeof readJobRenderMeta>,
  ): Promise<void> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id: jobId },
      select: { timelineEvents: true, renderSettingsJson: true },
    });
    const message =
      'HeyGen generace mohla být vytvořena, ale XXREALIT ztratil její identifikátor. Automatické vytvoření další placené generace bylo z bezpečnostních důvodů zastaveno.';
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.FAILED,
        errorCode: 'PROVIDER_REFERENCE_LOST',
        errorMessage: message,
        failedStage: 'VIDEO_AGENT',
        currentStep: 'Generování selhalo · Video Agent',
        renderSettingsJson: mergeJobRenderMeta(job?.renderSettingsJson ?? meta, {
          videoAgentSubmitInFlight: false,
          providerSubmitState: 'SUBMIT_UNKNOWN',
          pipelineStage: 'RECOVERY_REQUIRED',
        }) as object,
        timelineEvents: appendTimelineEvent(job?.timelineEvents, 'PROVIDER_REFERENCE_LOST'),
      },
    });
    this.log.error(`[AI-VIDEO][${jobId}] PROVIDER_REFERENCE_LOST`);
  }

  private async runVideoAgentStart(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const meta = readJobRenderMeta(job.renderSettingsJson);

    if (job.avatarStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.AVATAR_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.AVATAR_READY },
        });
      }
      return;
    }

    if (job.avatarExternalJobId && job.status === AiInfluencerReelJobStatus.AVATAR_GENERATING) {
      await this.runVideoAgentPoll(jobId);
      return;
    }

    const existingProviderId = resolveJobProviderJobId(meta, job.avatarExternalJobId);
    if (shouldResumeVideoAgentPolling(meta, job.avatarExternalJobId)) {
      if (job.status !== AiInfluencerReelJobStatus.AVATAR_GENERATING) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: {
            status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
            avatarExternalJobId:
              job.avatarExternalJobId ?? toVideoAgentExternalJobId(existingProviderId!),
          },
        });
      }
      await this.runVideoAgentPoll(jobId);
      return;
    }

    if (shouldBlockVideoAgentResubmit(meta, job.avatarExternalJobId)) {
      if (isVideoAgentSubmitStale(meta, AI_INFLUENCER_VIDEO_AGENT_SUBMIT_STALE_MS)) {
        await this.markVideoAgentProviderReferenceLost(jobId, meta);
      }
      return;
    }

    if (isVideoAgentSubmitUnknown(meta) && !existingProviderId) {
      if (isVideoAgentSubmitStale(meta, AI_INFLUENCER_VIDEO_AGENT_SUBMIT_STALE_MS)) {
        await this.markVideoAgentProviderReferenceLost(jobId, meta);
      }
      return;
    }

    await this.assertPaidGenerationPreflight(jobId, job, cfg, meta);
    this.log.log(
      `[AI-REEL][HEYGEN] jobId=${jobId} generationMode=${getJobSnapshotGenerationMode(meta, cfg)} apiKeyPresent=${this.heygenConfig.isApiKeyConfigured()} providerConfigured=true provider=HEYGEN workerRuntime=true`,
    );
    const avatarId = this.registry.resolveAvatarId(job.profile.avatarId);
    const script = job.scriptJson as ReelScriptPayload | null;
    if (!script?.spokenText) throw Object.assign(new Error('Chybí scénář pro Video Agent.'), { code: 'STORYBOARD_INVALID' });

    const scenes = (job.scenesJson as ReelScriptPayload['scenes'] | null) ?? script.scenes ?? [];
    const rawMediaFiles = collectStoryboardMediaUrls(scenes);
    let renderMetaJson = mergeJobRenderMeta(job.renderSettingsJson, {
      pipelineStage: 'MEDIA_PREPARATION',
    });

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: 25,
        currentStep: 'Hledám média',
        renderSettingsJson: renderMetaJson as object,
      },
    });

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: 30,
        currentStep: 'Připravuji média',
      },
    });

    const mediaPrep = await this.heygenMedia.prepareHeyGenMediaFiles(
      jobId,
      rawMediaFiles,
      meta.heygenPreparedMedia,
    );
    const mediaFiles = mediaPrep.files;
    const mediaPrepCompletedAt = new Date().toISOString();
    renderMetaJson = mergeJobRenderMeta(renderMetaJson, {
      heygenPreparedMedia: mediaPrep.prepared,
      heygenMediaPrepStats: mediaPrep.stats,
      heygenMediaIssues: mediaPrep.issues,
      mediaPrepCompletedAt,
      pipelineStage: 'MEDIA_PREPARATION',
    });

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: 35,
        currentStep: 'Ověřuji veřejné URL',
        renderSettingsJson: renderMetaJson as object,
      },
    });

    if (mediaPrep.stats.rehosted > 0) {
      this.log.log(
        `[AI-VIDEO][${jobId}] ${mediaPrep.stats.rehosted} obrázky byly převedeny do veřejného media storage.`,
      );
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: 40,
        currentStep: 'Média připravena',
      },
    });

    const prompt = buildHeyGenVideoAgentPrompt({
      script: {
        hook: script.hook,
        spokenText: script.spokenText,
        captionTitle: script.captionTitle,
        cta: script.cta,
        estimatedDuration: script.estimatedDuration,
        scenes,
      },
      settings: cfg,
      avatarId,
      videoStyle: cfg.videoStyle,
      avatarFrequency: cfg.avatarFrequency,
      contentKind: job.propertyId ? 'PROPERTY' : 'ARTICLE',
      mediaFiles,
    });

    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN_SUBMIT filesTotal=${rawMediaFiles.length} filesValid=${mediaFiles.length} filesRehosted=${mediaPrep.stats.rehosted} filesSkipped=${mediaPrep.stats.skipped + mediaPrep.stats.invalid}`,
    );
    const generationAttemptId = meta.generationAttemptId ?? `${jobId}-${Date.now()}`;
    const submitStartedAt = new Date().toISOString();
    renderMetaJson = mergeJobRenderMeta(renderMetaJson, {
      generationAttemptId,
      videoAgentSubmitInFlight: true,
      videoAgentSubmitStartedAt: submitStartedAt,
      providerSubmitState: 'SUBMITTING',
      pipelineStage: 'VIDEO_AGENT_SUBMITTING',
    });
    this.log.log(`[AI-VIDEO][${jobId}] HEYGEN_SUBMIT_STARTED attempt=${generationAttemptId}`);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        progressPercent: 45,
        currentStep: 'Odesílám požadavek do HeyGen',
        renderSettingsJson: renderMetaJson as object,
      },
    });

    let started;
    try {
      started = await this.videoAgent.startGeneration({
        prompt,
        avatarId,
        files: mediaFiles,
      });
    } catch (err) {
      const code = errorCode(err);
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout =
        code === 'ETIMEDOUT' ||
        /timeout|timed out|aborted/i.test(message);
      if (isTimeout) {
        renderMetaJson = mergeJobRenderMeta(renderMetaJson, {
          videoAgentSubmitInFlight: true,
          providerSubmitState: 'SUBMIT_UNKNOWN',
          pipelineStage: 'VIDEO_AGENT_SUBMITTING',
        });
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: {
            currentStep: 'HeyGen submit neznámý — čekám na recovery',
            renderSettingsJson: renderMetaJson as object,
            timelineEvents: appendTimelineEvent(job.timelineEvents, 'HEYGEN_SUBMIT_UNKNOWN'),
          },
        });
        this.log.warn(`[AI-VIDEO][${jobId}] HEYGEN_SUBMIT_UNKNOWN — no automatic re-create`);
        return;
      }
      renderMetaJson = mergeJobRenderMeta(renderMetaJson, {
        videoAgentSubmitInFlight: false,
        providerSubmitState: undefined,
      });
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          renderSettingsJson: renderMetaJson as object,
        },
      });
      if (cfg.allowVideoAgentFallback && this.canUseElevenLabsFallback() && (code?.startsWith('HEYGEN_VIDEO_AGENT_') ?? false)) {
        if (await this.maybeRunVideoAgentFallback(
          jobId,
          message,
          code,
        )) {
          return;
        }
      }
      throw err;
    }

    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN_SUBMIT_SUCCEEDED providerJobId=${started.sessionId ? 'present' : 'missing'}`,
    );
    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN_ACCEPTED session=${started.sessionId.slice(0, 8)}… status=${started.providerStatus ?? 'unknown'}`,
    );
    const avatarCostIncrement =
      cfg.avatarCostPerSecCzk * (script.estimatedDuration ?? cfg.targetDurationSec);
    await this.persistVideoAgentProviderSession(jobId, {
      sessionId: started.sessionId,
      videoId: started.videoId,
      providerStatus: started.providerStatus,
      renderMetaJson: mergeJobRenderMeta(renderMetaJson, {
        generationAttemptId,
        heygenVideoAgentVideoId: started.videoId ?? undefined,
      }),
      timelineEvents: appendTimelineEvent(job.timelineEvents, 'VIDEO_AGENT_SUBMITTED', started.sessionId),
      scriptEstimatedDuration: script.estimatedDuration,
      avatarCostIncrement,
    });
  }

  private async runVideoAgentPoll(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const meta = readJobRenderMeta(job.renderSettingsJson);

    if (shouldSkipPipelineForCancel(job.status, meta)) {
      return;
    }

    if (job.avatarStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.AVATAR_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.AVATAR_READY },
        });
      }
      if (
        job.status !== AiInfluencerReelJobStatus.READY &&
        !job.finalMasterUrl?.trim() &&
        !job.videoUrl?.trim()
      ) {
        await this.advanceJob(jobId);
      }
      return;
    }

    const sessionId = extractSessionIdForRecovery(meta, job.avatarExternalJobId);
    if (!sessionId) {
      if (shouldBlockVideoAgentResubmit(meta, job.avatarExternalJobId)) {
        if (isVideoAgentSubmitStale(meta, AI_INFLUENCER_VIDEO_AGENT_SUBMIT_STALE_MS)) {
          await this.markVideoAgentProviderReferenceLost(jobId, meta);
        }
        return;
      }
      if (
        !isVideoAgentSubmitUnknown(meta) &&
        !meta.videoAgentSubmitInFlight &&
        !hasPersistedVideoAgentProviderId(meta, job.avatarExternalJobId)
      ) {
        await this.runVideoAgentStart(jobId);
        return;
      }
      throw Object.assign(new Error('HeyGen odpověděl bez session_id po submitu.'), {
        code: 'HEYGEN_VIDEO_AGENT_SESSION_ID_MISSING',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    if (videoAgentTimedOut(meta.videoAgentSubmittedAt, 90 * 60 * 1000)) {
      if (await this.maybeRunVideoAgentFallback(jobId, 'HeyGen Video Agent timeout.')) {
        return;
      }
      throw Object.assign(new Error('HeyGen Video Agent timeout.'), {
        code: 'HEYGEN_VIDEO_AGENT_TIMEOUT',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    const poll = await this.videoAgent.pollSession(sessionId);
    const polledAt = new Date().toISOString();
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          providerLastPolledAt: polledAt,
          providerStatus: poll.sessionStatus ?? poll.status,
          lastHeartbeatAt: polledAt,
        }) as object,
      },
    });
    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN_STATUS_POLL status=${poll.status} session=${sessionId.slice(0, 8)}…`,
    );
    if (poll.status === 'QUEUED' || poll.status === 'PROCESSING' || poll.status === 'GENERATING') {
      const ratio = videoAgentPollRatio(meta.videoAgentSubmittedAt);
      const longRunning = videoAgentTimedOut(meta.videoAgentSubmittedAt, 20 * 60 * 1000);
      await this.setProgress(
        jobId,
        AiInfluencerReelJobStatus.AVATAR_GENERATING,
        ratio,
        longRunning ? 'HEYGEN_LONG_RUNNING' : 'HEYGEN_PROCESSING',
      );
      return;
    }

    if (poll.status === 'FAILED') {
      if (await this.maybeRunVideoAgentFallback(
        jobId,
        poll.errorMessage ?? 'HeyGen Video Agent processing failed.',
      )) {
        return;
      }
      throw Object.assign(new Error(poll.errorMessage ?? 'Video Agent processing failed.'), {
        code: poll.errorCode ?? 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    if (!poll.videoUrl) {
      throw Object.assign(new Error('Video Agent nevrátil video URL.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    await this.ingestHeyGenProviderVideo(jobId, sessionId, poll);
  }

  private async ingestHeyGenProviderVideo(
    jobId: string,
    sessionId: string,
    poll: HeyGenVideoAgentPollResult,
  ): Promise<void> {
    if (!poll.videoUrl) {
      throw Object.assign(new Error('Video Agent nevrátil video URL.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const cancelled = isJobCancelledState(job.status, meta);
    const archiveOnly = cancelled || meta.cancelPhase === 'CANCELLED_PROVIDER_CONTINUES';

    this.log.log(`[AI-VIDEO][${jobId}] HEYGEN_COMPLETE providerUrl=present archiveOnly=${archiveOnly}`);
    await this.setProgressMeta(
      jobId,
      { percent: 75, step: 'HeyGen dokončil video', stepKey: 'HEYGEN_COMPLETED' },
      'HEYGEN_COMPLETED',
    );
    await this.setProgressMeta(jobId, RENDER_PROGRESS.DOWNLOAD, 'VIDEO_DOWNLOAD_STARTED');

    let buffer: Buffer;
    try {
      buffer = await this.videoAgent.downloadResult(poll.videoUrl);
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }
    if (!buffer.length) {
      throw Object.assign(new Error('Stažené video je prázdné.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    this.log.log(`[AI-VIDEO][${jobId}] DOWNLOAD bytes=${buffer.length}`);
    const storageStartedAt = new Date().toISOString();
    await this.setProgressMeta(
      jobId,
      { percent: 90, step: 'Ukládám do XXREALIT', stepKey: 'STORING' },
      'VIDEO_STORAGE_STARTED',
    );
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          storageStartedAt,
          providerOutputUrl: poll.videoUrl,
        }) as object,
      },
    });

    let videoUrl: string;
    try {
      videoUrl = await this.uploadVideoWithTimeout(
        buffer,
        `ai-influencer-video-agent-${jobId}.mp4`,
        AI_INFLUENCER_STORAGE_TIMEOUT_MS,
      );
    } catch (err) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          status: AiInfluencerReelJobStatus.FAILED,
          errorCode: 'STORAGE_FAILED',
          errorMessage: 'Video bylo v HeyGen vytvořeno, ale nepodařilo se uložit do XXREALIT.',
          failedStage: 'STORAGE',
          progressPercent: 90,
          currentStep: 'Ukládání selhalo',
          renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
            storageFailedAt: new Date().toISOString(),
            providerOutputUrl: poll.videoUrl,
            pipelineStage: 'STORAGE_FAILED',
          }) as object,
          timelineEvents: appendTimelineEvent(job.timelineEvents, 'STORAGE_FAILED'),
        },
      });
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        code: 'STORAGE_FAILED',
        pipelineStage: 'STORAGE',
      });
    }

    this.log.log(`[AI-VIDEO][${jobId}] STORAGE archived permanent url`);

    if (archiveOnly) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          status: AiInfluencerReelJobStatus.CANCELLED,
          avatarStorageUrl: videoUrl,
          baseMasterUrl: videoUrl,
          avatarHash: poll.videoId ?? sessionId,
          progressPercent: 100,
          currentStep: 'Zrušeno — video archivováno (bez publikace)',
          renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
            heygenVideoAgentVideoId: poll.videoId ?? meta.heygenVideoAgentVideoId,
            heygenVideoAgentSessionId: sessionId,
            videoAgentMaster: true,
            providerOutputUrl: poll.videoUrl,
            videoAgentSubmitInFlight: false,
            providerSubmitState: 'COMPLETED',
            providerStatus: poll.sessionStatus ?? poll.status,
            providerCompletedAt: new Date().toISOString(),
            providerCompletedAfterCancel: true,
            autoPublish: false,
            pipelineStage: 'CANCELLED_ARCHIVED',
          }) as object,
          timelineEvents: appendTimelineEvent(job.timelineEvents, 'CANCELLED_PROVIDER_ARCHIVED'),
        },
      });
      return;
    }

    const progress = progressForStatus(AiInfluencerReelJobStatus.AVATAR_READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_READY,
        avatarStorageUrl: videoUrl,
        baseMasterUrl: videoUrl,
        avatarHash: poll.videoId ?? sessionId,
        failedStage: null,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
        progressPercent: progress.percent,
        currentStep: progress.step,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          heygenVideoAgentVideoId: poll.videoId ?? meta.heygenVideoAgentVideoId,
          heygenVideoAgentSessionId: sessionId,
          videoAgentMaster: true,
          providerOutputUrl: poll.videoUrl,
          videoAgentSubmitInFlight: false,
          providerSubmitState: 'COMPLETED',
          providerStatus: poll.sessionStatus ?? poll.status,
          providerCompletedAt: new Date().toISOString(),
          pipelineStage: 'VIDEO_AGENT_READY',
        }) as object,
        timelineEvents: appendTimelineEvent(
          appendTimelineEvent(job.timelineEvents, 'HEYGEN_COMPLETE'),
          'VIDEO_AGENT_READY',
        ),
      },
    });

    await this.advanceJob(jobId);
  }

  private uploadVideoWithTimeout(
    buffer: Buffer,
    filename: string,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Storage upload timeout after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      void this.cloudinary
        .uploadVideoBuffer(buffer, filename)
        .then((url) => {
          clearTimeout(timer);
          resolve(url);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async runVideoAgentPostProcess(jobId: string): Promise<void> {
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { status: AiInfluencerReelJobStatus.RENDERING },
    });
    await this.setProgress(jobId, AiInfluencerReelJobStatus.RENDERING, undefined, 'POST_PROCESSING');

    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const renderSettings = this.buildRenderSettingsForJob(job, cfg);
    const logoPath = cfg.logoEnabled ? resolveShortsLogoPath() : null;
    const brandingNeeded = Boolean(
      cfg.brandingEnabled &&
        ((logoPath && renderSettings.branding.logoEnabled) ||
          (renderSettings.watermark.enabled && renderSettings.watermark.text.trim())),
    );

    let musicFilePath: string | null = null;
    const musicId = renderSettings.music.trackId;
    if (musicId && cfg.useMusic) {
      try {
        musicFilePath = await this.shortsMusic.resolveActiveTrackFilePath(musicId);
      } catch {
        this.log.warn(`Music track ${musicId} unavailable for video agent job ${jobId}`);
      }
    }

    const tmpRoot = join(tmpdir(), `ai-inf-agent-${jobId}`);
    const fs = await import('node:fs/promises');
    await fs.mkdir(tmpRoot, { recursive: true });
    const sourcePath = join(tmpRoot, 'agent-source.mp4');
    const outPath = join(tmpRoot, 'agent-final.mp4');

    try {
      await this.render.downloadToFile(job.baseMasterUrl!, sourcePath);
      await this.setProgressMeta(jobId, RENDER_PROGRESS.BRANDING, 'POST_PROCESSING');
      const result = await this.render.finalizeAgentMaster({
        sourceVideoPath: sourcePath,
        outPath,
        logoPath,
        settings: renderSettings,
        musicFilePath,
        applyBranding: brandingNeeded,
      });

      const mp4 = await fs.readFile(result.outputPath);
      await this.setProgressMeta(jobId, RENDER_PROGRESS.UPLOAD, 'CLOUDINARY_UPLOAD');
      const masterUrl = await this.cloudinary.uploadMasterReelBuffer(
        mp4,
        `ai-influencer-master-${jobId}.mp4`,
      );
      await this.render.cleanup(tmpRoot);

      await this.markRenderReady(job, renderSettings, masterUrl, job.baseMasterUrl!, {
        layoutUsed: 'VIDEO_AGENT',
        validationWarnings: [],
      });
    } catch (err) {
      await this.render.cleanup(tmpRoot);
      const failedJob = await this.getJob(jobId);
      if (failedJob.baseMasterUrl?.trim()) {
        this.log.warn(
          `[AI-VIDEO][${jobId}] POSTPROCESS failed — archiving base master (${err instanceof Error ? err.message : String(err)})`,
        );
        await this.archiveVideoFromBaseMaster(failedJob, {
          warning: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      throw err;
    }
  }

  /** Uloží permanentní master z již staženého HeyGen videa — i když postprocess selže. */
  private async archiveVideoFromBaseMaster(
    job: AiInfluencerJobWithRelations,
    options?: { warning?: string },
  ): Promise<void> {
    const masterUrl = job.baseMasterUrl?.trim() || job.avatarStorageUrl?.trim();
    if (!masterUrl) return;
    if (job.finalMasterUrl?.trim() || job.videoUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: job.id },
          data: { status: AiInfluencerReelJobStatus.READY, renderedAt: job.renderedAt ?? new Date() },
        });
      }
      return;
    }

    const cfg = this.settings.getCached();
    const renderSettings = this.buildRenderSettingsForJob(job, cfg);
    await this.markRenderReady(job, renderSettings, masterUrl, masterUrl, {
      layoutUsed: 'VIDEO_AGENT',
      validationWarnings: options?.warning ? [options.warning] : [],
    });
  }

  /** Quick Video Agent test → persistentní galerie záznam. */
  async persistQuickVideoAgentTestArchive(input: {
    storedUrl: string;
    durationSec?: number | null;
    sessionId?: string | null;
    videoId?: string | null;
  }): Promise<{ jobId: string }> {
    const profile = await this.registry.getDefaultProfile();
    const fixedScript = buildFixedVideoAgentTestScript();
    const scriptHash = hashFixedTestScript(fixedScript);
    const cfg = this.settings.getCached();
    const generationMode = resolveVideoGenerationMode(cfg);
    const initialRenderMeta = mergeJobRenderMeta(this.buildInitialJobRenderMeta(), {
      isProductionTest: true,
      testKind: 'VIDEO_AGENT',
      useFixedTestScript: true,
      testDurationSec: 10,
      videoGenerationMode: 'VIDEO_AGENT',
      generationModeUsed: 'VIDEO_AGENT',
      heygenVideoAgentSessionId: input.sessionId ?? undefined,
      heygenVideoAgentVideoId: input.videoId ?? undefined,
      videoAgentMaster: true,
      videoArchived: true,
      archiveCompletedAt: new Date().toISOString(),
    });

    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.READY,
        sourceType: 'ARTICLE',
        isTest: true,
        forceOverride: true,
        estimatedDurationSec: input.durationSec ?? fixedScript.estimatedDuration,
        progressPercent: 100,
        currentStep: 'Test video archivováno',
        scriptJson: fixedScript as object,
        scenesJson: fixedScript.scenes as object,
        spokenText: fixedScript.spokenText,
        spokenTextTts: fixedScript.spokenText,
        captionTitle: fixedScript.captionTitle,
        captionDescription: fixedScript.captionDescription,
        hashtags: fixedScript.hashtags.join(' '),
        scriptHash,
        avatarStorageUrl: input.storedUrl,
        baseMasterUrl: input.storedUrl,
        videoUrl: input.storedUrl,
        finalMasterUrl: input.storedUrl,
        renderedAt: new Date(),
        facebookPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        instagramPublishStatus: ReelPlatformPublishStatus.SKIPPED,
        youtubePublishStatus: ReelPlatformPublishStatus.SKIPPED,
        renderSettingsJson: initialRenderMeta as object,
        timelineEvents: appendTimelineEvent(null, 'TEST_VIDEO_ARCHIVED', generationMode) as object,
      },
    });

    this.log.log(`[AI-VIDEO][${job.id}] ARCHIVE quick test video persisted`);
    return { jobId: job.id };
  }

  private async runAvatarStart(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    if (isActiveVideoAgentJob(meta)) {
      await this.runVideoAgentStart(jobId);
      return;
    }
    if (job.avatarStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.AVATAR_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.AVATAR_READY },
        });
      }
      return;
    }

    if (!job.voiceStorageUrl) throw new Error('Chybí voice URL pro avatar.');

    if (job.profile.avatarProvider === 'HEYGEN') {
      await this.heygen.assertReadyForGeneration(job.profile.avatarId);
    } else {
      const avatarProvider = this.registry.getAvatarProvider(job.profile.avatarProvider);
      if (!avatarProvider.isConfigured()) {
        throw new Error('Avatar provider není nakonfigurován.');
      }
      if (!avatarProvider.isAvatarSelected(job.profile.avatarId)) {
        throw new Error('Avatar provider nemá vybraný avatar.');
      }
    }

    const avatarProvider = this.registry.getAvatarProvider(job.profile.avatarProvider);

    const avatarId = this.registry.resolveAvatarId(job.profile.avatarId);
    const contentKey = `${avatarId}:${job.voiceStorageUrl}`;
    const cached = await this.generationCache.findCached(
      ProviderGenerationType.AVATAR,
      job.avatarHash ?? contentKey,
      avatarProvider.providerId,
    );

    if (cached?.status === ProviderGenerationStatus.READY && cached.storageUrl) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          status: AiInfluencerReelJobStatus.AVATAR_READY,
          avatarStorageUrl: cached.storageUrl,
          avatarHash: cached.contentHash,
          avatarCostEstimated: cached.costEstimated,
        },
      });
      return;
    }

    if (job.avatarExternalJobId && job.status === AiInfluencerReelJobStatus.AVATAR_GENERATING) {
      return;
    }

    const started = await avatarProvider.startGeneration({
      audioUrl: job.voiceStorageUrl,
      avatarId: avatarId ?? undefined,
    });

    const progress = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        avatarExternalJobId: started.externalJobId,
        avatarHash: started.contentHash,
        avatarCostEstimated: started.costEstimatedCzk,
        totalExternalCost: { increment: started.costEstimatedCzk },
        progressPercent: progress.percent,
        currentStep: progress.step,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'HEYGEN_REQUESTED', started.externalJobId),
      },
    });
  }

  private async runAvatarPoll(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const meta = readJobRenderMeta(job.renderSettingsJson);
    if (isActiveVideoAgentJob(meta) || isVideoAgentExternalJobId(job.avatarExternalJobId)) {
      await this.runVideoAgentPoll(jobId);
      return;
    }
    if (job.avatarStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.AVATAR_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.AVATAR_READY },
        });
      }
      return;
    }

    if (!job.avatarExternalJobId) {
      const cfg = this.settings.getCached();
      const mode = inferJobGenerationMode(meta, cfg, {
        voiceStorageUrl: job.voiceStorageUrl,
        avatarExternalJobId: job.avatarExternalJobId,
        baseMasterUrl: job.baseMasterUrl,
      });
      if (mode === 'VIDEO_AGENT') {
        await this.runVideoAgentStart(jobId);
        return;
      }
      throw pipelineError(
        'Chybí externí avatar job ID.',
        'HEYGEN_AVATAR_JOB_ID_MISSING',
        'AVATAR',
      );
    }

    const avatarProvider = this.registry.getAvatarProvider(job.profile.avatarProvider);
    const poll = await avatarProvider.pollGeneration(job.avatarExternalJobId);

    if (poll.status === 'QUEUED' || poll.status === 'GENERATING') {
      const startedAt = job.lastAttemptAt ?? job.updatedAt;
      const elapsed = Date.now() - startedAt.getTime();
      const ratio = Math.min(1, elapsed / (4 * 60 * 1000));
      await this.setProgress(jobId, AiInfluencerReelJobStatus.AVATAR_GENERATING, ratio);
      return;
    }
    if (poll.status === 'FAILED') {
      throw new Error(poll.errorMessage || 'Avatar generování selhalo.');
    }
    if (!poll.videoUrl) throw new Error('Avatar video URL chybí.');

    const buffer = await avatarProvider.downloadResult(poll.videoUrl);
    const videoUrl = await this.cloudinary.uploadVideoBuffer(
      buffer,
      `ai-influencer-avatar-${jobId}.mp4`,
    );

    await this.generationCache.markReady({
      type: ProviderGenerationType.AVATAR,
      contentHash: job.avatarHash ?? job.avatarExternalJobId,
      provider: avatarProvider.providerId,
      jobId,
      storageUrl: videoUrl,
      costEstimated: job.avatarCostEstimated,
      externalJobId: job.avatarExternalJobId,
    });

    const progress = progressForStatus(AiInfluencerReelJobStatus.AVATAR_READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_READY,
        avatarStorageUrl: videoUrl,
        progressPercent: progress.percent,
        currentStep: progress.step,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'HEYGEN_COMPLETED'),
      },
    });
  }

  async publishToFacebook(jobId: string, options?: { manualAdminApproval?: boolean }) {
    return this.publish.publishToFacebook(jobId, options);
  }

  async publishToYoutube(jobId: string, options?: { manualAdminApproval?: boolean }) {
    const cfg = this.settings.getCached();
    return this.publish.publishToYoutube(jobId, cfg.youtubePrivacyStatus, options);
  }

  async publishToInstagram(jobId: string, options?: { manualAdminApproval?: boolean }) {
    return this.publish.publishToInstagram(jobId, options);
  }

  async publishToPortal(jobId: string, options?: { manualAdminApproval?: boolean }) {
    return this.publish.publishToPortal(jobId, options);
  }

  async publishManual(
    jobId: string,
    body: {
      channels: Array<'facebook' | 'instagram' | 'youtube' | 'portal'>;
      manualAdminApproval?: boolean;
    },
  ) {
    return this.publish.publishManual(jobId, body);
  }

  async regenerateRender(jobId: string): Promise<AiInfluencerJobWithRelations> {
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        videoUrl: null,
        finalMasterUrl: null,
        validationPassed: null,
        validationErrors: undefined,
        status: AiInfluencerReelJobStatus.AVATAR_READY,
        errorCode: null,
        errorMessage: null,
      },
    });
    await this.advanceJob(jobId);
    return this.getJob(jobId);
  }

  private async runAutoPublish(jobId: string): Promise<void> {
    const cfg = this.settings.getCached();
    const job = await this.getJob(jobId);
    const publishMeta = readJobRenderMeta(job.renderSettingsJson);
    if (shouldBlockAutoPublish(publishMeta)) return;
    if (job.isTest || isProductionTestJob(job.renderSettingsJson)) return;
    if (!job.finalMasterUrl && !job.videoUrl) return;

    const publishOverrides = (job.renderSettingsJson as { propertyPublish?: Record<string, boolean | undefined> } | null)
      ?.propertyPublish;

    const fbAuto =
      (publishOverrides?.facebook ?? cfg.autoPublishFacebook) &&
      cfg.facebookPublishMode === 'AUTO_AFTER_GENERATION';
    const igAuto =
      (publishOverrides?.instagram ?? cfg.autoPublishInstagram) &&
      cfg.instagramPublishMode === 'AUTO_AFTER_GENERATION';
    const ytAuto =
      (publishOverrides?.youtube ?? cfg.autoPublishYoutube) &&
      cfg.youtubePublishMode === 'AUTO_AFTER_GENERATION';
    const portalAuto =
      (publishOverrides?.portal ?? cfg.autoPublishPortal) &&
      cfg.portalPublishMode === 'AUTO_AFTER_GENERATION';
    if (!fbAuto && !igAuto && !ytAuto && !portalAuto) return;

    let fbOk = job.facebookPublishStatus === ReelPlatformPublishStatus.PUBLISHED;
    let igOk = job.instagramPublishStatus === ReelPlatformPublishStatus.PUBLISHED;
    let ytOk = job.youtubePublishStatus === ReelPlatformPublishStatus.PUBLISHED;
    let portalOk = Boolean(job.postId);

    const fbRateLimited =
      job.facebookPublishStatus === ReelPlatformPublishStatus.RATE_LIMITED ||
      job.facebookPublishStatus === ReelPlatformPublishStatus.QUOTA_EXCEEDED;

    if (fbAuto && !fbOk && fbRateLimited && shouldRetryFacebookPublish(job)) {
      try {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: {
            renderSettingsJson: nextFacebookPublishRetryMeta(job.renderSettingsJson) as object,
          },
        });
        await this.publish.publishToFacebook(jobId);
        fbOk = true;
      } catch (err) {
        this.log.warn(`Auto Facebook publish retry failed for ${jobId}: ${err}`);
      }
    }

    if (fbAuto && !fbOk && !fbRateLimited) {
      try {
        await this.publish.publishToFacebook(jobId);
        fbOk = true;
      } catch (err) {
        this.log.warn(`Auto Facebook publish failed for ${jobId}: ${err}`);
      }
    }
    if (igAuto && !igOk) {
      try {
        await this.publish.publishToInstagram(jobId);
        igOk = true;
      } catch (err) {
        this.log.warn(`Auto Instagram publish failed for ${jobId}: ${err}`);
      }
    }
    if (ytAuto && !ytOk) {
      try {
        await this.publish.publishToYoutube(jobId, cfg.youtubePrivacyStatus);
        ytOk = true;
      } catch (err) {
        this.log.warn(`Auto YouTube publish failed for ${jobId}: ${err}`);
      }
    }
    if (portalAuto && !portalOk) {
      try {
        await this.publish.publishToPortal(jobId);
        portalOk = true;
      } catch (err) {
        this.log.warn(`Auto XXREALIT Shorts publish failed for ${jobId}: ${err}`);
      }
    }

    await this.publish.syncOverallPublishStatus(jobId);
  }

  async acceptUnbrandedMaster(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (!job.baseMasterUrl?.trim()) {
      throw new BadRequestException('Chybí base master — nelze použít video bez brandingu.');
    }
    if (!job.voiceStorageUrl?.trim()) {
      throw new BadRequestException('Chybí voice track pro finální mux.');
    }

    const cfg = this.settings.getCached();
    const renderSettings = this.buildRenderSettingsForJob(job, cfg);
    const musicId = renderSettings.music.trackId;
    let musicFilePath: string | null = null;
    if (musicId) {
      try {
        musicFilePath = await this.shortsMusic.resolveActiveTrackFilePath(musicId);
      } catch {
        /* optional */
      }
    }

    const tmpRoot = join(tmpdir(), `ai-inf-unbranded-${jobId}`);
    const voicePath = join(tmpRoot, 'voice.mp3');
    const basePath = join(tmpRoot, 'base.mp4');
    await this.render.downloadToFile(job.baseMasterUrl, basePath);
    await this.render.downloadToFile(job.voiceStorageUrl, voicePath);
    const targetDuration = Math.max(8, job.estimatedDurationSec ?? 30);

    const outputPath = await this.render.muxFinalFromBase({
      baseVideoPath: basePath,
      voiceAudioPath: voicePath,
      musicFilePath,
      settings: renderSettings,
      targetDuration,
      tmpRoot,
    });

    const mp4 = await import('node:fs/promises').then((fs) => fs.readFile(outputPath));
    const masterUrl = await this.cloudinary.uploadMasterReelBuffer(
      mp4,
      `ai-influencer-unbranded-${jobId}.mp4`,
    );
    await this.render.cleanup(tmpRoot);

    const readyProgress = progressForStatus(AiInfluencerReelJobStatus.READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.READY,
        videoUrl: masterUrl,
        finalMasterUrl: masterUrl,
        failedStage: null,
        errorCode: null,
        errorMessage: null,
        validationPassed: true,
        validationErrors: ['Manuálně schváleno bez brandingu (admin override).'],
        progressPercent: readyProgress.percent,
        currentStep: readyProgress.step,
        renderedAt: new Date(),
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'UNBRANDED_ACCEPTED'),
      },
    });
    return this.getJob(jobId);
  }

  private async handleBrandingFailure(
    jobId: string,
    job: AiInfluencerJobWithRelations,
    err: unknown,
    baseMasterUrl: string,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const code = errorCode(err) ?? 'BRANDING_FAILED';
    const diagnostics =
      err instanceof FfmpegRenderError && err.diagnostics
        ? ` | filter=${err.diagnostics.filterGraphUsed}`
        : '';
    const progress = progressForStatus(AiInfluencerReelJobStatus.FAILED);

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.FAILED,
        failedStage: 'BRANDING_RENDER',
        errorCode: code,
        errorMessage: `${message}${diagnostics}`,
        baseMasterUrl,
        videoUrl: baseMasterUrl,
        finalMasterUrl: null,
        progressPercent: progress.percent,
        currentStep: 'Branding videa selhalo',
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'BRANDING_FAILED', code),
      },
    });
    this.log.warn(`Job ${jobId} branding failed, base master preserved: ${message}`);
  }

  private buildRenderSettingsForJob(
    job: AiInfluencerJobWithRelations,
    cfg: ReturnType<AiInfluencerSettingsService['getCached']>,
  ) {
    const profile = job.profile;
    const renderSettings = mergeRenderSettings(
      (job.renderSettingsJson as object) ??
        (profile.renderSettingsJson as object) ??
        undefined,
    );
    renderSettings.music.trackId =
      cfg.useMusic === false ? null : job.musicTrackId ?? cfg.defaultMusicTrackId ?? null;
    if (!cfg.useMusic) {
      renderSettings.music.musicVolume = 0;
    } else {
      renderSettings.music.musicVolume = Math.min(renderSettings.music.musicVolume, 0.1);
      renderSettings.music.ducking = true;
    }
    renderSettings.subtitles.enabled = cfg.useSubtitles !== false;
    renderSettings.layout =
      cfg.avatarFraming === 'medium'
        ? 'AVATAR_CONTENT'
        : cfg.avatarFraming === 'closeup_mix'
          ? 'SMART_AUTO'
          : 'AVATAR_FULLSCREEN';
    renderSettings.preset =
      (profile.renderPreset as AiInfluencerRenderSettings['preset']) ?? 'modern_xxrealit';
    if (!cfg.useLogo) {
      renderSettings.branding.logoEnabled = false;
    }
    if (cfg.brandingEnabled && cfg.useLogo) {
      renderSettings.branding.logoEnabled = cfg.logoEnabled;
      renderSettings.branding.logoOpacity = cfg.logoOpacity;
      const logoSize = Math.round((REEL_CANVAS_WIDTH * cfg.logoScalePercent) / 100);
      renderSettings.branding.logoSize = logoSize;
      const pad = cfg.logoPaddingPx;
      if (cfg.logoPosition === 'top_left') {
        renderSettings.branding.logoX = pad;
        renderSettings.branding.logoY = pad;
      } else if (cfg.logoPosition === 'top_right') {
        renderSettings.branding.logoX = REEL_CANVAS_WIDTH - logoSize - pad;
        renderSettings.branding.logoY = pad;
      } else if (cfg.logoPosition === 'bottom_left') {
        renderSettings.branding.logoX = pad;
        renderSettings.branding.logoY = REEL_CANVAS_HEIGHT - logoSize - pad - 200;
      } else {
        renderSettings.branding.logoX = REEL_CANVAS_WIDTH - logoSize - pad;
        renderSettings.branding.logoY = REEL_CANVAS_HEIGHT - logoSize - pad - 200;
      }
      renderSettings.watermark.enabled = cfg.websiteWatermarkEnabled;
      renderSettings.watermark.text = cfg.websiteText;
      renderSettings.watermark.opacity = cfg.websiteWatermarkOpacity;
      renderSettings.watermark.fontSize = cfg.websiteWatermarkFontSize;
    }
    return renderSettings;
  }

  private async runRender(jobId: string): Promise<void> {
    const existing = await this.getJob(jobId);
    if (existing.finalMasterUrl?.trim() || existing.videoUrl?.trim()) {
      if (existing.status !== AiInfluencerReelJobStatus.READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.READY, renderedAt: new Date() },
        });
      }
      return;
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { status: AiInfluencerReelJobStatus.RENDERING },
    });
    await this.setProgress(jobId, AiInfluencerReelJobStatus.RENDERING, undefined, 'COMPOSITOR_STARTED');

    this.cloudinary.assertConfigured();

    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const agentMeta = readJobRenderMeta(job.renderSettingsJson);
    const generationMode = inferJobGenerationMode(agentMeta, cfg, {
      voiceStorageUrl: job.voiceStorageUrl,
      avatarExternalJobId: job.avatarExternalJobId,
      baseMasterUrl: job.baseMasterUrl,
    });
    this.log.log(`Job ${jobId} runRender generationMode=${generationMode}`);

    const videoAgentMasterReady =
      job.baseMasterUrl?.trim() &&
      (agentMeta.videoAgentMaster ||
        isActiveVideoAgentJob(agentMeta) ||
        generationMode === 'VIDEO_AGENT');

    if (videoAgentMasterReady) {
      await this.runVideoAgentPostProcess(jobId);
      return;
    }

    if (generationMode === 'VIDEO_AGENT') {
      throw Object.assign(new Error('Video Agent master video chybí pro render.'), {
        code: 'RENDER_INPUT_MISSING',
      });
    }

    if (!job.avatarStorageUrl || !job.voiceStorageUrl) {
      throw Object.assign(new Error('Chybí avatar nebo voice pro render (AVATAR fallback).'), {
        code: 'RENDER_INPUT_MISSING',
      });
    }

    const renderSettings = this.buildRenderSettingsForJob(job, cfg);
    const scenes = (job.scenesJson as ReelScriptPayload['scenes'] | null) ?? [];
    const logoPath = cfg.logoEnabled ? resolveShortsLogoPath() : null;

    let musicFilePath: string | null = null;
    const musicId = renderSettings.music.trackId;
    if (musicId) {
      try {
        musicFilePath = await this.shortsMusic.resolveActiveTrackFilePath(musicId);
      } catch {
        this.log.warn(`Music track ${musicId} unavailable for job ${jobId}`);
      }
    }

    if (job.baseMasterUrl?.trim() && cfg.brandingEnabled) {
      await this.setProgressMeta(jobId, RENDER_PROGRESS.BRANDING, 'BRANDING_RENDER');
      try {
        const brandingResult = await this.render.applyBrandingFromUrl({
          baseVideoUrl: job.baseMasterUrl,
          voiceAudioUrl: job.voiceStorageUrl,
          musicFilePath,
          logoPath,
          settings: renderSettings,
          scenes,
          hookText: job.selectedHook ?? job.captionTitle ?? '',
          spokenText: job.spokenText ?? undefined,
        });

        const mp4 = await import('node:fs/promises').then((fs) =>
          fs.readFile(brandingResult.outputPath),
        );
        await this.setProgressMeta(jobId, RENDER_PROGRESS.UPLOAD, 'CLOUDINARY_UPLOAD');
        const masterUrl = await this.cloudinary.uploadMasterReelBuffer(
          mp4,
          `ai-influencer-master-${jobId}.mp4`,
        );
        await this.render.cleanup(brandingResult.tmpRoot);
        await this.markRenderReady(job, renderSettings, masterUrl, job.baseMasterUrl, brandingResult);
      } catch (err) {
        await this.handleBrandingFailure(jobId, job, err, job.baseMasterUrl);
      }
      return;
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'COMPOSITOR_STARTED'),
      },
    });

    const tmpRoot = join(tmpdir(), `ai-inf-render-${jobId}`);
    const avatarPath = join(tmpRoot, 'avatar.mp4');
    const voicePath = join(tmpRoot, 'voice.mp3');
    await this.setProgressMeta(jobId, RENDER_PROGRESS.DOWNLOAD, 'DOWNLOAD_SOURCES');
    await this.render.downloadToFile(job.avatarStorageUrl, avatarPath);
    await this.render.downloadToFile(job.voiceStorageUrl, voicePath);
    await this.setProgressMeta(jobId, RENDER_PROGRESS.COMPOSITING, 'COMPOSITING');

    let result;
    const brandingNeeded =
      cfg.brandingEnabled &&
      ((logoPath && renderSettings.branding.logoEnabled) ||
        (renderSettings.watermark.enabled && renderSettings.watermark.text.trim()));

    try {
      if (brandingNeeded) {
        result = await this.render.renderBase({
          avatarVideoPath: avatarPath,
          voiceAudioPath: voicePath,
          scenes,
          hookText: job.selectedHook ?? job.captionTitle ?? '',
          spokenText: job.spokenText ?? undefined,
          musicFilePath,
          logoPath,
          settings: renderSettings,
        });

        const fs = await import('node:fs/promises');
        const baseMp4 = await fs.readFile(result.baseVideoPath);
        const baseMasterUrl = await this.cloudinary.uploadMasterReelBuffer(
          baseMp4,
          `ai-influencer-base-${jobId}.mp4`,
        );
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { baseMasterUrl },
        });

        let outputPath: string;
        try {
          await this.setProgressMeta(jobId, RENDER_PROGRESS.BRANDING, 'BRANDING_RENDER');
          outputPath = await this.render.finalizeBranding({
            baseVideoPath: result.baseVideoPath,
            voiceAudioPath: voicePath,
            musicFilePath,
            logoPath,
            settings: renderSettings,
            targetDuration: result.durationSec ?? 30,
            tmpRoot: result.tmpRoot,
          });
        } catch (brandingErr) {
          await this.render.cleanup(tmpRoot);
          await this.handleBrandingFailure(jobId, job, brandingErr, baseMasterUrl);
          return;
        }
        result = { ...result, outputPath };
      } else {
        result = await this.render.render({
          avatarVideoPath: avatarPath,
          voiceAudioPath: voicePath,
          scenes,
          hookText: job.selectedHook ?? job.captionTitle ?? '',
          spokenText: job.spokenText ?? undefined,
          musicFilePath,
          logoPath,
          settings: renderSettings,
        });
      }
    } catch (err) {
      if (brandingNeeded && err instanceof FfmpegRenderError && err.stage === 'BRANDING_RENDER') {
        const savedBase =
          (
            await this.prisma.aiInfluencerReelJob.findUnique({
              where: { id: jobId },
              select: { baseMasterUrl: true },
            })
          )?.baseMasterUrl ?? null;
        if (savedBase) {
          await this.handleBrandingFailure(jobId, job, err, savedBase);
          await this.render.cleanup(tmpRoot);
          return;
        }
      }
      throw err;
    }

    const fs = await import('node:fs/promises');
    const baseMasterUrl =
      job.baseMasterUrl ??
      (await this.prisma.aiInfluencerReelJob.findUnique({
        where: { id: jobId },
        select: { baseMasterUrl: true },
      }))?.baseMasterUrl;

    if (!baseMasterUrl && !brandingNeeded) {
      const baseMp4 = await fs.readFile(result.baseVideoPath);
      const uploadedBase = await this.cloudinary.uploadMasterReelBuffer(
        baseMp4,
        `ai-influencer-base-${jobId}.mp4`,
      );
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { baseMasterUrl: uploadedBase },
      });
    }

    const mp4 = await fs.readFile(result.outputPath);
    await this.setProgressMeta(jobId, RENDER_PROGRESS.UPLOAD, 'CLOUDINARY_UPLOAD');
    const masterUrl = await this.cloudinary.uploadMasterReelBuffer(
      mp4,
      `ai-influencer-master-${jobId}.mp4`,
    );
    await this.render.cleanup(result.tmpRoot);
    await this.render.cleanup(tmpRoot);

    const resolvedBase =
      baseMasterUrl ??
      (
        await this.prisma.aiInfluencerReelJob.findUnique({
          where: { id: jobId },
          select: { baseMasterUrl: true },
        })
      )?.baseMasterUrl ??
      masterUrl;

    await this.markRenderReady(job, renderSettings, masterUrl, resolvedBase, result);
  }

  private async markRenderReady(
    job: AiInfluencerJobWithRelations,
    renderSettings: ReturnType<typeof mergeRenderSettings>,
    masterUrl: string,
    baseMasterUrl: string,
    result: { layoutUsed: string; validationWarnings: string[] },
  ): Promise<void> {
    const cfg = this.settings.getCached();
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const generationMode = inferJobGenerationMode(meta, cfg, {
      voiceStorageUrl: job.voiceStorageUrl,
      avatarExternalJobId: job.avatarExternalJobId,
      baseMasterUrl: job.baseMasterUrl,
    });
    const scenes = (job.scenesJson as ReelScriptPayload['scenes'] | null) ?? [];
    const pronunciationRules = meta.pronunciationRulesApplied ?? [];

    const quality = runQualityGate({
      scenes,
      durationSec: job.estimatedDurationSec ?? cfg.targetDurationSec,
      generationMode,
      pronunciationRulesApplied: pronunciationRules,
      spokenTextSample: job.spokenText,
      skipForTest: job.isTest || isProductionTestJob(job.renderSettingsJson),
    });

    const qualityMeta = mergeJobRenderMeta(job.renderSettingsJson, {
      qualityMetrics: quality.metrics,
      generationModeUsed: generationMode,
      videoArchived: true,
      archiveCompletedAt: new Date().toISOString(),
    });

    if (!quality.pass) {
      const progress = progressForStatus(AiInfluencerReelJobStatus.FAILED);
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: job.id },
        data: {
          status: AiInfluencerReelJobStatus.FAILED,
          failedStage: 'QUALITY',
          errorCode: 'QUALITY_REVIEW_REQUIRED',
          errorMessage: quality.failures.join('; '),
          videoUrl: masterUrl,
          finalMasterUrl: masterUrl,
          baseMasterUrl,
          renderSettingsJson: qualityMeta as object,
          validationPassed: false,
          validationErrors: quality.failures,
          renderedAt: new Date(),
          progressPercent: progress.percent,
          currentStep: 'Quality gate — vyžaduje kontrolu',
          timelineEvents: appendTimelineEvent(job.timelineEvents, 'QUALITY_GATE_FAILED'),
        },
      });
      this.log.warn(`Job ${job.id} quality gate failed: ${quality.failures.join('; ')}`);
      return;
    }

    const timeline = appendTimelineEvent(
      appendTimelineEvent(job.timelineEvents, 'MASTER_COMPLETED', `layout=${result.layoutUsed}`),
      'VALIDATION_PASSED',
    );

    const readyProgress = progressForStatus(AiInfluencerReelJobStatus.READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: job.id },
      data: {
        status: AiInfluencerReelJobStatus.READY,
        videoUrl: masterUrl,
        finalMasterUrl: masterUrl,
        baseMasterUrl,
        renderPreset: renderSettings.preset,
        renderSettingsJson: qualityMeta as object,
        validationPassed: true,
        validationErrors: result.validationWarnings.length ? result.validationWarnings : undefined,
        thumbnailUrl: job.thumbnailUrl ?? job.article?.ogImageUrl ?? job.property?.mainImage ?? job.property?.thumbnailUrl,
        renderedAt: new Date(),
        failedStage: null,
        errorCode: null,
        errorMessage: null,
        timelineEvents: appendTimelineEvent(timeline, 'CLOUDINARY_UPLOADED'),
        progressPercent: readyProgress.percent,
        currentStep: readyProgress.step,
      },
    });

    await this.runAutoPublish(job.id);
    await this.syncTopicCandidateVideoCreated(job.id);
  }

  private async syncTopicCandidateVideoCreated(jobId: string): Promise<void> {
    const candidate = await this.prisma.aiInfluencerTopicCandidate.findFirst({
      where: { createdVideoJobId: jobId },
      select: { id: true, status: true },
    });
    if (!candidate || candidate.status === AiInfluencerTopicCandidateStatus.VIDEO_CREATED) return;
    await this.prisma.aiInfluencerTopicCandidate.update({
      where: { id: candidate.id },
      data: { status: AiInfluencerTopicCandidateStatus.VIDEO_CREATED },
    });
  }

  private async resolvePropertyScenes(
    propertyId: string,
    script: ReelScriptPayload,
  ): Promise<ReelScriptPayload['scenes']> {
    const propertyMedia = await this.propertyMediaProvider.loadPropertyMedia(propertyId);
    const scenes = [...script.scenes];
    if (!propertyMedia) return scenes;
    for (const scene of scenes) {
      const media = await this.propertyMediaProvider.resolveSceneMedia(propertyMedia, scene);
      if (media) {
        scene.mediaUrl = media.url;
        scene.generatedAsset = media.generatedAsset;
      }
    }
    return scenes;
  }

  private async resolveScenes(
    article: {
      id: string;
      title: string;
      perex: string | null;
      bodyMarkdown: string | null;
      category: string;
      region: string | null;
      publishedAt: Date | null;
      ogImageUrl: string | null;
      factClaimsJson: unknown;
    },
    script: ReelScriptPayload,
  ): Promise<ReelScriptPayload['scenes']> {
    const scenes = [...script.scenes];
    const articleForMedia = {
      id: article.id,
      title: article.title,
      perex: article.perex ?? '',
      bodyMarkdown: article.bodyMarkdown ?? '',
      category: article.category,
      region: article.region,
      publishedAt: article.publishedAt,
      ogImageUrl: article.ogImageUrl,
      factClaimsJson: article.factClaimsJson,
    };
    for (const scene of scenes) {
      const media = await this.mediaProvider.resolveSceneMedia(articleForMedia, scene);
      if (media) {
        scene.mediaUrl = media.url;
        scene.generatedAsset = media.generatedAsset;
      }
    }
    return scenes;
  }

  private buildInitialJobRenderMeta(extra?: Record<string, unknown>): Record<string, unknown> {
    const cfg = this.settings.getCached();
    const mode = resolveVideoGenerationMode(cfg);
    const voiceEngine = mode === 'VIDEO_AGENT' ? 'HEYGEN' : 'ELEVENLABS';
    return mergeJobRenderMeta(extra ?? {}, {
      videoGenerationMode: mode,
      generationModeUsed: mode,
      voiceEngine,
      providerJobType: mode === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'AVATAR',
      allowAvatarFallback: cfg.allowVideoAgentFallback,
      videoStyle: cfg.videoStyle,
      targetDurationSec: cfg.targetDurationSec,
      avatarFrequency: cfg.avatarFrequency,
    });
  }

  private enrichJobRow<T extends JobDisplayInput>(
    job: T,
    cfg: ReturnType<AiInfluencerSettingsService['getCached']>,
    workerElevenConfigured: boolean,
  ) {
    const display = buildJobAdminDisplay(job, cfg, {
      workerElevenConfigured,
      heygenConfigured: this.heygenConfig.isApiKeyConfigured(),
    });
    const meta = readJobRenderMeta(job.renderSettingsJson);
    const providerSessionId =
      meta.heygenVideoAgentSessionId ?? parseVideoAgentSessionId(job.avatarExternalJobId);
    return {
      ...job,
      display,
      generationMode: display.generationMode,
      retryLabel: display.retryLabel,
      errorKind: display.errorKind,
      hasMasterVideo: display.hasMasterVideo,
      providerJobIdMasked: maskProviderJobId(providerSessionId),
      canReconcileHeyGen: Boolean(providerSessionId) && !display.hasMasterVideo,
    };
  }

  async checkProductionPreflight(options?: { requireScriptProvider?: boolean }): Promise<{
    ok: boolean;
    scriptProviderReady: boolean;
    videoAgentReady: boolean;
    rendererReady: boolean;
    storageReady: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    const requireScriptProvider = options?.requireScriptProvider ?? true;
    let scriptProviderReady = true;

    if (requireScriptProvider) {
      const resolved = await this.aiProvider.resolveScriptProvider();
      scriptProviderReady = resolved.usable;
      if (!scriptProviderReady) {
        reasons.push(resolved.reason);
      }
    }

    const cfg = this.settings.getCached();
    const profile = await this.registry.getDefaultProfile();
    const [videoAgentReadiness, heygenReadiness, storageDiag, elevenReadiness] = await Promise.all([
      this.videoAgent.getReadiness(),
      this.heygen.getGenerationReadiness(profile.avatarId),
      Promise.resolve(this.cloudinary.getDiagnostics()),
      this.elevenLabs.getGenerationReadiness(profile.voiceId),
    ]);
    const videoAgentCanonical = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: videoAgentReadiness.available,
      heygenApiKeyPresence: heygenReadiness.apiKeyPresence,
      heygenGenerationReady: heygenReadiness.ready,
    });
    const rendererReadiness = getRendererRuntimeReadiness();
    const videoAgentReady = videoAgentCanonical.ready;
    const rendererReady = rendererReadiness.ready;
    const storageReady = storageDiag.configured;

    if (!videoAgentReady) {
      reasons.push(videoAgentCanonical.message ?? 'Video Agent není připraven.');
    }
    if (!rendererReady) {
      reasons.push(rendererReadiness.message ?? 'Renderer není připraven.');
    }
    if (!storageReady) {
      reasons.push('Cloudinary storage není nakonfigurován.');
    }

    const production = computeProductionReadiness({
      settings: cfg,
      storageConfigured: storageDiag.configured,
      heygenReady: heygenReadiness.ready,
      videoAgentAvailable: videoAgentReadiness.available,
      elevenReady: elevenReadiness.ready,
      elevenTtsReady: elevenReadiness.ready,
    });
    if (!production.ready) {
      for (const reason of production.reasons) {
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }

    return {
      ok: reasons.length === 0,
      scriptProviderReady,
      videoAgentReady,
      rendererReady,
      storageReady,
      reasons,
    };
  }

  private async assertProductionReadyForNewJob(options?: { requireScriptProvider?: boolean }): Promise<void> {
    const cfg = await this.settings.getSettings();
    const profile = await this.registry.getDefaultProfile();
    const requireScriptProvider = options?.requireScriptProvider ?? true;

    if (requireScriptProvider) {
      try {
        await this.aiProvider.assertScriptGenerationReady();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException({
          message,
          code: errorCode(err) ?? 'AI_PROVIDER_DISABLED',
          settingsPath: '/admin/marketing/ai-centrum',
        });
      }
    }

    const [elevenReadiness, heygenReadiness, videoAgentReadiness] = await Promise.all([
      this.elevenLabs.getGenerationReadiness(profile.voiceId),
      this.heygen.getGenerationReadiness(profile.avatarId),
      this.videoAgent.getReadiness(),
    ]);
    const storageDiag = this.cloudinary.getDiagnostics();
    const production = computeProductionReadiness({
      settings: cfg,
      storageConfigured: storageDiag.configured,
      heygenReady: heygenReadiness.ready,
      videoAgentAvailable: videoAgentReadiness.available,
      elevenReady: elevenReadiness.ready,
      elevenTtsReady: elevenReadiness.ready,
    });
    const videoAgentCanonical = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: videoAgentReadiness.available,
      heygenApiKeyPresence: heygenReadiness.apiKeyPresence,
      heygenGenerationReady: heygenReadiness.ready,
    });
    const rendererReadiness = getRendererRuntimeReadiness();
    const blockers = [
      ...production.reasons,
      ...(videoAgentCanonical.ready ? [] : [videoAgentCanonical.message ?? 'Video Agent není připraven']),
      ...(rendererReadiness.ready ? [] : [rendererReadiness.message ?? 'Renderer není připraven']),
    ];

    if (blockers.length === 0) return;

    throw new BadRequestException({
      message: blockers.join('; '),
      code: 'AI_INFLUENCER_NOT_READY',
      reasons: blockers,
      mode: production.mode,
      elevenRequired: production.elevenRequired,
    });
  }

  private async failJob(
    jobId: string,
    stage: AiInfluencerReelJobStatus,
    code: string | null,
    message: string,
    err?: unknown,
  ): Promise<void> {
    const job = await this.getJob(jobId);
    const resolvedCode = errorCode(err) ?? code;
    let failedStage = failedStageLabel(stage, err ?? { message }, message);
    failedStage = resolveFailedStage(failedStage, message, resolvedCode) ?? failedStage;

    const attempts = job.attemptCount + 1;
    const transient = isTransientError(err ?? { message });
    const auth = isAuthError(err ?? { message });

    if (transient && !auth && attempts < 4) {
      const delay = retryDelayMs(attempts);
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: {
          attemptCount: attempts,
          nextRetryAt: new Date(Date.now() + delay),
          failedStage,
          errorCode: resolvedCode,
          errorMessage: `${message} — retry ${attempts}/3 za ${Math.round(delay / 1000)}s`,
          lastAttemptAt: new Date(),
          timelineEvents: appendTimelineEvent(job.timelineEvents, 'RETRY_SCHEDULED', failedStage),
        },
      });
      this.log.warn(`Job ${jobId} scheduled retry ${attempts} at ${failedStage}: ${message}`);
      return;
    }

    const progress = progressForStatus(AiInfluencerReelJobStatus.FAILED);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.FAILED,
        failedStage,
        errorCode: resolvedCode,
        errorMessage: message,
        lastAttemptAt: new Date(),
        attemptCount: attempts,
        progressPercent: progress.percent,
        currentStep:
          failedStage === 'BRANDING_RENDER'
            ? 'Branding videa selhalo'
            : `Generování selhalo · ${failedStage}`,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'FAILED', failedStage),
      },
    });
    this.log.warn(`Job ${jobId} failed at ${failedStage}: ${message}`);
  }
}
