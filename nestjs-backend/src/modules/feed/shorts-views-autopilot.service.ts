import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ShortsViewsAutopilotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ShortsViewsAutopilotService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Lightweight scheduler without extra runtime dependency.
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const rows = await this.prisma.property.findMany({
        where: {
          deletedAt: null,
          autoViewsEnabled: true,
          listingType: 'SHORTS',
        },
        select: {
          id: true,
          viewsCount: true,
          autoViewsIncrement: true,
          autoViewsIntervalMinutes: true,
          lastAutoViewsAt: true,
        },
      });
      let touched = 0;
      for (const row of rows) {
        const increment = Math.trunc(row.autoViewsIncrement ?? 0);
        const intervalMinutes = Math.trunc(row.autoViewsIntervalMinutes ?? 0);
        if (increment <= 0 || intervalMinutes <= 0) continue;
        const intervalMs = intervalMinutes * 60_000;
        const base = row.lastAutoViewsAt ?? now;
        const elapsedMs = now.getTime() - base.getTime();
        const steps = Math.floor(elapsedMs / intervalMs);
        if (steps <= 0) continue;
        const added = steps * increment;
        const nextViews = Math.max(0, Math.trunc(row.viewsCount ?? 0) + added);
        const nextLastAuto = new Date(base.getTime() + steps * intervalMs);
        await this.prisma.property.update({
          where: { id: row.id },
          data: {
            viewsCount: nextViews,
            lastAutoViewsAt: nextLastAuto,
          },
        });
        touched += 1;
      }
      if (touched > 0) {
        this.log.log(`[auto-views] updated ${touched} shorts rows`);
      }
    } catch (error) {
      this.log.error('[auto-views] tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
