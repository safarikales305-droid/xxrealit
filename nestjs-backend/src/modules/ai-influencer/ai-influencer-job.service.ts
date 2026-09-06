import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiInfluencerReelJobStatus,
  NewsArticleStatus,
  Prisma,
  ProviderGenerationStatus,
  ProviderGenerationType,
  ReelPlatformPublishStatus,
} from '@prisma/client';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { mergeRenderSettings, REEL_CANVAS_HEIGHT, REEL_CANVAS_WIDTH, type AiInfluencerRenderSettings } from './ai-influencer-render.types';
import { appendTimelineEvent } from './ai-influencer-timeline.util';
import {
  isAuthError,
  isTransientError,
  progressForStatus,
  RENDER_PROGRESS,
  retryDelayMs,
  type ProgressMeta,
} from './ai-influencer-progress.util';
import { resumeJobStatus, resolveFailedStage } from './ai-influencer-retry.util';
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
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import {
  buildHeyGenVideoAgentPrompt,
  collectStoryboardMediaUrls,
} from './heygen-video-agent-prompt.util';
import {
  inferJobGenerationMode,
  isActiveVideoAgentJob,
  isVideoAgentExternalJobId,
  mergeJobRenderMeta,
  parseVideoAgentSessionId,
  readJobRenderMeta,
  resolveVideoGenerationMode,
  toVideoAgentExternalJobId,
  videoAgentPollRatio,
  videoAgentTimedOut,
} from './ai-influencer-video-agent.util';
import { ProviderGenerationService } from './provider-generation.service';
import type { ReelScriptPayload } from './ai-influencer.types';
import { validateAndNormalizeStoryboard } from './ai-influencer-storyboard.util';
import { FfmpegRenderError } from './ai-influencer-ffmpeg.util';

type AiInfluencerJobWithRelations = Prisma.AiInfluencerReelJobGetPayload<{
  include: {
    article: true;
    property: true;
    profile: true;
    candidate: true;
  };
}>;

function errorCode(err: unknown): string | null {
  if (err instanceof FfmpegRenderError) {
    if (err.code === 'WATERMARK_FAILED') return 'WATERMARK_FAILED';
    if (err.stage === 'BRANDING_RENDER') return err.code === 'BRANDING_RENDER_ERROR' ? 'BRANDING_FAILED' : err.code;
    return err.code;
  }
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
}

function failedStageLabel(
  stage: AiInfluencerReelJobStatus,
  err: unknown,
  message: string,
): string {
  if (err instanceof FfmpegRenderError) {
    return err.stage === 'BRANDING_RENDER' ? 'BRANDING_RENDER' : 'RENDER';
  }
  if (/elevenlabs|eleven.?labs/i.test(message)) return 'VOICE';
  if (stage === AiInfluencerReelJobStatus.VOICE_READY) {
    if (/heygen|avatar|HEYGEN/i.test(message)) return 'AVATAR';
  }
  if (stage === AiInfluencerReelJobStatus.VOICE_GENERATING) return 'VOICE';
  if (stage === AiInfluencerReelJobStatus.AVATAR_GENERATING) {
    if (/video agent|VIDEO_AGENT/i.test(message)) return 'AVATAR';
    return 'AVATAR';
  }
  if (stage === AiInfluencerReelJobStatus.RENDERING) {
    if (/branding|watermark|logo|drawtext|filter/i.test(message)) return 'BRANDING_RENDER';
    return 'RENDER';
  }
  if (
    stage === AiInfluencerReelJobStatus.SCRIPT_GENERATING ||
    stage === AiInfluencerReelJobStatus.CANDIDATE
  ) {
    if (/voice|tts|hlas/i.test(message)) return 'VOICE';
    return 'SCRIPT';
  }
  if (stage === AiInfluencerReelJobStatus.PUBLISHING) return 'PUBLISH';
  if (/heygen|avatar/i.test(message)) return 'AVATAR';
  if (/voice|tts|hlas/i.test(message)) return 'VOICE';
  return 'RENDER';
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
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly openAi: OpenAiService,
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
    return jobs.map((j) => ({
      ...j,
      article: j.article
        ? {
            ...j.article,
            title: decodeHtmlEntities(j.article.title),
          }
        : null,
      property: j.property
        ? {
            ...j.property,
            title: decodeHtmlEntities(j.property.title),
          }
        : null,
    }));
  }

  async listActiveJobs() {
    const active = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
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
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        article: { select: { id: true, title: true } },
        property: { select: { id: true, title: true } },
        candidate: { select: { reelPotentialScore: true } },
      },
    });
    return active.map((j) => ({
      id: j.id,
      status: j.status,
      progressPercent: j.progressPercent,
      currentStep: j.currentStep,
      errorMessage: j.errorMessage,
      failedStage: j.failedStage,
      skipReason: j.skipReason,
      facebookPublishStatus: j.facebookPublishStatus,
      youtubePublishStatus: j.youtubePublishStatus,
      articleTitle: decodeHtmlEntities(j.article?.title ?? j.property?.title ?? 'Inzerát'),
      score: j.candidate?.reelPotentialScore ?? null,
      updatedAt: j.updatedAt,
    }));
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
    return job;
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
    options?: { force?: boolean },
  ): Promise<AiInfluencerJobWithRelations> {
    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || article.status !== NewsArticleStatus.PUBLISHED) {
      throw new BadRequestException('Článek není publikovaný.');
    }
    const profile = await this.registry.getDefaultProfile();
    await this.assertProductionReadyForNewJob();
    const initialRenderMeta = this.buildInitialJobRenderMeta();
    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        articleId,
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.EVALUATING,
        forceOverride: options?.force === true,
        progressPercent: 5,
        currentStep: 'Příprava',
        renderSettingsJson: initialRenderMeta as object,
      },
    });
    await this.advanceJob(job.id);
    return this.getJob(job.id);
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
    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        propertyId,
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.SCRIPT_GENERATING,
        sourceType: 'REAL_ESTATE_LISTING',
        forceOverride: options?.force === true,
        progressPercent: 25,
        currentStep: 'Scénář',
        renderSettingsJson: this.buildInitialJobRenderMeta({
          propertyPublish: {
            facebook: options?.publishFacebook,
            instagram: options?.publishInstagram,
            youtube: options?.publishYoutube,
            portal: options?.publishPortal,
          },
        }) as object,
      },
    });
    await this.advanceJob(job.id);
    return this.getJob(job.id);
  }

  async approveScript(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (job.status !== AiInfluencerReelJobStatus.SCRIPT_READY) {
      throw new BadRequestException('Job není ve stavu SCRIPT_READY.');
    }
    await this.assertProductionReadyForNewJob();
    const cfg = this.settings.getCached();
    const mode = resolveVideoGenerationMode(cfg);
    const nextStatus =
      mode === 'VIDEO_AGENT'
        ? AiInfluencerReelJobStatus.AVATAR_GENERATING
        : AiInfluencerReelJobStatus.VOICE_GENERATING;
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          videoGenerationMode: mode,
          generationModeUsed: mode,
        }) as object,
      },
    });
    await this.advanceJob(jobId);
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
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'MANUAL_OVERRIDE'),
      },
    });
    await this.advanceJob(jobId);
    return this.getJob(jobId);
  }

  async skipJob(jobId: string, reason?: string): Promise<AiInfluencerJobWithRelations> {
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.CANCELLED,
        skipReason: reason ?? 'Přeskočeno administrátorem',
        progressPercent: 100,
        currentStep: 'Zrušeno',
      },
    });
    return this.getJob(jobId);
  }

  async retryJob(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    if (job.status === AiInfluencerReelJobStatus.SKIPPED_QUALITY) {
      return this.forceStartJob(jobId);
    }
    const resumeStatus = resumeJobStatus(
      job.status,
      job.failedStage,
      {
        spokenText: job.spokenText,
        voiceStorageUrl: job.voiceStorageUrl,
        avatarStorageUrl: job.avatarStorageUrl,
        avatarExternalJobId: job.avatarExternalJobId,
        baseMasterUrl: job.baseMasterUrl,
        generationMode: inferJobGenerationMode(
          readJobRenderMeta(job.renderSettingsJson),
          this.settings.getCached(),
          {
            voiceStorageUrl: job.voiceStorageUrl,
            avatarExternalJobId: job.avatarExternalJobId,
            baseMasterUrl: job.baseMasterUrl,
          },
        ),
      },
      job.errorMessage,
      job.errorCode,
    );
    const progress = progressForStatus(resumeStatus);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: resumeStatus,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        progressPercent: progress.percent,
        currentStep: progress.step,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'RETRY', resumeStatus),
      },
    });
    await this.advanceJob(jobId);
    return this.getJob(jobId);
  }

  /**
   * Posune job o jednu fázi. Každé volání provede maximálně jednu pipeline operaci.
   * Další fáze běží přes opakované volání (worker tick / explicitní retry).
   */
  async advanceJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (
      job.status === AiInfluencerReelJobStatus.PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED ||
      job.status === AiInfluencerReelJobStatus.CANCELLED ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_QUALITY ||
      job.status === AiInfluencerReelJobStatus.SKIPPED_DUPLICATE
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
        case AiInfluencerReelJobStatus.SCRIPT_READY:
          if (this.settings.getCached().approvalMode !== 'MANUAL') {
            const cfg = this.settings.getCached();
            const mode = resolveVideoGenerationMode(cfg);
            if (mode === 'VIDEO_AGENT') {
              await this.prisma.aiInfluencerReelJob.update({
                where: { id: jobId },
                data: { status: AiInfluencerReelJobStatus.AVATAR_GENERATING },
              });
              await this.runVideoAgentStart(jobId);
            } else {
              await this.prisma.aiInfluencerReelJob.update({
                where: { id: jobId },
                data: { status: AiInfluencerReelJobStatus.VOICE_GENERATING },
              });
              await this.runVoiceGeneration(jobId);
            }
          }
          return;
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
      const message = err instanceof Error ? err.message : String(err);
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

  private async runEvaluation(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job.article) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { status: AiInfluencerReelJobStatus.CANDIDATE },
      });
      return;
    }
    await this.setProgress(jobId, AiInfluencerReelJobStatus.EVALUATING, undefined, 'EVALUATION_STARTED');
    if (job.candidateId && !job.forceOverride) {
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
    const passes = result.reelPotentialScore >= cfg.minScore || job.forceOverride;
    const nextStatus = passes
      ? AiInfluencerReelJobStatus.CANDIDATE
      : AiInfluencerReelJobStatus.SKIPPED_QUALITY;
    const progress = progressForStatus(nextStatus);

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
          ? `Kandidát · score ${result.reelPotentialScore}/${cfg.minScore}`
          : `Nevybráno · score ${result.reelPotentialScore}/${cfg.minScore}`,
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

    const aiStatus = await this.openAi.getStatus();
    if (!aiStatus.connected) {
      throw Object.assign(new Error('AI provider pro scénář je vypnutý v nastavení.'), {
        code: 'SCRIPT_PROVIDER_DISABLED',
      });
    }

    if (!existing.forceOverride && (await this.isDuplicateTopic(existing))) {
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
        targetDurationSec: cfg.targetDurationSec,
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
        targetDurationSec: cfg.targetDurationSec,
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

    const storyboard = validateAndNormalizeStoryboard(script, cfg.targetDurationSec);
    script.scenes = storyboard.scenes;

    if (job.propertyId) {
      scenes = await this.resolvePropertyScenes(job.propertyId, script);
    } else if (job.article) {
      scenes = await this.resolveScenes(job.article, script);
    } else {
      scenes = script.scenes;
    }
    const generationMode = resolveVideoGenerationMode(cfg);
    const renderMeta = mergeJobRenderMeta(job.renderSettingsJson, {
      videoGenerationMode: generationMode,
      generationModeUsed: generationMode,
      pronunciationRulesApplied: ttsPrepared.rulesApplied,
    });
    this.log.log(`Job ${jobId} script ready generationMode=${generationMode}`);
    const nextStatus =
      cfg.approvalMode === 'FULL_AUTO'
        ? generationMode === 'VIDEO_AGENT'
          ? AiInfluencerReelJobStatus.AVATAR_GENERATING
          : AiInfluencerReelJobStatus.VOICE_GENERATING
        : AiInfluencerReelJobStatus.SCRIPT_READY;
    const progress = progressForStatus(nextStatus);

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
    } else if (nextStatus === AiInfluencerReelJobStatus.AVATAR_GENERATING) {
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
    const mode = inferJobGenerationMode(meta, cfg, {
      voiceStorageUrl: job.voiceStorageUrl,
      avatarExternalJobId: job.avatarExternalJobId,
      baseMasterUrl: job.baseMasterUrl,
    });
    if (mode === 'VIDEO_AGENT' && !meta.usedVideoAgentFallback) {
      await this.prisma.aiInfluencerReelJob.update({
        where: { id: jobId },
        data: { status: AiInfluencerReelJobStatus.AVATAR_GENERATING },
      });
      await this.runVideoAgentStart(jobId);
      return;
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

  private async runVideoAgentFallback(jobId: string, reason: string): Promise<void> {
    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    if (!cfg.allowVideoAgentFallback) {
      throw Object.assign(new Error(reason), { code: 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE' });
    }

    this.log.warn(`Video Agent fallback for job ${jobId}: ${reason}`);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        avatarExternalJobId: null,
        status: AiInfluencerReelJobStatus.VOICE_GENERATING,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          usedVideoAgentFallback: true,
          generationModeUsed: 'AVATAR',
          fallbackNotice: 'Video Agent nebyl dostupný – použito standardní AI video.',
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'VIDEO_AGENT_FALLBACK', reason),
      },
    });
    await this.runVoiceGeneration(jobId);
  }

  private async runVideoAgentStart(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();

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
      return;
    }

    const readiness = await this.videoAgent.getReadiness();
    if (!readiness.available) {
      await this.runVideoAgentFallback(jobId, readiness.message ?? 'HeyGen Video Agent není dostupný.');
      return;
    }

    await this.heygen.assertReadyForGeneration(job.profile.avatarId);
    const avatarId = this.registry.resolveAvatarId(job.profile.avatarId);
    const script = job.scriptJson as ReelScriptPayload | null;
    if (!script?.spokenText) throw Object.assign(new Error('Chybí scénář pro Video Agent.'), { code: 'STORYBOARD_INVALID' });

    const scenes = (job.scenesJson as ReelScriptPayload['scenes'] | null) ?? script.scenes ?? [];
    const mediaFiles = collectStoryboardMediaUrls(scenes);
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

    let started;
    try {
      started = await this.videoAgent.startGeneration({
        prompt,
        avatarId,
        files: mediaFiles,
      });
    } catch (err) {
      const code = errorCode(err);
      if (cfg.allowVideoAgentFallback && (code?.startsWith('HEYGEN_VIDEO_AGENT_') ?? false)) {
        await this.runVideoAgentFallback(
          jobId,
          err instanceof Error ? err.message : 'Video Agent submit selhal.',
        );
        return;
      }
      throw err;
    }

    const submittedAt = new Date().toISOString();
    const progress = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        avatarExternalJobId: toVideoAgentExternalJobId(started.sessionId),
        avatarCostEstimated: cfg.avatarCostPerSecCzk * (script.estimatedDuration ?? cfg.targetDurationSec),
        totalExternalCost: {
          increment: cfg.avatarCostPerSecCzk * (script.estimatedDuration ?? cfg.targetDurationSec),
        },
        progressPercent: progress.percent,
        currentStep: 'Odesílám Video Agentu',
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          videoGenerationMode: 'VIDEO_AGENT',
          generationModeUsed: 'VIDEO_AGENT',
          heygenVideoAgentSessionId: started.sessionId,
          heygenVideoAgentVideoId: started.videoId ?? undefined,
          videoAgentSubmittedAt: submittedAt,
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'VIDEO_AGENT_SUBMITTED', started.sessionId),
      },
    });
  }

  private async runVideoAgentPoll(jobId: string): Promise<void> {
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

    const sessionId =
      meta.heygenVideoAgentSessionId ??
      parseVideoAgentSessionId(job.avatarExternalJobId) ??
      null;
    if (!sessionId) throw Object.assign(new Error('Chybí Video Agent session ID.'), { code: 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED' });

    if (videoAgentTimedOut(meta.videoAgentSubmittedAt)) {
      if (cfg.allowVideoAgentFallback) {
        await this.runVideoAgentFallback(jobId, 'HeyGen Video Agent timeout.');
        return;
      }
      throw Object.assign(new Error('HeyGen Video Agent timeout.'), { code: 'HEYGEN_VIDEO_AGENT_TIMEOUT' });
    }

    const poll = await this.videoAgent.pollSession(sessionId);
    if (poll.status === 'QUEUED' || poll.status === 'PROCESSING' || poll.status === 'GENERATING') {
      const ratio = videoAgentPollRatio(meta.videoAgentSubmittedAt);
      await this.setProgress(jobId, AiInfluencerReelJobStatus.AVATAR_GENERATING, ratio);
      return;
    }

    if (poll.status === 'FAILED') {
      if (cfg.allowVideoAgentFallback) {
        await this.runVideoAgentFallback(
          jobId,
          poll.errorMessage ?? 'HeyGen Video Agent processing failed.',
        );
        return;
      }
      throw Object.assign(new Error(poll.errorMessage ?? 'Video Agent processing failed.'), {
        code: poll.errorCode ?? 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
      });
    }

    if (!poll.videoUrl) {
      throw Object.assign(new Error('Video Agent nevrátil video URL.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
      });
    }

    let buffer: Buffer;
    try {
      buffer = await this.videoAgent.downloadResult(poll.videoUrl);
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
      });
    }

    const videoUrl = await this.cloudinary.uploadVideoBuffer(
      buffer,
      `ai-influencer-video-agent-${jobId}.mp4`,
    );

    const progress = progressForStatus(AiInfluencerReelJobStatus.AVATAR_READY);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_READY,
        avatarStorageUrl: videoUrl,
        baseMasterUrl: videoUrl,
        avatarHash: poll.videoId ?? sessionId,
        progressPercent: progress.percent,
        currentStep: progress.step,
        renderSettingsJson: mergeJobRenderMeta(job.renderSettingsJson, {
          heygenVideoAgentVideoId: poll.videoId ?? meta.heygenVideoAgentVideoId,
          videoAgentMaster: true,
        }) as object,
        timelineEvents: appendTimelineEvent(job.timelineEvents, 'VIDEO_AGENT_READY'),
      },
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
      throw err;
    }
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

    if (!job.avatarExternalJobId) throw new Error('Chybí externí avatar job ID.');

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

  async publishToFacebook(jobId: string) {
    return this.publish.publishToFacebook(jobId);
  }

  async publishToYoutube(jobId: string) {
    const cfg = this.settings.getCached();
    return this.publish.publishToYoutube(jobId, cfg.youtubePrivacyStatus);
  }

  async publishToInstagram(jobId: string) {
    return this.publish.publishToInstagram(jobId);
  }

  async publishToPortal(jobId: string) {
    return this.publish.publishToPortal(jobId);
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

    if (fbAuto && !fbOk) {
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
    renderSettings.layout = 'SMART_AUTO';
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
    });

    const qualityMeta = mergeJobRenderMeta(job.renderSettingsJson, {
      qualityMetrics: quality.metrics,
      generationModeUsed: generationMode,
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
    return mergeJobRenderMeta(extra ?? {}, {
      videoGenerationMode: mode,
      generationModeUsed: mode,
    });
  }

  private async assertProductionReadyForNewJob(): Promise<void> {
    const cfg = await this.settings.getSettings();
    const profile = await this.registry.getDefaultProfile();
    const aiStatus = await this.openAi.getStatus();
    if (!aiStatus.connected) {
      throw new BadRequestException({
        message: 'AI script provider není připraven.',
        code: 'SCRIPT_PROVIDER_DISABLED',
      });
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

    if (production.ready) return;

    throw new BadRequestException({
      message: production.reasons.join('; '),
      code: 'AI_INFLUENCER_NOT_READY',
      reasons: production.reasons,
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
