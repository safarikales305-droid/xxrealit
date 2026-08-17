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

@Injectable()
export class CompanySeoGenerationJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanySeoGenerationJobService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private cancelRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seoPages: CompanySeoPageService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getStats() {
    const pageStats = await this.seoPages.getStats();
    const activeJob = await this.getActiveJob();
    return { ...pageStats, activeJob: activeJob ? this.serializeJob(activeJob) : null };
  }

  async getProgress() {
    const job = await this.getActiveJob();
    return {
      active: Boolean(job && ['PENDING', 'RUNNING', 'PAUSED'].includes(job.status)),
      job: job ? this.serializeJob(job) : null,
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
      select: { id: true, name: true, ico: true, slug: true },
    });
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
    return items.map((item) => ({
      id: item.id,
      companyId: item.companyId,
      companyName: companyMap[item.companyId]?.name ?? '—',
      companyIco: companyMap[item.companyId]?.ico ?? '',
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

  async startJob(input: {
    type: CompanySeoGenerationJobType;
    filters?: CompanySeoGenerationFilters;
    createdById?: string;
    forceUpdate?: boolean;
  }) {
    const active = await this.getActiveJob();
    if (active && ['PENDING', 'RUNNING', 'PAUSED'].includes(active.status)) {
      throw new BadRequestException('Již běží jiná úloha generování firemních SEO stránek.');
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

    this.cancelRequested = false;
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
    return this.serializeJob(updated);
  }

  async resumeJob() {
    const job = await this.getActiveJob();
    if (!job || job.status !== 'PAUSED') {
      throw new BadRequestException('Žádná pozastavená úloha.');
    }
    this.cancelRequested = false;
    const updated = await this.prisma.companySeoGenerationJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', pausedAt: null, pauseReason: null },
    });
    return this.serializeJob(updated);
  }

  async cancelJob() {
    const job = await this.getActiveJob();
    if (!job) throw new BadRequestException('Žádná aktivní úloha.');
    this.cancelRequested = true;
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
    const job = await this.prisma.companySeoGenerationJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!job || this.cancelRequested) return;

    this.processing = true;
    try {
      if (job.status === 'PENDING') {
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
        return;
      }

      const company = await this.prisma.companyDirectoryEntry.findUnique({
        where: { id: item.companyId },
        select: { name: true },
      });
      await this.prisma.companySeoGenerationJob.update({
        where: { id: job.id },
        data: { currentItem: company?.name ?? item.companyId },
      });
      await this.prisma.companySeoGenerationItem.update({
        where: { id: item.id },
        data: { status: 'RUNNING', attempt: { increment: 1 }, phase: 'generating' },
      });

      const filters = (job.filtersJson ?? {}) as CompanySeoGenerationFilters;
      const forceUpdate = !filters.onlyMissing;
      const result = await this.seoPages.generateForCompany(item.companyId, {
        forceUpdate,
        skipEnrichmentWait: job.type === 'TEST',
      });

      let itemStatus: CompanySeoGenerationItemStatus = 'COMPLETED';
      let seoPageId: string | null = null;
      let qualityScore: number | null = null;
      let errorCode: string | null = null;
      let errorMessage: string | null = null;

      if (result.action === 'created' || result.action === 'updated') {
        seoPageId = result.seoPageId;
        const page = await this.prisma.companySeoPage.findUnique({ where: { id: result.seoPageId } });
        qualityScore = page?.seoScore ?? null;
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
      }

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

      await this.prisma.companySeoGenerationJob.update({
        where: { id: job.id },
        data: {
          processedCount: { increment: 1 },
          createdCount: result.action === 'created' ? { increment: 1 } : undefined,
          updatedCount: result.action === 'updated' ? { increment: 1 } : undefined,
          skippedCount: itemStatus === 'SKIPPED' || itemStatus === 'WAITING_FOR_ENRICHMENT' ? { increment: 1 } : undefined,
          failedCount: itemStatus === 'FAILED' ? { increment: 1 } : undefined,
        },
      });

      await new Promise((r) => setTimeout(r, ITEM_DELAY_MS));
    } catch (err) {
      this.log.error(`Company SEO job tick failed: ${err instanceof Error ? err.message : err}`);
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
  }) {
    const progressPct = job.requestedCount
      ? Math.round((job.processedCount / job.requestedCount) * 1000) / 10
      : 0;
    return {
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
      createdAt: job.createdAt.toISOString(),
    };
  }
}
