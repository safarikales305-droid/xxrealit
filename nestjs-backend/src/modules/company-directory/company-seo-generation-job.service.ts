import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CompanySeoGenerationItemStatus,
  CompanySeoGenerationJobStatus,
  CompanySeoGenerationJobType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ARES_WORKER_TICK_MS } from './company-directory.constants';
import { CompanySeoPageService } from './company-seo-page.service';
import type { CompanySeoGenerationFilters } from './company-seo-page.types';

const ITEM_DELAY_MS = 2500;
const STALE_JOB_MS = 10 * 60 * 1000;
const WORKER_ONLINE_MS = 30_000;

let workerLastHeartbeat: Date | null = null;

@Injectable()
export class CompanySeoGenerationJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanySeoGenerationJobService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seoPages: CompanySeoPageService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
    void this.recoverStaleJobs();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getWorkerStatus() {
    const last = workerLastHeartbeat;
    const ageMs = last ? Date.now() - last.getTime() : null;
    return {
      online: ageMs != null && ageMs < WORKER_ONLINE_MS,
      lastHeartbeat: last?.toISOString() ?? null,
      heartbeatAgeMs: ageMs,
    };
  }

  async getStats() {
    const pageStats = await this.seoPages.getStats();
    const activeJob = await this.getActiveJob();
    return { ...pageStats, activeJob: activeJob ? this.serializeJob(activeJob) : null };
  }

  async getProgress() {
    const job = await this.getActiveJob();
    const recent = await this.listJobs(10);
    const worker = this.getWorkerStatus();
    const staleWarning =
      job?.status === 'RUNNING' &&
      job.updatedAt &&
      Date.now() - new Date(job.updatedAt).getTime() > STALE_JOB_MS;

    return {
      active: Boolean(job && ['PENDING', 'RUNNING', 'PAUSED'].includes(job.status)),
      job: job ? this.serializeJob(job) : null,
      worker,
      staleWarning,
      recentJobs: recent,
    };
  }

  async listJobs(limit = 20) {
    const rows = await this.prisma.companySeoGenerationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
    });
    return rows.map((r) => this.serializeJob(r));
  }

  async getJobItems(jobId: string) {
    const items = await this.prisma.companySeoGenerationItem.findMany({
      where: { jobId },
      include: {
        seoPage: { select: { id: true, slug: true, status: true, seoScore: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const companies = await this.prisma.companyDirectoryEntry.findMany({
      where: { id: { in: items.map((i) => i.companyId) } },
      select: { id: true, name: true, ico: true, slug: true, city: true },
    });
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
    return items.map((item, index) => ({
      order: index + 1,
      id: item.id,
      companyId: item.companyId,
      companyName: companyMap[item.companyId]?.name ?? '—',
      companyIco: companyMap[item.companyId]?.ico ?? '',
      localityName: companyMap[item.companyId]?.city ?? null,
      slug: companyMap[item.companyId]?.slug ?? item.seoPage?.slug ?? '',
      status: item.status,
      phase: item.phase,
      attempt: item.attempt,
      qualityScore: item.qualityScore,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      seoPageId: item.seoPageId,
      previewUrl: item.seoPageId ? `/admin/seo/firmy/${item.seoPageId}/preview` : null,
      publicUrl: companyMap[item.companyId]?.slug ? `/firmy/${companyMap[item.companyId]!.slug}` : null,
    }));
  }

  async recoverStaleJob(jobId?: string) {
    const cutoff = new Date(Date.now() - STALE_JOB_MS);
    const stale = await this.prisma.companySeoGenerationJob.findMany({
      where: jobId
        ? { id: jobId }
        : { status: CompanySeoGenerationJobStatus.RUNNING, updatedAt: { lt: cutoff } },
    });
    let recovered = 0;
    for (const job of stale) {
      if (
        job.status !== CompanySeoGenerationJobStatus.RUNNING &&
        job.status !== CompanySeoGenerationJobStatus.PENDING
      ) {
        continue;
      }
      await this.prisma.companySeoGenerationItem.updateMany({
        where: { jobId: job.id, status: CompanySeoGenerationItemStatus.RUNNING },
        data: { status: CompanySeoGenerationItemStatus.PENDING, phase: 'RECOVERED' },
      });
      await this.prisma.companySeoGenerationJob.update({
        where: { id: job.id },
        data: {
          status: CompanySeoGenerationJobStatus.PENDING,
          currentItem: null,
          lastError: 'Úloha obnovena po neaktivním workeru.',
        },
      });
      recovered += 1;
      this.log.warn(`[SEO-JOB] recovered stale company job=${job.id}`);
    }
    if (recovered) void this.tick();
    return { recovered };
  }

  private async recoverStaleJobs() {
    const result = await this.recoverStaleJob();
    if (result.recovered > 0) {
      this.log.log(`[SEO-JOB] recovered ${result.recovered} stale company job(s) on startup`);
    }
  }

  async startJob(input: {
    type: CompanySeoGenerationJobType;
    filters?: CompanySeoGenerationFilters;
    createdById?: string;
    forceUpdate?: boolean;
  }) {
    const existing = await this.getActiveJob();
    if (existing && ['PENDING', 'RUNNING', 'PAUSED'].includes(existing.status)) {
      this.log.log(`[SEO-JOB] duplicate prevented — returning active company job ${existing.id}`);
      return { ...this.serializeJob(existing), existing: true };
    }

    const filters: CompanySeoGenerationFilters = {
      onlyMissing: input.type !== 'TEST' && !input.forceUpdate,
      ...input.filters,
    };
    if (input.type === 'TEST') filters.onlyMissing = false;

    const limit =
      input.type === 'TEST' ? 1 : input.type === 'BATCH_10' ? 10 : input.type === 'BATCH_100' ? 100 : 50;

    const companies = await this.prisma.companyDirectoryEntry.findMany({
      where: this.seoPages.buildEligibilityWhere(filters),
      select: { id: true, name: true },
      orderBy: [{ contentEnrichedAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    if (!companies.length) {
      throw new BadRequestException('Nebyla nalezena žádná firma odpovídající filtru.');
    }

    const job = await this.prisma.companySeoGenerationJob.create({
      data: {
        type: input.type,
        status: CompanySeoGenerationJobStatus.PENDING,
        requestedCount: companies.length,
        filtersJson: filters as object,
        createdById: input.createdById,
        items: {
          create: companies.map((c) => ({
            companyId: c.id,
            status: CompanySeoGenerationItemStatus.PENDING,
          })),
        },
      },
    });

    this.log.log(`[SEO-JOB] created company job=${job.id} items=${companies.length}`);
    void this.tick();
    return this.serializeJob(job);
  }

  async pauseJob() {
    const job = await this.getActiveJob();
    if (!job || job.status !== 'RUNNING') {
      throw new BadRequestException('Žádná běžící úloha.');
    }
    const updated = await this.prisma.companySeoGenerationJob.update({
      where: { id: job.id },
      data: { status: 'PAUSED', pausedAt: new Date(), pauseReason: 'admin_pause' },
    });
    this.log.log(`[SEO-JOB] paused company job=${job.id}`);
    return this.serializeJob(updated);
  }

  async resumeJob() {
    const job = await this.getActiveJob();
    if (!job || job.status !== 'PAUSED') {
      throw new BadRequestException('Žádná pozastavená úloha.');
    }
    const updated = await this.prisma.companySeoGenerationJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', pausedAt: null, pauseReason: null },
    });
    this.log.log(`[SEO-JOB] resumed company job=${job.id}`);
    void this.tick();
    return this.serializeJob(updated);
  }

  async cancelJob() {
    const job = await this.getActiveJob();
    if (!job) throw new BadRequestException('Žádná aktivní úloha.');
    const updated = await this.prisma.companySeoGenerationJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        finishedAt: new Date(),
        pauseReason: 'admin_cancel',
      },
    });
    await this.prisma.companySeoGenerationItem.updateMany({
      where: { jobId: job.id, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'SKIPPED', errorCode: 'CANCELLED' },
    });
    this.log.log(`[SEO-JOB] cancelled company job=${job.id}`);
    return this.serializeJob(updated);
  }

  private async getActiveJob() {
    return this.prisma.companySeoGenerationJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async tick() {
    if (this.processing) return;
    workerLastHeartbeat = new Date();
    this.processing = true;
    try {
      const job = await this.prisma.companySeoGenerationJob.findFirst({
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return;

      const fresh = await this.prisma.companySeoGenerationJob.findUnique({ where: { id: job.id } });
      if (!fresh || fresh.status === 'PAUSED' || fresh.status === 'CANCELLED') return;

      if (job.status === 'PENDING') {
        this.log.log(`[SEO-JOB] worker picked company job=${job.id}`);
        await this.prisma.companySeoGenerationJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });
      }

      const item = await this.prisma.companySeoGenerationItem.findFirst({
        where: { jobId: job.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!item) {
        await this.prisma.companySeoGenerationJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', finishedAt: new Date(), currentItem: null },
        });
        this.log.log(`[SEO-JOB] completed company job=${job.id}`);
        return;
      }

      const statusCheck = await this.prisma.companySeoGenerationJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (statusCheck?.status === 'PAUSED' || statusCheck?.status === 'CANCELLED') return;

      const company = await this.prisma.companyDirectoryEntry.findUnique({
        where: { id: item.companyId },
        select: { name: true, city: true },
      });
      const label = company ? `${company.name}${company.city ? ` — ${company.city}` : ''}` : item.companyId;
      const itemIndex = job.processedCount + 1;

      this.log.log(
        `[SEO-JOB] processing company item ${itemIndex}/${job.requestedCount} job=${job.id} company=${label}`,
      );

      await this.prisma.companySeoGenerationJob.update({
        where: { id: job.id },
        data: { currentItem: label },
      });
      await this.prisma.companySeoGenerationItem.update({
        where: { id: item.id },
        data: { status: 'RUNNING', attempt: { increment: 1 }, phase: 'generating' },
      });

      const started = Date.now();
      const filters = (job.filtersJson ?? {}) as CompanySeoGenerationFilters;
      const forceUpdate = !filters.onlyMissing;
      let itemStatus: CompanySeoGenerationItemStatus = 'COMPLETED';
      let seoPageId: string | null = null;
      let qualityScore: number | null = null;
      let errorCode: string | null = null;
      let errorMessage: string | null = null;
      let createdDelta = 0;
      let updatedDelta = 0;

      try {
        const result = await this.seoPages.generateForCompany(item.companyId, {
          forceUpdate,
          skipEnrichmentWait: job.type === 'TEST',
        });

        if (result.action === 'created' || result.action === 'updated') {
          seoPageId = result.seoPageId;
          const page = await this.prisma.companySeoPage.findUnique({ where: { id: result.seoPageId } });
          qualityScore = page?.seoScore ?? null;
          if (result.action === 'created') createdDelta = 1;
          if (result.action === 'updated') updatedDelta = 1;
          this.log.log(`[SEO-JOB] company page saved job=${job.id} page=${result.seoPageId}`);
        } else if (result.action === 'skipped') {
          itemStatus = 'SKIPPED';
          errorCode = result.reason;
          errorMessage =
            result.reason === 'SEO_PAGE_EXISTS'
              ? 'SEO stránka již existuje — použijte Aktualizovat'
              : result.reason;
        } else if (result.action === 'waiting_enrichment') {
          itemStatus = 'WAITING_FOR_ENRICHMENT';
          errorCode = 'WAITING_FOR_ENRICHMENT';
        } else {
          itemStatus = 'FAILED';
          errorCode = 'ERROR';
          errorMessage = result.error;
          this.log.warn(
            `[SEO-JOB] company item failed job=${job.id} item=${item.id} error=${errorMessage ?? 'unknown'}`,
          );
        }
      } catch (err) {
        itemStatus = 'FAILED';
        errorCode = 'ERROR';
        errorMessage = err instanceof Error ? err.message : String(err);
        this.log.error(
          `[SEO-JOB] company item exception job=${job.id} item=${item.id} error=${errorMessage}`,
        );
      }

      const durationMs = Date.now() - started;

      await this.prisma.companySeoGenerationItem.update({
        where: { id: item.id },
        data: {
          status: itemStatus,
          seoPageId,
          qualityScore,
          errorCode,
          errorMessage,
          phase: 'done',
        },
      });

      const progressPct = Math.round(((job.processedCount + 1) / job.requestedCount) * 100);
      await this.prisma.companySeoGenerationJob.update({
        where: { id: job.id },
        data: {
          processedCount: { increment: 1 },
          createdCount: createdDelta ? { increment: createdDelta } : undefined,
          updatedCount: updatedDelta ? { increment: updatedDelta } : undefined,
          skippedCount:
            itemStatus === 'SKIPPED' || itemStatus === 'WAITING_FOR_ENRICHMENT' ? { increment: 1 } : undefined,
          failedCount: itemStatus === 'FAILED' ? { increment: 1 } : undefined,
        },
      });

      this.log.log(`[SEO-JOB] progress ${progressPct}% company job=${job.id} duration=${durationMs}ms`);

      await new Promise((r) => setTimeout(r, ITEM_DELAY_MS));
    } catch (err) {
      this.log.error(`[SEO-JOB] company job tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.processing = false;
    }
  }

  private serializeJob(job: {
    id: string;
    type: CompanySeoGenerationJobType;
    status: CompanySeoGenerationJobStatus;
    requestedCount: number;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    currentItem: string | null;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    pausedAt: Date | null;
    createdAt: Date;
    updatedAt?: Date;
  }) {
    const progressPct = job.requestedCount
      ? Math.round((job.processedCount / job.requestedCount) * 1000) / 10
      : 0;
    return {
      id: job.id,
      jobId: job.id,
      type: job.type,
      status: job.status,
      requestedCount: job.requestedCount,
      processedCount: job.processedCount,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      progressPct,
      currentItem: job.currentItem,
      lastError: job.lastError,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      pausedAt: job.pausedAt?.toISOString() ?? null,
      lastActivityAt: job.updatedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }
}
