import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';

const SETTINGS_ID = 'default';
const TICK_MS = 60_000;

@Injectable()
export class MetaCatalogSyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaCatalogSyncCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: MetaCatalogSyncService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log('[Meta Catalog] Auto-sync scheduler initialized (1 min tick)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.prisma.metaCatalogSetting.findUnique({
        where: { id: SETTINGS_ID },
      });
      if (!settings?.enabled || settings.syncRunning) return;

      const now = new Date();
      if (settings.nextSyncAt && settings.nextSyncAt > now) return;

      this.logger.log(
        `Automatická synchronizace Meta katalogu (interval ${settings.syncIntervalMinutes} min)`,
      );
      await this.sync.runSync('delta');
    } catch (e) {
      this.logger.warn(
        `Meta catalog auto-sync failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
