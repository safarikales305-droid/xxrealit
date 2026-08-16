import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyGoogleMatchStatus,
  CompanyProviderJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyAuditService } from './company-audit.service';
import {
  GOOGLE_COMPANY_ENRICHMENT_ENABLED,
  GOOGLE_ENRICHMENT_BATCH_SIZE,
  GOOGLE_ENRICHMENT_DELAY_MS,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import { computeJobProgress } from './company-job-progress.util';
import { GooglePlacesReputationProvider } from './google-places-reputation.provider';

@Injectable()
export class CompanyGoogleEnrichmentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyGoogleEnrichmentService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GooglePlacesReputationProvider,
    private readonly audit: CompanyAuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async startJob(input: {
    companyIds?: string[];
    category?: string;
    region?: string;
    city?: string;
    batchSize?: number;
    delayMs?: number;
    limit?: number;
  }) {
    if (!GOOGLE_COMPANY_ENRICHMENT_ENABLED) {
      throw new BadRequestException('Google enrichment je vypnuté.');
    }

    let companyIds = input.companyIds ?? [];
    if (companyIds.length === 0) {
      const rows = await this.prisma.companyDirectoryEntry.findMany({
        where: {
          googleMatchStatus: CompanyGoogleMatchStatus.NOT_SEARCHED,
          ...(input.region ? { region: { contains: input.region, mode: 'insensitive' } } : {}),
          ...(input.city ? { city: { contains: input.city, mode: 'insensitive' } } : {}),
        },
        take: Math.min(input.limit ?? 3, 10),
        select: { id: true },
      });
      companyIds = rows.map((r) => r.id);
    }

    if (companyIds.length === 0) {
      throw new BadRequestException('Žádné firmy k obohacení.');
    }

    return this.prisma.companyGoogleEnrichmentJob.create({
      data: {
        category: input.category as Prisma.CompanyGoogleEnrichmentJobCreateInput['category'],
        region: input.region ?? null,
        city: input.city ?? null,
        companyIds,
        totalExpected: companyIds.length,
        batchSize: input.batchSize ?? GOOGLE_ENRICHMENT_BATCH_SIZE,
        delayMs: input.delayMs ?? GOOGLE_ENRICHMENT_DELAY_MS,
        status: CompanyProviderJobStatus.PENDING,
      },
    });
  }

  async listJobs() {
    const jobs = await this.prisma.companyGoogleEnrichmentJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return jobs.map((j) => this.serializeJob(j));
  }

  async getJob(id: string) {
    const job = await this.prisma.companyGoogleEnrichmentJob.findUnique({ where: { id } });
    if (!job) throw new BadRequestException('Job nenalezen.');
    return this.serializeJob(job);
  }

  async pauseJob(id: string) {
    return this.prisma.companyGoogleEnrichmentJob.update({
      where: { id },
      data: { status: CompanyProviderJobStatus.PAUSED },
    });
  }

  async resumeJob(id: string) {
    return this.prisma.companyGoogleEnrichmentJob.update({
      where: { id },
      data: { status: CompanyProviderJobStatus.PENDING },
    });
  }

  async matchSingleCompany(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const match = await this.google.matchPlace({
      companyName: company.name,
      street: company.street,
      city: company.city,
      postalCode: company.postalCode,
      phone: company.phone,
      website: company.website,
    });

    if (!match) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { googleMatchStatus: CompanyGoogleMatchStatus.NOT_FOUND },
      });
      return { matched: false };
    }

    const apply = this.google.shouldAutoApply(match.matchStatus);
    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: {
        googleMatchStatus: match.matchStatus,
        googleMatchScore: match.matchScore,
        ...(apply
          ? {
              googlePlaceId: match.placeId,
              googleRating: match.rating,
              googleReviewCount: match.userRatingCount,
              googleMapsUri: match.googleMapsUri,
              googleLastSyncAt: new Date(),
            }
          : {}),
      },
    });

    await this.audit.log({
      companyId,
      action: 'GOOGLE_MATCH',
      message: `Google match ${match.matchStatus} (${match.matchScore}%)`,
    });

    return { matched: true, match };
  }

  private async tick() {
    if (this.processing || !GOOGLE_COMPANY_ENRICHMENT_ENABLED) return;
    const job = await this.prisma.companyGoogleEnrichmentJob.findFirst({
      where: {
        status: { in: [CompanyProviderJobStatus.PENDING, CompanyProviderJobStatus.RUNNING] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return;

    this.processing = true;
    try {
      await this.processBatch(job.id);
    } finally {
      this.processing = false;
    }
  }

  private async processBatch(jobId: string) {
    const job = await this.prisma.companyGoogleEnrichmentJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const batchSize = job.batchSize ?? GOOGLE_ENRICHMENT_BATCH_SIZE;
    const delayMs = job.delayMs ?? GOOGLE_ENRICHMENT_DELAY_MS;
    const ids = job.companyIds;
    const start = job.lastCursor;
    const slice = ids.slice(start, start + batchSize);

    if (slice.length === 0) {
      await this.prisma.companyGoogleEnrichmentJob.update({
        where: { id: jobId },
        data: { status: CompanyProviderJobStatus.COMPLETED, finishedAt: new Date() },
      });
      return;
    }

    await this.prisma.companyGoogleEnrichmentJob.update({
      where: { id: jobId },
      data: {
        status: CompanyProviderJobStatus.RUNNING,
        startedAt: job.startedAt ?? new Date(),
        lastActivityAt: new Date(),
      },
    });

    let processed = job.processed;
    let matched = job.matched;
    let failed = job.failed;
    let notFound = job.notFound;
    let needsReview = job.needsReview;
    let requestsCount = job.requestsCount;

    for (const companyId of slice) {
      requestsCount += 1;
      try {
        const result = await this.matchSingleCompany(companyId);
        processed += 1;
        if (!result.matched) {
          notFound += 1;
        } else if (
          result.match?.matchStatus === CompanyGoogleMatchStatus.MATCHED_HIGH ||
          result.match?.matchStatus === CompanyGoogleMatchStatus.MATCHED_MEDIUM
        ) {
          matched += 1;
        } else if (result.match?.matchStatus === CompanyGoogleMatchStatus.REVIEW_REQUIRED) {
          needsReview += 1;
        } else if (result.match?.matchStatus === CompanyGoogleMatchStatus.NOT_FOUND) {
          notFound += 1;
        }

        await this.prisma.companyGoogleEnrichmentItem.create({
          data: {
            jobId,
            companyId,
            matchStatus: result.match?.matchStatus ?? CompanyGoogleMatchStatus.NOT_FOUND,
            matchScore: result.match?.matchScore ?? null,
          },
        });
      } catch (err) {
        failed += 1;
        processed += 1;
        await this.prisma.companyGoogleEnrichmentItem.create({
          data: {
            jobId,
            companyId,
            matchStatus: CompanyGoogleMatchStatus.NOT_FOUND,
            errorMessage: err instanceof Error ? err.message.slice(0, 500) : 'Chyba',
          },
        });
      }
      await this.sleep(delayMs);
    }

    const nextCursor = start + slice.length;
    const done = nextCursor >= ids.length;

    await this.prisma.companyGoogleEnrichmentJob.update({
      where: { id: jobId },
      data: {
        processed,
        matched,
        failed,
        notFound,
        needsReview,
        requestsCount,
        lastCursor: nextCursor,
        lastActivityAt: new Date(),
        status: done ? CompanyProviderJobStatus.COMPLETED : CompanyProviderJobStatus.PENDING,
        finishedAt: done ? new Date() : null,
      },
    });
  }

  private serializeJob(job: {
    id: string;
    status: CompanyProviderJobStatus;
    processed: number;
    matched: number;
    failed: number;
    notFound: number;
    needsReview: number;
    totalExpected: number | null;
    requestsCount: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastActivityAt: Date | null;
    error: string | null;
    createdAt: Date;
  }) {
    const progress = computeJobProgress(job.processed, job.totalExpected, job.startedAt);
    return {
      ...job,
      progress,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      lastActivityAt: job.lastActivityAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
