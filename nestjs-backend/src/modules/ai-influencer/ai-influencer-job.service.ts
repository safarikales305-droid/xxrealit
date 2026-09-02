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
} from '@prisma/client';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerRenderService } from './ai-influencer-render.service';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { ArticleMediaProvider } from './providers/article-media.provider';
import { OpenAiScriptProvider } from './providers/openai-script.provider';
import { ProviderGenerationService } from './provider-generation.service';
import type { ReelScriptPayload } from './ai-influencer.types';

type AiInfluencerJobWithRelations = Prisma.AiInfluencerReelJobGetPayload<{
  include: {
    article: true;
    profile: true;
    candidate: true;
  };
}>;

function errorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
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
    private readonly render: AiInfluencerRenderService,
    private readonly generationCache: ProviderGenerationService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly shortsMusic: ShortsMusicService,
  ) {}

  async listJobs(limit = 50) {
    return this.prisma.aiInfluencerReelJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        article: { select: { id: true, title: true, publishedAt: true, status: true } },
        profile: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async getJob(id: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.prisma.aiInfluencerReelJob.findUnique({
      where: { id },
      include: {
        article: true,
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
      title: a.title,
      publishedAt: a.publishedAt,
      category: a.category,
      ogImageUrl: a.ogImageUrl,
      reelScore: a.aiReelCandidates[0]?.reelPotentialScore ?? null,
      latestJob: a.aiInfluencerReelJobs[0] ?? null,
    }));
  }

  async createJobFromArticle(articleId: string): Promise<AiInfluencerJobWithRelations> {
    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article || article.status !== NewsArticleStatus.PUBLISHED) {
      throw new BadRequestException('Článek není publikovaný.');
    }
    const profile = await this.registry.getDefaultProfile();
    const job = await this.prisma.aiInfluencerReelJob.create({
      data: {
        articleId,
        profileId: profile.id,
        status: AiInfluencerReelJobStatus.EVALUATING,
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
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { status: AiInfluencerReelJobStatus.VOICE_GENERATING },
    });
    await this.advanceJob(jobId);
    return this.getJob(jobId);
  }

  async retryJob(jobId: string): Promise<AiInfluencerJobWithRelations> {
    const job = await this.getJob(jobId);
    const resumeStatus = this.resumeStatus(job.status, job.failedStage);
    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: resumeStatus,
        errorCode: null,
        errorMessage: null,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
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
      job.status === AiInfluencerReelJobStatus.CANCELLED
    ) {
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
        case AiInfluencerReelJobStatus.SCRIPT_READY:
        case AiInfluencerReelJobStatus.RENDERING:
        case AiInfluencerReelJobStatus.READY:
        case AiInfluencerReelJobStatus.FAILED:
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
      await this.failJob(jobId, job.status, errorCode(err), message);
      throw err;
    }
  }

  private resumeStatus(
    status: AiInfluencerReelJobStatus,
    failedStage: string | null,
  ): AiInfluencerReelJobStatus {
    if (failedStage === 'VOICE') return AiInfluencerReelJobStatus.VOICE_GENERATING;
    if (failedStage === 'AVATAR') {
      return status === AiInfluencerReelJobStatus.FAILED && failedStage === 'AVATAR'
        ? AiInfluencerReelJobStatus.AVATAR_GENERATING
        : AiInfluencerReelJobStatus.VOICE_READY;
    }
    if (failedStage === 'RENDER') return AiInfluencerReelJobStatus.AVATAR_READY;
    if (failedStage === 'SCRIPT') return AiInfluencerReelJobStatus.CANDIDATE;
    if (failedStage === 'EVALUATION') return AiInfluencerReelJobStatus.EVALUATING;
    if (status === AiInfluencerReelJobStatus.FAILED) return AiInfluencerReelJobStatus.EVALUATING;
    return status;
  }

  private async runEvaluation(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job.candidateId) {
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
      title: article.title,
      perex: article.perex,
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
    const nextStatus =
      result.reelPotentialScore >= cfg.minScore
        ? AiInfluencerReelJobStatus.CANDIDATE
        : AiInfluencerReelJobStatus.FAILED;

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        candidateId: candidate.id,
        status: nextStatus,
        contentFormat: result.contentFormat ?? undefined,
        aiCostEstimated: { increment: costCzk },
        totalExternalCost: { increment: costCzk },
        errorMessage:
          nextStatus === AiInfluencerReelJobStatus.FAILED
            ? `Score ${result.reelPotentialScore} je pod minimem ${cfg.minScore}.`
            : null,
        failedStage: nextStatus === AiInfluencerReelJobStatus.FAILED ? 'EVALUATION' : null,
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
      return;
    }

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: { status: AiInfluencerReelJobStatus.SCRIPT_GENERATING },
    });

    const job = await this.getJob(jobId);
    const cfg = this.settings.getCached();
    const { script, hookCandidates, selectedHook, costCzk, scriptHash } =
      await this.scriptProvider.generateScript({
        article: {
          id: job.article.id,
          title: job.article.title,
          perex: job.article.perex,
          bodyMarkdown: job.article.bodyMarkdown,
          category: job.article.category,
          region: job.article.region,
          publishedAt: job.article.publishedAt,
          ogImageUrl: job.article.ogImageUrl,
          factClaimsJson: job.article.factClaimsJson,
        },
        targetDurationSec: cfg.targetDurationSec,
        personalityPrompt: job.profile.personalityPrompt,
      });

    const scenes = await this.resolveScenes(job.article, script);
    const nextStatus =
      cfg.approvalMode === 'FULL_AUTO'
        ? AiInfluencerReelJobStatus.VOICE_GENERATING
        : AiInfluencerReelJobStatus.SCRIPT_READY;

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        hookCandidates,
        selectedHook,
        scriptJson: script as object,
        spokenText: script.spokenText,
        captionTitle: script.captionTitle,
        captionDescription: script.captionDescription,
        hashtags: script.hashtags.join(' '),
        estimatedDurationSec: script.estimatedDuration,
        scriptHash,
        scenesJson: scenes as object,
        contentFormat: script.contentFormat ?? job.contentFormat ?? undefined,
        aiCostEstimated: { increment: costCzk },
        totalExternalCost: { increment: costCzk },
      },
    });
  }

  private async runVoiceGeneration(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job.voiceStorageUrl?.trim()) {
      if (job.status !== AiInfluencerReelJobStatus.VOICE_READY) {
        await this.prisma.aiInfluencerReelJob.update({
          where: { id: jobId },
          data: { status: AiInfluencerReelJobStatus.VOICE_READY },
        });
      }
      return;
    }

    const spokenText = job.spokenText?.trim();
    if (!spokenText) throw new Error('Chybí spokenText pro voice-over.');

    const voiceProvider = this.registry.getVoiceProvider(job.profile.voiceProvider);
    if (!voiceProvider.isConfigured()) {
      throw new Error('Voice provider není nakonfigurován.');
    }

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

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.VOICE_READY,
        voiceStorageUrl: voiceUrl,
        voiceHash,
        voiceCostEstimated: voiceCost,
        totalExternalCost: { increment: voiceCost },
      },
    });
  }

  private async runAvatarStart(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
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

    const avatarProvider = this.registry.getAvatarProvider(job.profile.avatarProvider);
    if (!avatarProvider.isConfigured()) {
      throw new Error('Avatar provider není nakonfigurován.');
    }

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

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        avatarExternalJobId: started.externalJobId,
        avatarHash: started.contentHash,
        avatarCostEstimated: started.costEstimatedCzk,
        totalExternalCost: { increment: started.costEstimatedCzk },
      },
    });
  }

  private async runAvatarPoll(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
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

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.AVATAR_READY,
        avatarStorageUrl: videoUrl,
      },
    });
  }

  private async runRender(jobId: string): Promise<void> {
    const existing = await this.getJob(jobId);
    if (existing.videoUrl?.trim()) {
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

    const job = await this.getJob(jobId);
    if (!job.avatarStorageUrl || !job.voiceStorageUrl) {
      throw new Error('Chybí avatar nebo voice pro render.');
    }

    const tmpRoot = join(tmpdir(), `ai-inf-render-${jobId}`);
    const avatarPath = join(tmpRoot, 'avatar.mp4');
    const voicePath = join(tmpRoot, 'voice.mp3');
    await this.render.downloadToFile(job.avatarStorageUrl, avatarPath);
    await this.render.downloadToFile(job.voiceStorageUrl, voicePath);

    const cfg = this.settings.getCached();
    let musicFilePath: string | null = null;
    const musicId = job.musicTrackId ?? cfg.defaultMusicTrackId;
    if (musicId) {
      try {
        musicFilePath = await this.shortsMusic.resolveActiveTrackFilePath(musicId);
      } catch {
        this.log.warn(`Music track ${musicId} unavailable for job ${jobId}`);
      }
    }

    const scenes = (job.scenesJson as ReelScriptPayload['scenes'] | null) ?? [];
    const result = await this.render.render({
      avatarVideoPath: avatarPath,
      voiceAudioPath: voicePath,
      scenes,
      hookText: job.selectedHook ?? job.captionTitle ?? '',
      musicFilePath,
    });

    const mp4 = await import('node:fs/promises').then((fs) => fs.readFile(result.outputPath));
    const videoUrl = await this.cloudinary.uploadVideoBuffer(mp4, `ai-influencer-reel-${jobId}.mp4`);
    await this.render.cleanup(result.tmpRoot);
    await this.render.cleanup(tmpRoot);

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.READY,
        videoUrl,
        thumbnailUrl: job.article.ogImageUrl,
        renderedAt: new Date(),
      },
    });
  }

  private async resolveScenes(
    article: { ogImageUrl: string | null },
    script: ReelScriptPayload,
  ): Promise<ReelScriptPayload['scenes']> {
    const scenes = [...script.scenes];
    for (const scene of scenes) {
      const media = await this.mediaProvider.resolveSceneMedia(
        {
          id: '',
          title: '',
          perex: '',
          bodyMarkdown: '',
          category: '',
          region: null,
          publishedAt: null,
          ogImageUrl: article.ogImageUrl,
          factClaimsJson: null,
        },
        scene,
      );
      if (media) {
        scene.mediaUrl = media.url;
        scene.generatedAsset = media.generatedAsset;
      }
    }
    return scenes;
  }

  private async failJob(
    jobId: string,
    stage: AiInfluencerReelJobStatus,
    code: string | null,
    message: string,
  ): Promise<void> {
    const failedStage =
      stage === AiInfluencerReelJobStatus.VOICE_GENERATING
        ? 'VOICE'
        : stage === AiInfluencerReelJobStatus.AVATAR_GENERATING
          ? 'AVATAR'
          : stage === AiInfluencerReelJobStatus.RENDERING
            ? 'RENDER'
            : stage === AiInfluencerReelJobStatus.SCRIPT_GENERATING
              ? 'SCRIPT'
              : 'EVALUATION';

    await this.prisma.aiInfluencerReelJob.update({
      where: { id: jobId },
      data: {
        status: AiInfluencerReelJobStatus.FAILED,
        failedStage,
        errorCode: code,
        errorMessage: message,
        lastAttemptAt: new Date(),
      },
    });
    this.log.warn(`Job ${jobId} failed at ${failedStage}: ${message}`);
  }
}
