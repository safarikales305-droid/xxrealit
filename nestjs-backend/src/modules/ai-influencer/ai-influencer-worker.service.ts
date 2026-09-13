import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiProviderService } from '../openai/ai-provider.service';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';
import {
  AI_INFLUENCER_WORKER_TICK_MS,
  AI_INFLUENCER_WORKER_WATCHDOG_MS,
} from './ai-influencer.constants';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { computeProductionReadiness } from './ai-influencer-preflight.util';
import {
  getCloudinaryRuntimeConfig,
  getElevenLabsRuntimeConfig,
  getHeyGenRuntimeConfig,
} from './ai-influencer-runtime-config.util';
import { resolveVideoGenerationMode } from './ai-influencer-video-agent.util';
import { claimedJobWhere, queuedJobWhere, workerQueueWhere, WORKER_ACTIVE_STATUSES } from './ai-influencer-job-status.util';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { HeyGenVideoAgentProvider } from './providers/heygen-video-agent.provider';

export type AiInfluencerWorkerDiagnostics = {
  service: string;
  workerInstanceId: string;
  workerStatus: 'READY' | 'STALE' | 'NOT_RUNNING';
  lastHeartbeatAt: string | null;
  lastWorkerRunAt: string | null;
  lastClaimedJobId: string | null;
  tickCount: number;
  queued: number;
  processing: number;
  claimed: number;
  message: string | null;
};

const WORKER_HEARTBEAT_STALE_MS = 120_000;

@Injectable()
export class AiInfluencerWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiInfluencerWorkerService.name);
  private readonly workerInstanceId = `ai-worker-${process.pid}-${Date.now().toString(36)}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private wakePending = false;
  private tickCount = 0;
  private lastHeartbeatAt: Date | null = null;
  private lastWorkerRunAt: Date | null = null;
  private lastClaimedJobId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AiInfluencerJobService))
    private readonly jobs: AiInfluencerJobService,
    private readonly registry: AiInfluencerProviderRegistry,
    private readonly settings: AiInfluencerSettingsService,
    private readonly aiProvider: AiProviderService,
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly videoAgent: HeyGenVideoAgentProvider,
    private readonly youtubeOAuth: YouTubeOAuthService,
  ) {}

  onModuleInit() {
    void this.logStartupDiagnostics();
    this.lastHeartbeatAt = new Date();
    this.timer = setInterval(() => void this.tick(), AI_INFLUENCER_WORKER_TICK_MS);
    this.watchdogTimer = setInterval(() => void this.watchdog(), AI_INFLUENCER_WORKER_WATCHDOG_MS);
    void this.registry.getDefaultProfile();
    void this.recoverStuckJobs();
  }

  wake(): void {
    this.wakePending = true;
    void this.tick();
  }

  getWorkerInstanceId(): string {
    return this.workerInstanceId;
  }

  private async watchdog(): Promise<void> {
    const staleQueued = await this.prisma.aiInfluencerReelJob.count({
      where: {
        AND: [
          workerQueueWhere(),
          { createdAt: { lte: new Date(Date.now() - 60_000) } },
        ],
      },
    });
    if (staleQueued > 0) {
      this.log.warn(`[AI Influencer] ${staleQueued} queued job(s) older than 60s — waking worker`);
      this.wake();
    }
  }

  async getDiagnostics(): Promise<AiInfluencerWorkerDiagnostics> {
    const [queued, processing, claimed] = await Promise.all([
      this.prisma.aiInfluencerReelJob.count({ where: workerQueueWhere() }),
      this.prisma.aiInfluencerReelJob.count({
        where: {
          status: { in: WORKER_ACTIVE_STATUSES },
          NOT: workerQueueWhere(),
        },
      }),
      this.prisma.aiInfluencerReelJob.count({ where: claimedJobWhere() }),
    ]);

    const heartbeatAgeMs = this.lastHeartbeatAt
      ? Date.now() - this.lastHeartbeatAt.getTime()
      : Number.POSITIVE_INFINITY;
    const workerStatus: AiInfluencerWorkerDiagnostics['workerStatus'] = !this.timer
      ? 'NOT_RUNNING'
      : heartbeatAgeMs > WORKER_HEARTBEAT_STALE_MS
        ? 'STALE'
        : 'READY';

    return {
      service: 'AiInfluencerWorkerService (in-process DB polling)',
      workerInstanceId: this.workerInstanceId,
      workerStatus,
      lastHeartbeatAt: this.lastHeartbeatAt?.toISOString() ?? null,
      lastWorkerRunAt: this.lastWorkerRunAt?.toISOString() ?? null,
      lastClaimedJobId: this.lastClaimedJobId,
      tickCount: this.tickCount,
      queued,
      processing,
      claimed,
      message:
        workerStatus === 'NOT_RUNNING'
          ? 'WORKER NOT RUNNING'
          : workerStatus === 'STALE'
            ? 'Worker heartbeat je zastaralý — generační pipeline nemusí běžet.'
            : null,
    };
  }

  private async logStartupDiagnostics(): Promise<void> {
    const cfg = this.settings.getCached();
    const mode = resolveVideoGenerationMode(cfg);
    const eleven = getElevenLabsRuntimeConfig();
    const heygen = getHeyGenRuntimeConfig();
    const storage = getCloudinaryRuntimeConfig();
    const activeAi = await this.aiProvider.resolveScriptProvider();
    const profile = await this.registry.getDefaultProfile();
    const elevenHealth = await this.elevenLabs.getHealth(profile.voiceId);
    const elevenReadiness = await this.elevenLabs.getGenerationReadiness(profile.voiceId);
    const heygenReadiness = await this.heygen.getGenerationReadiness(profile.avatarId);
    const videoAgentReadiness = await this.videoAgent.getReadiness();
    const yt = await this.youtubeOAuth.getConnectionStatus();
    const production = computeProductionReadiness({
      settings: cfg,
      storageConfigured: storage.configured,
      heygenReady: heygenReadiness.ready,
      videoAgentAvailable: videoAgentReadiness.available,
      elevenReady: elevenReadiness.ready,
      elevenTtsReady: elevenReadiness.ready,
    });

    this.log.log(`[AI Influencer] GENERATION WORKER: AiInfluencerWorkerService (in-process)`);
    this.log.log(`[AI Influencer] GENERATION MODE: ${mode}`);
    this.log.log(`[AI Influencer] WORKER ELEVENLABS_API_KEY: ${eleven.apiKeyPresence}${production.elevenRequired ? '' : ' (NOT REQUIRED FOR VIDEO_AGENT)'}`);
    this.log.log(`[AI Influencer] WORKER HEYGEN_API_KEY: ${heygen.apiKeyPresence}`);
    this.log.log(`[AI Influencer] PROVIDER ELEVENLABS_API_KEY: ${elevenReadiness.apiKeyPresence}`);
    this.log.log(`[AI Influencer] PROVIDER HEYGEN_API_KEY: ${heygenReadiness.apiKeyPresence}`);
    this.log.log(
      `[AI Influencer] AI_PROVIDER: ${activeAi.usable ? 'READY' : 'NOT READY'} (${activeAi.provider}, enabled=${activeAi.enabled}, configured=${activeAi.configured}, db=${activeAi.dbEnabled}, env=${activeAi.envEnabled}, source=${activeAi.configSource}, label=${activeAi.label})`,
    );
    this.log.log(`[AI Influencer] ELEVENLABS_VOICE_ID: ${eleven.voiceIdPresence}`);
    this.log.log(
      `[AI Influencer] ELEVENLABS_TTS: ${
        elevenHealth.ttsPermission === 'PASS' || elevenHealth.status === 'CONNECTED'
          ? 'READY'
          : 'NOT READY'
      }`,
    );
    this.log.log(`[AI Influencer] STORAGE: ${storage.configured ? 'READY' : 'NOT READY'}`);
    this.log.log(
      `[AI Influencer] HEYGEN: ${heygenReadiness.ready ? 'READY' : 'NOT READY'}`,
    );
    this.log.log(
      `[AI Influencer] VIDEO_AGENT: ${videoAgentReadiness.available ? 'READY' : 'NOT AVAILABLE'}`,
    );
    this.log.log(
      `[AI Influencer] PRODUCTION READY: ${production.ready ? 'PASS' : 'FAIL'}${production.reasons.length ? ` (${production.reasons[0]})` : ''}`,
    );
    this.log.log(`[AI Influencer] YOUTUBE: ${yt.connected && yt.autoPublishReady ? 'READY' : 'NOT READY'}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
  }

  private async recoverStuckJobs(): Promise<void> {
    const stuck = await this.prisma.aiInfluencerReelJob.findMany({
      where: {
        status: { in: WORKER_ACTIVE_STATUSES },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 10,
    });
    for (const row of stuck) {
      try {
        await this.jobs.advanceJobChain(row.id, 3);
      } catch {
        /* logged in job service */
      }
    }
    const videoAgentRecovered = await this.jobs.recoverStuckVideoAgentJobs(10);
    if (videoAgentRecovered > 0) {
      this.log.log(`[AI Influencer] Recovered ${videoAgentRecovered} stuck Video Agent job(s) on startup`);
    }
  }

  async tick() {
    if (this.running) {
      this.wakePending = true;
      return;
    }
    this.running = true;
    this.lastWorkerRunAt = new Date();
    try {
      const recovered = await this.jobs.recoverStaleQueuedJobs(5);
      if (recovered > 0) {
        this.log.log(`[AI Influencer] Recovered ${recovered} stale queued job(s)`);
      }
      if (this.tickCount % 6 === 0) {
        const videoAgentRecovered = await this.jobs.recoverStuckVideoAgentJobs(5);
        if (videoAgentRecovered > 0) {
          this.log.log(`[AI Influencer] Recovered ${videoAgentRecovered} stuck Video Agent job(s)`);
        }
      }

      const heygenPoll = await this.jobs.pollHeyGenActiveJobs(20);
      if (heygenPoll.polled > 0 || heygenPoll.finalized > 0) {
        this.log.log(
          `[AI Influencer] HeyGen poll: polled=${heygenPoll.polled} finalized=${heygenPoll.finalized} errors=${heygenPoll.errors}`,
        );
      }

      const cfg = this.settings.getCached();
      const concurrency = Math.max(1, cfg.jobsConcurrency);
      const active = await this.prisma.aiInfluencerReelJob.findMany({
        where: {
          status: { in: WORKER_ACTIVE_STATUSES },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: concurrency,
        select: { id: true },
      });

      for (const row of active) {
        const claimed = await this.jobs.tryClaimQueuedJob(row.id, this.workerInstanceId);
        if (!claimed) continue;
        this.lastClaimedJobId = row.id;
        try {
          await this.jobs.advanceJobChain(row.id, 3);
        } catch (err) {
          this.log.warn(
            `AI influencer job ${row.id} tick failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      this.tickCount += 1;
      this.lastHeartbeatAt = new Date();
      if (this.tickCount % 4 === 0) {
        const reconcile = await this.jobs.reconcilePendingHeyGenJobs(5);
        if (reconcile.recovered > 0) {
          this.log.log(
            `[AI Influencer] HeyGen reconcile recovered ${reconcile.recovered}/${reconcile.scanned} jobs`,
          );
        }
      }
    } finally {
      this.running = false;
      if (this.wakePending) {
        this.wakePending = false;
        void this.tick();
      }
    }
  }
}
