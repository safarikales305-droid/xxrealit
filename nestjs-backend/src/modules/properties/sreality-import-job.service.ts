import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SrealityImportService } from './sreality-import.service';
import {
  imageCaptureProgress,
  imageUploadProgress,
  isActiveStatus,
  isTerminalStatus,
  retryStageResumePoint,
  stageLabel,
  STAGE_BASE_PROGRESS,
  type SrealityImportJobStage,
  type SrealityImportJobStatus,
} from './sreality-import-progress.util';
import type {
  SrealityImportJobLogEntry,
  SrealityImportProgressReporter,
} from './sreality-import.types';

const MAX_LOG_LINES = 200;
const LONG_RUNNING_MS = 3 * 60_000;
const STAGE_STALL_MS = 45_000;

type JobRow = {
  id: string;
  adminUserId: string;
  sourceUrl: string;
  status: string;
  stage: string;
  progress: number;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  stageUpdatedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  imagesFound: number;
  imagesSelected: number;
  imagesProcessed: number;
  imagesImported: number;
  imagesFailed: number;
  agentStatus: string | null;
  phoneStatus: string | null;
  emailStatus: string | null;
  browserStatus: string | null;
  pageStatus: string | null;
  galleryStatus: string | null;
  draftId: string | null;
  retryFromStage: string | null;
  logsJson: unknown;
  diagnosticsJson: unknown;
  cancelRequested: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class SrealityImportJobService {
  private readonly log = new Logger(SrealityImportJobService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly importService: SrealityImportService,
  ) {}

  async createJob(adminUserId: string, sourceUrl: string) {
    const url = sourceUrl.trim();
    if (!url) throw new BadRequestException('Chybí URL inzerátu.');

    const active = await this.prisma.srealityImportJob.findFirst({
      where: {
        adminUserId,
        status: { in: ['QUEUED', 'PROCESSING', 'LONG_RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      return { jobId: active.id, status: active.status as SrealityImportJobStatus, existing: true };
    }

    const job = await this.prisma.srealityImportJob.create({
      data: {
        adminUserId,
        sourceUrl: url,
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 0,
        message: 'Import ve frontě',
        logsJson: [this.logEntry('Job vytvořen', 'info', 'QUEUED')] as unknown as Prisma.InputJsonValue,
      },
    });

    void this.processJob(job.id);
    return { jobId: job.id, status: 'QUEUED' as const, existing: false };
  }

  async getActiveJob(adminUserId: string) {
    const job = await this.prisma.srealityImportJob.findFirst({
      where: {
        adminUserId,
        status: { in: ['QUEUED', 'PROCESSING', 'LONG_RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.toStatusDto(job) : null;
  }

  async getJob(jobId: string) {
    const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    return this.toStatusDto(job);
  }

  async listJobs(adminUserId: string, limit = 20) {
    const rows = await this.prisma.srealityImportJob.findMany({
      where: { adminUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((j) => this.toHistoryDto(j));
  }

  async cancelJob(jobId: string, adminUserId: string) {
    const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    if (job.adminUserId !== adminUserId) throw new BadRequestException('Job nepatří tomuto adminu.');
    if (isTerminalStatus(job.status)) return this.toStatusDto(job);

    const logs = this.readLogs(job.logsJson);
    logs.push(this.logEntry('Import zrušen administrátorem', 'warn', job.stage));
    await this.prisma.srealityImportJob.update({
      where: { id: jobId },
      data: {
        cancelRequested: true,
        status: 'CANCELLED',
        stage: 'CANCELLED',
        progress: 0,
        message: 'Import zrušen',
        finishedAt: new Date(),
        logsJson: logs.slice(-MAX_LOG_LINES) as unknown as Prisma.InputJsonValue,
      },
    });
    return this.getJob(jobId);
  }

  async retryJob(jobId: string, adminUserId: string, fromStage?: string) {
    const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    if (job.adminUserId !== adminUserId) throw new BadRequestException('Job nepatří tomuto adminu.');
    if (!['FAILED', 'PARTIAL', 'CANCELLED'].includes(job.status)) {
      throw new BadRequestException('Job nelze znovu spustit v tomto stavu.');
    }

    const resume = fromStage
      ? (fromStage as SrealityImportJobStage)
      : retryStageResumePoint(job.stage);

    const logs = this.readLogs(job.logsJson);
    logs.push(this.logEntry(`Restart od fáze ${stageLabel(resume)}`, 'info', resume));

    await this.prisma.srealityImportJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 0,
        message: 'Import ve frontě',
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        cancelRequested: false,
        retryFromStage: resume,
        logsJson: logs.slice(-MAX_LOG_LINES) as unknown as Prisma.InputJsonValue,
      },
    });

    void this.processJob(jobId);
    return this.getJob(jobId);
  }

  async deleteJob(jobId: string, adminUserId: string) {
    const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    if (job.adminUserId !== adminUserId) throw new BadRequestException('Job nepatří tomuto adminu.');
    if (isActiveStatus(job.status)) {
      throw new BadRequestException('Nejdříve zrušte běžící import.');
    }
    await this.prisma.srealityImportJob.delete({ where: { id: jobId } });
    return { ok: true, deletedId: jobId };
  }

  private async processJob(jobId: string) {
    if (this.running.has(jobId)) return;
    this.running.add(jobId);
    try {
      const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
      if (!job || job.cancelRequested || isTerminalStatus(job.status)) return;

      const reporter = this.buildReporter(jobId);
      await reporter.setStage('STARTING_BROWSER', 'Spouštím browser', { status: 'PROCESSING' });

      const preview = await this.importService.runImportForJob(
        job.adminUserId,
        job.sourceUrl,
        reporter,
        {
          retryFromStage: (job.retryFromStage as SrealityImportJobStage | null) ?? undefined,
          existingDraftId: job.draftId ?? undefined,
        },
      );

      const finalStatus: SrealityImportJobStatus =
        preview.imageImportStats.downloaded > 0 &&
        preview.imageImportStats.downloaded < preview.imageImportStats.requested
          ? 'PARTIAL'
          : 'DONE';

      await reporter.setStage(
        finalStatus === 'PARTIAL' ? 'PARTIAL' : 'DONE',
        finalStatus === 'PARTIAL'
          ? `${preview.imageImportStats.downloaded}/${preview.imageImportStats.requested} fotografií importováno`
          : 'Import dokončen',
        {
          status: finalStatus,
          progress: 100,
          draftId: preview.draftId,
          diagnosticsJson: preview.diagnostics as unknown as Prisma.InputJsonValue,
        },
      );
      await this.prisma.srealityImportJob.update({
        where: { id: jobId },
        data: { finishedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : 'SREALITY_IMPORT_FAILED';
      await this.failJob(jobId, code, message);
    } finally {
      this.running.delete(jobId);
    }
  }

  private buildReporter(jobId: string): SrealityImportProgressReporter {
    const appendLog = async (
      message: string,
      level: SrealityImportJobLogEntry['level'] = 'info',
      metadata?: Record<string, unknown>,
    ) => {
      const job = await this.prisma.srealityImportJob.findUnique({
        where: { id: jobId },
        select: { logsJson: true, startedAt: true, status: true, stage: true },
      });
      if (!job) return;
      const logs = this.readLogs(job.logsJson);
      logs.push(this.logEntry(message, level, job.stage, metadata));
      const now = new Date();
      const startedAt = job.startedAt ?? now;
      const elapsed = now.getTime() - startedAt.getTime();
      let status = job.status;
      if (isActiveStatus(status) && elapsed > LONG_RUNNING_MS) status = 'LONG_RUNNING';
      await this.prisma.srealityImportJob.update({
        where: { id: jobId },
        data: {
          logsJson: logs.slice(-MAX_LOG_LINES) as unknown as Prisma.InputJsonValue,
          status,
        },
      });
    };

    return {
      isCancelled: async () => {
        const row = await this.prisma.srealityImportJob.findUnique({
          where: { id: jobId },
          select: { cancelRequested: true, status: true },
        });
        return Boolean(row?.cancelRequested || row?.status === 'CANCELLED');
      },
      setStage: async (stage, message, extra = {}) => {
        const base = STAGE_BASE_PROGRESS[stage] ?? 0;
        const progress = typeof extra.progress === 'number' ? extra.progress : base;
        const job = await this.prisma.srealityImportJob.findUnique({
          where: { id: jobId },
          select: { logsJson: true, startedAt: true },
        });
        const logs = this.readLogs(job?.logsJson);
        logs.push(this.logEntry(message, 'info', stage));
        await this.prisma.srealityImportJob.update({
          where: { id: jobId },
          data: {
            stage,
            progress,
            message,
            stageUpdatedAt: new Date(),
            startedAt: job?.startedAt ?? new Date(),
            status: extra.status ?? 'PROCESSING',
            ...(extra.draftId ? { draftId: extra.draftId } : {}),
            ...(extra.diagnosticsJson ? { diagnosticsJson: extra.diagnosticsJson } : {}),
            ...(extra.browserStatus ? { browserStatus: extra.browserStatus } : {}),
            ...(extra.pageStatus ? { pageStatus: extra.pageStatus } : {}),
            ...(extra.galleryStatus ? { galleryStatus: extra.galleryStatus } : {}),
            ...(extra.agentStatus ? { agentStatus: extra.agentStatus } : {}),
            ...(extra.phoneStatus ? { phoneStatus: extra.phoneStatus } : {}),
            ...(extra.emailStatus ? { emailStatus: extra.emailStatus } : {}),
            ...(typeof extra.imagesFound === 'number' ? { imagesFound: extra.imagesFound } : {}),
            ...(typeof extra.imagesSelected === 'number'
              ? { imagesSelected: extra.imagesSelected }
              : {}),
            ...(typeof extra.imagesProcessed === 'number'
              ? { imagesProcessed: extra.imagesProcessed }
              : {}),
            ...(typeof extra.imagesImported === 'number'
              ? { imagesImported: extra.imagesImported }
              : {}),
            ...(typeof extra.imagesFailed === 'number' ? { imagesFailed: extra.imagesFailed } : {}),
            logsJson: logs.slice(-MAX_LOG_LINES) as unknown as Prisma.InputJsonValue,
          },
        });
      },
      log: appendLog,
      updateCounts: async (counts) => {
        const selected = counts.imagesSelected ?? counts.imagesFound ?? 0;
        const processed = counts.imagesProcessed ?? 0;
        const imported = counts.imagesImported ?? 0;
        const progress =
          counts.stage === 'UPLOADING_IMAGES'
            ? imageUploadProgress(imported, selected)
            : imageCaptureProgress(processed, selected);
        await this.prisma.srealityImportJob.update({
          where: { id: jobId },
          data: {
            ...(typeof counts.imagesFound === 'number' ? { imagesFound: counts.imagesFound } : {}),
            ...(typeof counts.imagesSelected === 'number'
              ? { imagesSelected: counts.imagesSelected }
              : {}),
            ...(typeof counts.imagesProcessed === 'number'
              ? { imagesProcessed: counts.imagesProcessed }
              : {}),
            ...(typeof counts.imagesImported === 'number'
              ? { imagesImported: counts.imagesImported }
              : {}),
            ...(typeof counts.imagesFailed === 'number' ? { imagesFailed: counts.imagesFailed } : {}),
            progress,
            message: counts.message,
          },
        });
      },
    };
  }

  private async failJob(jobId: string, errorCode: string, errorMessage: string) {
    const job = await this.prisma.srealityImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'CANCELLED') return;
    const logs = this.readLogs(job.logsJson);
    logs.push(this.logEntry(errorMessage, 'error', job.stage, { errorCode }));
    await this.prisma.srealityImportJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        stage: 'FAILED',
        progress: job.progress,
        message: 'Import selhal',
        errorCode,
        errorMessage,
        finishedAt: new Date(),
        logsJson: logs.slice(-MAX_LOG_LINES) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readLogs(raw: unknown): SrealityImportJobLogEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is SrealityImportJobLogEntry => Boolean(x && typeof x === 'object'));
  }

  private logEntry(
    message: string,
    level: SrealityImportJobLogEntry['level'],
    stage?: string,
    metadata?: Record<string, unknown>,
  ): SrealityImportJobLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      stage,
      message,
      metadata,
    };
  }

  private toStatusDto(job: JobRow) {
    const elapsedMs = job.startedAt ? Date.now() - job.startedAt.getTime() : 0;
    const stageStalledMs = job.stageUpdatedAt ? Date.now() - job.stageUpdatedAt.getTime() : 0;
    return {
      id: job.id,
      sourceUrl: job.sourceUrl,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      message: job.message,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      elapsedMs,
      stageStalledMs,
      stageStalledWarning: stageStalledMs > STAGE_STALL_MS && isActiveStatus(job.status),
      imagesFound: job.imagesFound,
      imagesSelected: job.imagesSelected,
      imagesProcessed: job.imagesProcessed,
      imagesImported: job.imagesImported,
      imagesFailed: job.imagesFailed,
      agentFound: job.agentStatus === 'FOUND',
      agentStatus: job.agentStatus,
      phoneStatus: job.phoneStatus,
      emailStatus: job.emailStatus,
      browserStatus: job.browserStatus,
      pageStatus: job.pageStatus,
      galleryStatus: job.galleryStatus,
      draftId: job.draftId,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      logs: this.readLogs(job.logsJson),
      diagnostics: job.diagnosticsJson,
    };
  }

  private toHistoryDto(job: JobRow) {
    const elapsedMs =
      job.startedAt && job.finishedAt
        ? job.finishedAt.getTime() - job.startedAt.getTime()
        : job.startedAt
          ? Date.now() - job.startedAt.getTime()
          : 0;
    return {
      id: job.id,
      sourceUrl: job.sourceUrl,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      imagesImported: job.imagesImported,
      imagesSelected: job.imagesSelected,
      agentStatus: job.agentStatus,
      elapsedMs,
      draftId: job.draftId,
      createdAt: job.createdAt.toISOString(),
      errorCode: job.errorCode,
    };
  }
}
