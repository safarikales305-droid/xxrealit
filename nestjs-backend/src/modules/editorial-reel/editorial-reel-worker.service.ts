import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EditorialReelJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EDITORIAL_REEL_WORKER_TICK_MS } from './editorial-reel.constants';
import { EditorialReelJobService } from './editorial-reel-job.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';

@Injectable()
export class EditorialReelWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EditorialReelWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: EditorialReelJobService,
    private readonly settings: EditorialReelSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), EDITORIAL_REEL_WORKER_TICK_MS);
    void this.ensureDefaultTemplate();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async ensureDefaultTemplate() {
    const existing = await this.prisma.editorialReelTemplate.findFirst({
      where: { isDefault: true },
    });
    if (existing) return;
    await this.prisma.editorialReelTemplate.create({
      data: {
        name: 'Realitní novinky',
        isDefault: true,
        introText: 'Co je nového ve světě realit',
        ctaText: 'Další videa najdete na XXREALIT.cz',
      },
    });
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const cfg = this.settings.getCached();
      if (!cfg.enabled) return;

      const queued = await this.prisma.editorialReelJob.findMany({
        where: { status: EditorialReelJobStatus.QUEUED },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true },
      });
      for (const row of queued) {
        await this.jobs.processQueuedJob(row.id);
      }
    } catch (err) {
      this.log.warn(`Reel worker tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }
}
