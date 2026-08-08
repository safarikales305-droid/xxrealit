import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AccommodationSource,
  AccommodationSyncJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapProviderItemToCreate } from './accommodation.serializer';
import { AccommodationProviderRegistry } from './providers/accommodation-provider.registry';

const TICK_MS = 5000;
const BATCH_SIZE = 100;

@Injectable()
export class AccommodationSyncJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AccommodationSyncJobService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AccommodationProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async startSync(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new BadRequestException('Neznámý provider.');
    if (!(await provider.isConfigured())) {
      throw new BadRequestException('Provider není nakonfigurován.');
    }
    const active = await this.prisma.accommodationSyncJob.findFirst({
      where: { provider: providerId, status: { in: [AccommodationSyncJobStatus.PENDING, AccommodationSyncJobStatus.RUNNING] } },
    });
    if (active) return { jobId: active.id, alreadyRunning: true };

    const job = await this.prisma.accommodationSyncJob.create({
      data: { provider: providerId, status: AccommodationSyncJobStatus.PENDING },
    });
    return { jobId: job.id, alreadyRunning: false };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.accommodationSyncJob.findUnique({
      where: { id: jobId },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!job) throw new NotFoundException('Sync job nenalezen.');
    return job;
  }

  async pauseJob(jobId: string) {
    await this.prisma.accommodationSyncJob.updateMany({
      where: { id: jobId, status: AccommodationSyncJobStatus.RUNNING },
      data: { status: AccommodationSyncJobStatus.PAUSED, pauseReason: 'MANUAL_PAUSE' },
    });
    return { success: true };
  }

  async cancelJob(jobId: string) {
    await this.prisma.accommodationSyncJob.updateMany({
      where: {
        id: jobId,
        status: { in: [AccommodationSyncJobStatus.PENDING, AccommodationSyncJobStatus.RUNNING, AccommodationSyncJobStatus.PAUSED] },
      },
      data: { status: AccommodationSyncJobStatus.CANCELLED, finishedAt: new Date() },
    });
    return { success: true };
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    try {
      const job = await this.prisma.accommodationSyncJob.findFirst({
        where: { status: { in: [AccommodationSyncJobStatus.PENDING, AccommodationSyncJobStatus.RUNNING] } },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return;

      if (job.status === AccommodationSyncJobStatus.PENDING) {
        await this.prisma.accommodationSyncJob.update({
          where: { id: job.id },
          data: { status: AccommodationSyncJobStatus.RUNNING, startedAt: new Date() },
        });
      }

      const provider = this.providers.get(job.provider);
      if (!provider) {
        await this.failJob(job.id, 'Provider nenalezen.');
        return;
      }

      const batch = await provider.fetchBatch(job.cursor ?? undefined, BATCH_SIZE);
      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const item of batch.items) {
        try {
          const existing = await this.prisma.accommodation.findFirst({
            where: { provider: job.provider, externalId: item.externalId },
          });
          const source =
            job.provider === 'booking' ? AccommodationSource.BOOKING : AccommodationSource.DEMO;
          if (existing) {
            await this.prisma.accommodation.update({
              where: { id: existing.id },
              data: {
                name: item.name,
                priceFrom: item.priceFrom,
                rating: item.rating,
                reviewCount: item.reviewCount ?? existing.reviewCount,
                lastSyncedAt: new Date(),
              },
            });
            updated++;
          } else {
            await this.prisma.accommodation.create({
              data: mapProviderItemToCreate(item, job.provider, source),
            });
            created++;
          }
        } catch (err) {
          failed++;
          await this.prisma.accommodationSyncLog.create({
            data: {
              jobId: job.id,
              level: 'error',
              message: err instanceof Error ? err.message : String(err),
              externalId: item.externalId,
            },
          });
        }
      }

      const processed = job.processedCount + batch.items.length;
      const done = !batch.hasMore;

      await this.prisma.accommodationSyncJob.update({
        where: { id: job.id },
        data: {
          cursor: batch.nextCursor ?? null,
          page: { increment: 1 },
          processedCount: processed,
          createdCount: { increment: created },
          updatedCount: { increment: updated },
          failedCount: { increment: failed },
          status: done ? AccommodationSyncJobStatus.COMPLETED : AccommodationSyncJobStatus.RUNNING,
          finishedAt: done ? new Date() : null,
        },
      });

      if (done) {
        await this.prisma.accommodationProviderConfig.upsert({
          where: { provider: job.provider },
          create: {
            provider: job.provider,
            lastSyncAt: new Date(),
            importedCount: created,
            updatedCount: updated,
            errorCount: failed,
          },
          update: {
            lastSyncAt: new Date(),
            importedCount: { increment: created },
            updatedCount: { increment: updated },
            errorCount: { increment: failed },
          },
        });
      }
    } finally {
      this.processing = false;
    }
  }

  private async failJob(jobId: string, message: string) {
    await this.prisma.accommodationSyncJob.update({
      where: { id: jobId },
      data: {
        status: AccommodationSyncJobStatus.FAILED,
        lastError: message,
        finishedAt: new Date(),
      },
    });
  }
}
