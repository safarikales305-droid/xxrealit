import { Injectable, Inject, forwardRef, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CompanyImportJobStatus, CompanyImportPartitionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ARES_IMPORT_ENABLED,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import { CompanyImportService } from './company-import.service';

const HEARTBEAT_ID = 'ares-import-primary';
const STALE_PARTITION_MS = 5 * 60 * 1000;
const STALE_WORKER_MS = 120 * 1000;

const ACTIVE_JOB_STATUSES: CompanyImportJobStatus[] = [
  CompanyImportJobStatus.QUEUED,
  CompanyImportJobStatus.PENDING,
  CompanyImportJobStatus.RUNNING,
  CompanyImportJobStatus.PAUSE_REQUESTED,
  CompanyImportJobStatus.CANCEL_REQUESTED,
];

@Injectable()
export class AresImportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ARES-WORKER');
  private readonly workerId = `${process.env.HOSTNAME ?? 'local'}:${process.pid}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private lastPollAt: Date | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompanyImportService))
    private readonly importService: CompanyImportService,
  ) {}

  onModuleInit(): void {
    this.log.log(`[ARES-WORKER] boot workerId=${this.workerId}`);
    this.log.log(
      `[ARES-WORKER] service started enabled=${ARES_IMPORT_ENABLED} tickMs=${ARES_WORKER_TICK_MS}`,
    );
    void this.writeHeartbeat('ONLINE');
    void this.recoverStalePartitions();
    void this.importService.recoverStaleJobs();
    this.timer = setInterval(() => void this.poll(), ARES_WORKER_TICK_MS);
    void this.poll();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    void this.writeHeartbeat('OFFLINE');
  }

  pulse(): void {
    void this.poll();
  }

  async getDiagnostics() {
    let dbOk = true;
    let dbError: string | null = null;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbOk = false;
      dbError = err instanceof Error ? err.message : String(err);
    }

    const heartbeat = await this.prisma.aresWorkerHeartbeat
      .findUnique({ where: { id: HEARTBEAT_ID } })
      .catch(() => null);

    const workerOnline =
      Boolean(heartbeat?.lastHeartbeatAt) &&
      Date.now() - new Date(heartbeat!.lastHeartbeatAt).getTime() < STALE_WORKER_MS;

    const [queuedMaster, runningMaster, pendingPartitions, runningPartitions] =
      await Promise.all([
        this.prisma.companyImportJob.count({
          where: {
            syncType: { in: ['ARES_CZ_MASTER_SYNC', 'ALL_CZECH_COMPANIES'] },
            status: { in: [CompanyImportJobStatus.QUEUED, CompanyImportJobStatus.PENDING] },
          },
        }),
        this.prisma.companyImportJob.count({
          where: {
            syncType: { in: ['ARES_CZ_MASTER_SYNC', 'ALL_CZECH_COMPANIES'] },
            status: CompanyImportJobStatus.RUNNING,
          },
        }),
        this.prisma.companyImportPartition.count({
          where: { status: CompanyImportPartitionStatus.PENDING },
        }),
        this.prisma.companyImportPartition.count({
          where: { status: CompanyImportPartitionStatus.RUNNING },
        }),
      ]);

    return {
      workerOnline,
      workerId: heartbeat?.workerId ?? this.workerId,
      heartbeatAt: heartbeat?.lastHeartbeatAt?.toISOString() ?? null,
      lastPollAt: heartbeat?.lastPollAt?.toISOString() ?? this.lastPollAt?.toISOString() ?? null,
      currentJobId: heartbeat?.currentJobId ?? null,
      currentPartitionId: heartbeat?.currentPartitionId ?? null,
      currentPartitionLabel: heartbeat?.currentPartitionLabel ?? null,
      lastWorkerError: heartbeat?.lastError ?? this.lastError,
      aresImportEnabled: ARES_IMPORT_ENABLED,
      dbConnection: dbOk ? 'OK' : 'ERROR',
      dbError,
      masterJobsQueued: queuedMaster,
      masterJobsRunning: runningMaster,
      pendingPartitions,
      runningPartitions,
    };
  }

  private async poll(): Promise<void> {
    this.lastPollAt = new Date();
    if (!ARES_IMPORT_ENABLED) {
      this.log.warn('[ARES-WORKER] nothing to process — ARES_IMPORT_ENABLED=false');
      await this.writeHeartbeat('DISABLED');
      return;
    }
    if (this.processing) {
      await this.writeHeartbeat('BUSY');
      return;
    }

    this.processing = true;
    try {
      await this.writeHeartbeat('POLLING');
      const pendingJobs = await this.prisma.companyImportJob.count({
        where: { status: { in: ACTIVE_JOB_STATUSES } },
      });
      const pendingPartitions = await this.prisma.companyImportPartition.count({
        where: { status: CompanyImportPartitionStatus.PENDING },
      });
      this.log.log(
        `[ARES-WORKER] polling database pendingJobs=${pendingJobs} pendingPartitions=${pendingPartitions}`,
      );

      if (pendingJobs === 0) {
        this.log.debug('[ARES-WORKER] nothing to process');
        await this.writeHeartbeat('IDLE', { pendingJobs, pendingPartitions });
        return;
      }

      const job = await this.claimNextJob();
      if (!job) {
        this.log.warn('[ARES-WORKER] nothing to process — no claimable job');
        await this.writeHeartbeat('IDLE', { pendingJobs, pendingPartitions });
        return;
      }

      this.log.log(`[ARES-WORKER] claiming job ${job.id} syncType=${job.syncType}`);
      await this.writeHeartbeat('PROCESSING', {
        pendingJobs,
        pendingPartitions,
        currentJobId: job.id,
      });

      await this.importService.processWorkerBatch(job.id, this.workerId);
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log.error(
        `[ARES-WORKER] poll failed: ${this.lastError}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.writeHeartbeat('ERROR', { lastError: this.lastError });
    } finally {
      this.processing = false;
    }
  }

  private async claimNextJob() {
    const candidate = await this.prisma.companyImportJob.findFirst({
      where: { status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return null;

    if (candidate.status === CompanyImportJobStatus.RUNNING) {
      return candidate;
    }

    const claimed = await this.prisma.companyImportJob.updateMany({
      where: {
        id: candidate.id,
        status: {
          in: [
            CompanyImportJobStatus.QUEUED,
            CompanyImportJobStatus.PENDING,
            CompanyImportJobStatus.PAUSE_REQUESTED,
            CompanyImportJobStatus.CANCEL_REQUESTED,
          ],
        },
      },
      data: {
        status: CompanyImportJobStatus.RUNNING,
        startedAt: candidate.startedAt ?? new Date(),
        heartbeatAt: new Date(),
      },
    });
    if (claimed.count === 0) return null;

    return this.prisma.companyImportJob.findUnique({ where: { id: candidate.id } });
  }

  private async recoverStalePartitions() {
    const cutoff = new Date(Date.now() - STALE_PARTITION_MS);
    const recovered = await this.prisma.companyImportPartition.updateMany({
      where: {
        status: CompanyImportPartitionStatus.RUNNING,
        lockedAt: { lt: cutoff },
      },
      data: {
        status: CompanyImportPartitionStatus.PENDING,
        lockedBy: null,
        lockedAt: null,
      },
    });
    if (recovered.count > 0) {
      this.log.warn(`[ARES-WORKER] recovered ${recovered.count} stale RUNNING partitions`);
    }
  }

  private async writeHeartbeat(
    status: string,
    extra?: {
      pendingJobs?: number;
      pendingPartitions?: number;
      currentJobId?: string | null;
      currentPartitionId?: string | null;
      currentPartitionLabel?: string | null;
      lastError?: string | null;
    },
  ) {
    const data: Prisma.AresWorkerHeartbeatUpsertArgs['create'] = {
      id: HEARTBEAT_ID,
      workerId: this.workerId,
      service: 'nestjs-backend',
      status,
      lastHeartbeatAt: new Date(),
      lastPollAt: this.lastPollAt,
      pendingJobs: extra?.pendingJobs ?? 0,
      pendingPartitions: extra?.pendingPartitions ?? 0,
      currentJobId: extra?.currentJobId ?? null,
      currentPartitionId: extra?.currentPartitionId ?? null,
      currentPartitionLabel: extra?.currentPartitionLabel ?? null,
      lastError: extra?.lastError ?? this.lastError,
    };

    try {
      await this.prisma.aresWorkerHeartbeat.upsert({
        where: { id: HEARTBEAT_ID },
        create: data,
        update: data,
      });
    } catch (err) {
      this.log.warn(
        `[ARES-WORKER] heartbeat write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async updateProcessingContext(
    jobId: string | null,
    partitionId: string | null,
    partitionLabel: string | null,
  ) {
    try {
      await this.prisma.aresWorkerHeartbeat.update({
        where: { id: HEARTBEAT_ID },
        data: {
          status: partitionId ? 'PROCESSING' : 'RUNNING',
          currentJobId: jobId,
          currentPartitionId: partitionId,
          currentPartitionLabel: partitionLabel,
          lastHeartbeatAt: new Date(),
        },
      });
    } catch {
      // heartbeat table may not exist yet
    }
  }
}
