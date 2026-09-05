import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../database/prisma.service';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { REEL_CANVAS_HEIGHT, REEL_CANVAS_WIDTH } from './ai-influencer-render.types';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerRenderService } from './ai-influencer-render.service';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { DEFAULT_RENDER_SETTINGS } from './ai-influencer-render.types';
import { buildHeyGenVideoAgentTestPrompt } from './heygen-video-agent-prompt.util';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { HeyGenVideoAgentProvider } from './providers/heygen-video-agent.provider';

export const AI_INFLUENCER_VIDEO_AGENT_TEST_KEY = 'ai_influencer_video_agent_test';

export type VideoAgentTestStage =
  | 'QUEUED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'READY'
  | 'DOWNLOADING'
  | 'VALIDATING'
  | 'DONE'
  | 'FAILED';

export type VideoAgentTestJob = {
  id: string;
  status: VideoAgentTestStage;
  progressPercent: number;
  progressLabel: string;
  sessionId?: string | null;
  videoId?: string | null;
  providerJobIdMasked?: string | null;
  previewUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  failedStage?: VideoAgentTestStage | null;
  httpStatus?: number | null;
  providerCode?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type VideoAgentTestStore = {
  activeJobId: string | null;
  lastOutcome: 'PASS' | 'FAIL' | null;
  lastErrorCode: string | null;
  jobs: Record<string, VideoAgentTestJob>;
};

const TICK_MS = 3_000;
const SUBMIT_TIMEOUT_MS = 45_000;
const PROCESSING_TIMEOUT_MS = 8 * 60_000;

@Injectable()
export class HeyGenVideoAgentTestService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(HeyGenVideoAgentTestService.name);
  private store: VideoAgentTestStore = { activeJobId: null, lastOutcome: null, lastErrorCode: null, jobs: {} };
  private localFiles = new Map<string, { localPath: string; tmpRoot: string }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiInfluencerSettingsService,
    private readonly registry: AiInfluencerProviderRegistry,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly videoAgent: HeyGenVideoAgentProvider,
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly render: AiInfluencerRenderService,
  ) {}

  async onModuleInit() {
    await this.loadStore();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getLastTestOutcome(): Pick<VideoAgentTestStore, 'lastOutcome' | 'lastErrorCode'> {
    return { lastOutcome: this.store.lastOutcome, lastErrorCode: this.store.lastErrorCode };
  }

  getActiveJob(): VideoAgentTestJob | null {
    const id = this.store.activeJobId;
    if (!id) return null;
    return this.store.jobs[id] ?? null;
  }

  getJob(jobId: string): VideoAgentTestJob {
    const job = this.store.jobs[jobId];
    if (!job) throw new NotFoundException('Video Agent test job nenalezen.');
    return job;
  }

  async createTestJob(): Promise<VideoAgentTestJob> {
    const readiness = await this.videoAgent.getReadiness();
    if (!readiness.available) {
      throw Object.assign(
        new Error(readiness.message ?? 'HeyGen Video Agent není dostupný.'),
        { code: 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE', httpStatus: readiness.probeStatus ?? null },
      );
    }

    const profile = await this.registry.getDefaultProfile();
    await this.heygen.assertReadyForGeneration(profile.avatarId);

    const id = randomUUID();
    const now = new Date().toISOString();
    const job: VideoAgentTestJob = {
      id,
      status: 'QUEUED',
      ...progressForStage('QUEUED'),
      createdAt: now,
      updatedAt: now,
    };
    this.store.jobs[id] = job;
    this.store.activeJobId = id;
    await this.persistStore();
    this.log.log(`VIDEO_AGENT_TEST_CREATED jobId=${id}`);
    void this.tick();
    return job;
  }

  private async tick() {
    if (this.ticking) return;
    const id = this.store.activeJobId;
    if (!id) return;
    const job = this.store.jobs[id];
    if (!job || job.status === 'DONE' || job.status === 'FAILED') return;

    this.ticking = true;
    try {
      await this.advanceJob(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`VIDEO_AGENT_TEST_TICK_FAIL jobId=${id} err=${msg}`);
    } finally {
      this.ticking = false;
    }
  }

  private async advanceJob(jobId: string) {
    const job = this.store.jobs[jobId];
    if (!job) return;

    if (job.status === 'QUEUED' || job.status === 'SUBMITTING') {
      await this.submitJob(jobId);
      return;
    }

    if (job.status === 'SUBMITTED' || job.status === 'PROCESSING') {
      await this.pollJob(jobId);
      return;
    }

    if (job.status === 'READY') {
      await this.downloadJob(jobId);
      return;
    }

    if (job.status === 'DOWNLOADING' || job.status === 'VALIDATING') {
      await this.validateJob(jobId);
    }
  }

  private async submitJob(jobId: string) {
    await this.patchJob(jobId, { status: 'SUBMITTING', ...progressForStage('SUBMITTING') });
    this.log.log(`VIDEO_AGENT_TEST_SUBMIT jobId=${jobId}`);

    const profile = await this.registry.getDefaultProfile();
    const cfg = this.settings.getCached();
    const avatarId = this.heygen.resolveAvatarId(profile.avatarId);
    const prompt = buildHeyGenVideoAgentTestPrompt({
      settings: cfg,
      avatarId,
      videoStyle: cfg.videoStyle,
      avatarFrequency: cfg.avatarFrequency,
    });

    try {
      const started = await this.videoAgent.startGeneration(
        { prompt, avatarId },
        { timeoutMs: SUBMIT_TIMEOUT_MS },
      );
      const submittedAt = new Date().toISOString();
      await this.patchJob(jobId, {
        status: 'SUBMITTED',
        ...progressForStage('SUBMITTED'),
        sessionId: started.sessionId,
        videoId: started.videoId,
        providerJobIdMasked: maskProviderId(started.sessionId),
        submittedAt,
      });
      this.log.log(`VIDEO_AGENT_TEST_SUBMITTED jobId=${jobId} session=${maskProviderId(started.sessionId)}`);
    } catch (err) {
      await this.failJob(jobId, 'SUBMITTING', err);
    }
  }

  private async pollJob(jobId: string) {
    const job = this.store.jobs[jobId]!;
    const sessionId = job.sessionId?.trim();
    if (!sessionId) {
      await this.failJob(
        jobId,
        'PROCESSING',
        Object.assign(new Error('Chybí HeyGen session ID.'), { code: 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED' }),
      );
      return;
    }

    if (job.submittedAt && Date.now() - Date.parse(job.submittedAt) > PROCESSING_TIMEOUT_MS) {
      await this.failJob(
        jobId,
        'PROCESSING',
        Object.assign(new Error('HeyGen Video Agent processing timeout.'), {
          code: 'HEYGEN_VIDEO_AGENT_TIMEOUT',
        }),
      );
      return;
    }

    const poll = await this.videoAgent.pollSession(sessionId);
    if (poll.status === 'QUEUED' || poll.status === 'PROCESSING' || poll.status === 'GENERATING') {
      const ratio = job.submittedAt
        ? Math.min(1, (Date.now() - Date.parse(job.submittedAt)) / PROCESSING_TIMEOUT_MS)
        : 0.3;
      if (job.status !== 'PROCESSING') {
        this.log.log(`VIDEO_AGENT_TEST_PROCESSING jobId=${jobId}`);
      }
      await this.patchJob(jobId, {
        status: 'PROCESSING',
        ...progressForStage('PROCESSING', ratio),
        videoId: poll.videoId ?? job.videoId ?? null,
      });
      return;
    }

    if (poll.status === 'FAILED') {
      await this.failJob(
        jobId,
        'PROCESSING',
        Object.assign(new Error(poll.errorMessage ?? 'Video Agent processing failed.'), {
          code: poll.errorCode ?? 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        }),
      );
      return;
    }

    if (!poll.videoUrl) {
      await this.failJob(
        jobId,
        'PROCESSING',
        Object.assign(new Error('Video Agent nevrátil video URL.'), {
          code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
        }),
      );
      return;
    }

    await this.patchJob(jobId, {
      status: 'READY',
      ...progressForStage('READY'),
      videoId: poll.videoId ?? job.videoId ?? null,
      previewUrl: poll.videoUrl,
      durationSec: poll.durationSec ?? job.durationSec ?? null,
    });
    this.log.log(`VIDEO_AGENT_TEST_READY jobId=${jobId}`);
  }

  private async downloadJob(jobId: string) {
    const job = this.store.jobs[jobId]!;
    const videoUrl = job.previewUrl?.trim();
    if (!videoUrl) {
      await this.failJob(
        jobId,
        'DOWNLOADING',
        Object.assign(new Error('Chybí URL testovacího videa.'), { code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED' }),
      );
      return;
    }

    await this.patchJob(jobId, { status: 'DOWNLOADING', ...progressForStage('DOWNLOADING') });
    this.log.log(`VIDEO_AGENT_TEST_DOWNLOADED jobId=${jobId} (start)`);

    const tmpRoot = join(tmpdir(), `va-test-${jobId}`);
    await mkdir(tmpRoot, { recursive: true });
    const sourcePath = join(tmpRoot, 'source.mp4');

    try {
      const buffer = await this.videoAgent.downloadResult(videoUrl);
      await writeFile(sourcePath, buffer);
      await this.patchJob(jobId, {
        status: 'VALIDATING',
        ...progressForStage('VALIDATING'),
      });
      this.localFiles.set(jobId, { localPath: sourcePath, tmpRoot });
    } catch (err) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      await this.failJob(jobId, 'DOWNLOADING', err);
    }
  }

  private async validateJob(jobId: string) {
    const job = this.store.jobs[jobId]!;
    const local = this.localFiles.get(jobId);
    const localPath = local?.localPath;
    if (!localPath) {
      await this.failJob(
        jobId,
        'VALIDATING',
        Object.assign(new Error('Chybí stažený soubor testu.'), { code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED' }),
      );
      return;
    }

    const probe = await probeMedia(localPath);
    if (!probe.videoStream) {
      await this.failJob(
        jobId,
        'VALIDATING',
        Object.assign(new Error('Test video neobsahuje video stream.'), { code: 'VIDEO_AGENT_TEST_INVALID' }),
      );
      return;
    }
    if (!probe.audioStream) {
      await this.failJob(
        jobId,
        'VALIDATING',
        Object.assign(new Error('Test video neobsahuje audio stream.'), { code: 'VIDEO_AGENT_TEST_INVALID' }),
      );
      return;
    }
    if (!probe.durationSec || probe.durationSec <= 0) {
      await this.failJob(
        jobId,
        'VALIDATING',
        Object.assign(new Error('Test video má neplatnou délku.'), { code: 'VIDEO_AGENT_TEST_INVALID' }),
      );
      return;
    }

    let uploadPath = localPath;
    let width = probe.width;
    let height = probe.height;

    if (width !== REEL_CANVAS_WIDTH || height !== REEL_CANVAS_HEIGHT) {
      const outPath = join(local?.tmpRoot ?? dirnameSafe(localPath), 'normalized.mp4');
      await this.render.finalizeAgentMaster({
        sourceVideoPath: localPath,
        outPath,
        logoPath: null,
        settings: DEFAULT_RENDER_SETTINGS,
        musicFilePath: null,
        applyBranding: false,
      });
      uploadPath = outPath;
      const normalized = await probeMedia(outPath);
      width = normalized.width;
      height = normalized.height;
    }

    const mp4 = await readFile(uploadPath);
    const storedUrl = await this.cloudinary.uploadVideoBuffer(
      mp4,
      `ai-influencer-video-agent-test-${jobId}.mp4`,
    );

    await this.patchJob(jobId, {
      status: 'DONE',
      ...progressForStage('DONE'),
      previewUrl: storedUrl,
      durationSec: probe.durationSec,
      width,
      height,
      errorCode: null,
      errorMessage: null,
      failedStage: null,
    });
    this.store.lastOutcome = 'PASS';
    this.store.lastErrorCode = null;
    await this.persistStore();
    this.log.log(`VIDEO_AGENT_TEST_DONE jobId=${jobId}`);

    this.localFiles.delete(jobId);
    if (local?.tmpRoot) {
      await rm(local.tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async failJob(jobId: string, stage: VideoAgentTestStage, err: unknown) {
    const errObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
    const code =
      typeof errObj.code === 'string' ? errObj.code : 'HEYGEN_VIDEO_AGENT_TEST_FAILED';
    const httpStatus = typeof errObj.httpStatus === 'number' ? errObj.httpStatus : null;
    const providerCode = typeof errObj.providerCode === 'string' ? errObj.providerCode : null;
    const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));

    this.log.warn(
      `HEYGEN_VIDEO_AGENT_TEST_FAILED jobId=${jobId} stage=${stage} statusCode=${httpStatus ?? '—'} providerCode=${providerCode ?? '—'} sanitizedMessage=${message}`,
    );
    this.log.warn(`VIDEO_AGENT_TEST_${stage}_FAILED jobId=${jobId}`);

    await this.patchJob(jobId, {
      status: 'FAILED',
      ...progressForStage('FAILED'),
      failedStage: stage,
      errorCode: code,
      errorMessage: message,
      httpStatus,
      providerCode,
    });
    this.store.lastOutcome = 'FAIL';
    this.store.lastErrorCode = code;
    await this.persistStore();
  }

  private async patchJob(jobId: string, patch: Partial<VideoAgentTestJob>) {
    const current = this.store.jobs[jobId];
    if (!current) return;
    this.store.jobs[jobId] = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.persistStore();
  }

  private async loadStore() {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: AI_INFLUENCER_VIDEO_AGENT_TEST_KEY },
    });
    if (!row?.valueJson || typeof row.valueJson !== 'object') return;
    const raw = row.valueJson as VideoAgentTestStore;
    this.store = {
      activeJobId: raw.activeJobId ?? null,
      lastOutcome: raw.lastOutcome ?? null,
      lastErrorCode: raw.lastErrorCode ?? null,
      jobs: raw.jobs ?? {},
    };
  }

  private async persistStore() {
    const payload: VideoAgentTestStore = {
      activeJobId: this.store.activeJobId,
      lastOutcome: this.store.lastOutcome,
      lastErrorCode: this.store.lastErrorCode,
      jobs: this.store.jobs,
    };
    await this.prisma.appSetting.upsert({
      where: { key: AI_INFLUENCER_VIDEO_AGENT_TEST_KEY },
      create: { key: AI_INFLUENCER_VIDEO_AGENT_TEST_KEY, valueJson: payload as object },
      update: { valueJson: payload as object },
    });
  }
}

export function progressForStage(
  stage: VideoAgentTestStage,
  processingRatio = 0.3,
): Pick<VideoAgentTestJob, 'progressPercent' | 'progressLabel'> {
  switch (stage) {
    case 'QUEUED':
      return { progressPercent: 0, progressLabel: 'Připravuji test' };
    case 'SUBMITTING':
      return { progressPercent: 10, progressLabel: 'Odesílám HeyGen' };
    case 'SUBMITTED':
      return { progressPercent: 20, progressLabel: 'HeyGen přijal úlohu' };
    case 'PROCESSING':
      return {
        progressPercent: Math.min(80, 30 + Math.round(processingRatio * 50)),
        progressLabel: 'HeyGen generuje video',
      };
    case 'READY':
      return { progressPercent: 82, progressLabel: 'Video připraveno ke stažení' };
    case 'DOWNLOADING':
      return { progressPercent: 85, progressLabel: 'Stahuji výsledek' };
    case 'VALIDATING':
      return { progressPercent: 95, progressLabel: 'Kontroluji video' };
    case 'DONE':
      return { progressPercent: 100, progressLabel: 'Test dokončen' };
    case 'FAILED':
      return { progressPercent: 0, progressLabel: 'Test selhal' };
    default:
      return { progressPercent: 0, progressLabel: stage };
  }
}

export function maskProviderId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 6) return '****';
  return `****${id.slice(-4)}`;
}

export function sanitizeErrorMessage(raw: string): string {
  return raw
    .replace(/x-api-key[^\s]*/gi, '[redacted]')
    .replace(/api[_-]?key[=:]\S+/gi, '[redacted]')
    .slice(0, 240);
}

async function probeMedia(filePath: string): Promise<{
  width: number | null;
  height: number | null;
  durationSec: number | null;
  videoStream: boolean;
  audioStream: boolean;
}> {
  const ffmpeg = resolveFfmpegBinary();
  if (!ffmpeg.path) {
    return { width: null, height: null, durationSec: null, videoStream: false, audioStream: false };
  }
  const { stderr } = await runFfmpegCapture(ffmpeg.path, ['-i', filePath]);
  const dimMatch = stderr.match(/,\s*(\d{2,5})x(\d{2,5})[,\s]/);
  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let durationSec: number | null = null;
  if (durMatch) {
    durationSec =
      Number.parseInt(durMatch[1], 10) * 3600 +
      Number.parseInt(durMatch[2], 10) * 60 +
      Number.parseFloat(durMatch[3]);
  }
  return {
    width: dimMatch ? Number.parseInt(dimMatch[1], 10) : null,
    height: dimMatch ? Number.parseInt(dimMatch[2], 10) : null,
    durationSec,
    videoStream: /Video:/i.test(stderr),
    audioStream: /Audio:/i.test(stderr),
  };
}

function dirnameSafe(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx >= 0 ? filePath.slice(0, idx) : filePath;
}
