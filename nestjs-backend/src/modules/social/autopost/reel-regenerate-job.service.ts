import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ListingReelFinalVideoResult } from './listing-reel-final-video.service';

export type ReelRegenerateJobStatus = 'pending' | 'running' | 'done' | 'error';

export type ReelRegenerateJob = {
  jobId: string;
  kind: 'single' | 'bulk';
  status: ReelRegenerateJobStatus;
  scheduleId: string | null;
  total: number;
  processed: number;
  percent: number;
  currentListingTitle: string | null;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  errorMessage: string | null;
  result: {
    scheduleId: string;
    result: ListingReelFinalVideoResult;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const JOB_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class ReelRegenerateJobService {
  private readonly jobs = new Map<string, ReelRegenerateJob>();

  createJob(input: { kind: 'single' | 'bulk'; scheduleId?: string }): string {
    this.pruneExpired();
    const jobId = randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    this.jobs.set(jobId, {
      jobId,
      kind: input.kind,
      status: 'pending',
      scheduleId: input.scheduleId ?? null,
      total: input.kind === 'single' ? 1 : 0,
      processed: 0,
      percent: 0,
      currentListingTitle: null,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      errorMessage: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    });
    return jobId;
  }

  getJob(jobId: string): ReelRegenerateJob {
    this.pruneExpired();
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('Job přegenerování nenalezen');
    return job;
  }

  updateJob(jobId: string, patch: Partial<ReelRegenerateJob>): ReelRegenerateJob {
    const current = this.jobs.get(jobId);
    if (!current) throw new NotFoundException('Job přegenerování nenalezen');
    const updated: ReelRegenerateJob = {
      ...current,
      ...patch,
      jobId: current.jobId,
      kind: current.kind,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  private pruneExpired(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [jobId, job] of this.jobs) {
      if (Date.parse(job.updatedAt) < cutoff) {
        this.jobs.delete(jobId);
      }
    }
  }
}
