import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_INFLUENCER_WORKER_TICK_MS } from './ai-influencer.constants';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import {
  getCloudinaryRuntimeConfig,
  getElevenLabsRuntimeConfig,
  getHeyGenRuntimeConfig,
} from './ai-influencer-runtime-config.util';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { OpenAiService } from '../openai/openai.service';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';

const ACTIVE_STATUSES: AiInfluencerReelJobStatus[] = [
  AiInfluencerReelJobStatus.EVALUATING,
  AiInfluencerReelJobStatus.CANDIDATE,
  AiInfluencerReelJobStatus.SCRIPT_GENERATING,
  AiInfluencerReelJobStatus.SCRIPT_READY,
  AiInfluencerReelJobStatus.VOICE_GENERATING,
  AiInfluencerReelJobStatus.VOICE_READY,
  AiInfluencerReelJobStatus.AVATAR_GENERATING,
  AiInfluencerReelJobStatus.AVATAR_READY,
  AiInfluencerReelJobStatus.RENDERING,
  AiInfluencerReelJobStatus.READY,
  AiInfluencerReelJobStatus.PUBLISHING,
];

@Injectable()
export class AiInfluencerWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiInfluencerWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: AiInfluencerJobService,
    private readonly registry: AiInfluencerProviderRegistry,
    private readonly settings: AiInfluencerSettingsService,
    private readonly openAi: OpenAiService,
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly youtubeOAuth: YouTubeOAuthService,
  ) {}

  onModuleInit() {
    void this.logStartupDiagnostics();
    this.timer = setInterval(() => void this.tick(), AI_INFLUENCER_WORKER_TICK_MS);
    void this.registry.getDefaultProfile();
    void this.recoverStuckJobs();
  }

  private async logStartupDiagnostics(): Promise<void> {
    const eleven = getElevenLabsRuntimeConfig();
    const heygen = getHeyGenRuntimeConfig();
    const storage = getCloudinaryRuntimeConfig();
    const aiStatus = await this.openAi.getStatus();
    const profile = await this.registry.getDefaultProfile();
    const elevenHealth = await this.elevenLabs.getHealth(profile.voiceId);
    const heygenReadiness = await this.heygen.getGenerationReadiness(profile.avatarId);
    const yt = await this.youtubeOAuth.getConnectionStatus();

    this.log.log(`[AI Influencer] AI_PROVIDER: ${aiStatus.connected ? 'READY' : 'NOT READY'}`);
    this.log.log(`[AI Influencer] ELEVENLABS_API_KEY: ${eleven.apiKeyPresence}`);
    this.log.log(`[AI Influencer] ELEVENLABS_VOICE_ID: ${eleven.voiceIdPresence}`);
    this.log.log(
      `[AI Influencer] ELEVENLABS_TTS: ${
        elevenHealth.ttsPermission === 'PASS' || elevenHealth.status === 'CONNECTED'
          ? 'READY'
          : 'NOT READY'
      }`,
    );
    this.log.log(`[AI Influencer] HEYGEN_API_KEY: ${heygen.apiKeyPresence}`);
    this.log.log(`[AI Influencer] STORAGE: ${storage.configured ? 'READY' : 'NOT READY'}`);
    this.log.log(
      `[AI Influencer] HEYGEN: ${heygenReadiness.ready ? 'READY' : 'NOT READY'}`,
    );
    this.log.log(`[AI Influencer] YOUTUBE: ${yt.connected && yt.autoPublishReady ? 'READY' : 'NOT READY'}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async recoverStuckJobs(): Promise<void> {
    const stuck = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 10,
    });
    for (const row of stuck) {
      try {
        await this.jobs.advanceJob(row.id);
      } catch {
        /* logged in job service */
      }
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const cfg = this.settings.getCached();
      const concurrency = Math.max(1, cfg.jobsConcurrency);
      const active = await this.prisma.aiInfluencerReelJob.findMany({
        where: {
          status: { in: ACTIVE_STATUSES },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: concurrency,
        select: { id: true },
      });

      for (const row of active) {
        try {
          await this.jobs.advanceJob(row.id);
        } catch (err) {
          this.log.warn(
            `AI influencer job ${row.id} tick failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
