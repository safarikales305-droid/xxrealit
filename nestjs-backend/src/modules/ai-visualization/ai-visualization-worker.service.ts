import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiVisualizationService } from './ai-visualization.service';

@Injectable()
export class AiVisualizationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiVisualizationWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly viz: AiVisualizationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2500);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const pending = await this.prisma.aiVisualization.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 2,
        select: { id: true },
      });
      for (const job of pending) {
        await this.viz.processPendingJob(job.id);
      }

      const processing = await this.prisma.aiVisualization.findMany({
        where: { status: 'PROCESSING' },
        select: { id: true, progress: true, generationStartedAt: true },
      });
      for (const row of processing) {
        if (!row.generationStartedAt) continue;
        const age = Date.now() - row.generationStartedAt.getTime();
        if (age > 120_000) continue;
        const next =
          row.progress < 40 ? 25 : row.progress < 65 ? 50 : row.progress < 90 ? 75 : 90;
        if (next > row.progress) {
          await this.prisma.aiVisualization.update({
            where: { id: row.id },
            data: { progress: next },
          });
        }
      }
    } catch (err) {
      this.log.warn(err instanceof Error ? err.message : String(err));
    } finally {
      this.ticking = false;
    }
  }
}
