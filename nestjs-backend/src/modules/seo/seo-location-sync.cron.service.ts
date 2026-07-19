import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CsuDataStatService } from './csu-datastat.service';
import { RuianVfrService } from './ruian-vfr.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

@Injectable()
export class SeoLocationSyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SeoLocationSyncCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruianVfr: RuianVfrService,
    private readonly csu: CsuDataStatService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), DAY_MS);
    this.log.log('SEO lokality sync scheduler initialized (daily check)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow(kind: 'ruian-delta' | 'ruian-full' | 'csu') {
    return this.tick(true, kind);
  }

  private async tick(force = false, only?: 'ruian-delta' | 'ruian-full' | 'csu') {
    if (this.running) return { ok: false, error: 'Sync již běží' };
    this.running = true;
    const results: Record<string, unknown> = {};
    try {
      const ruian = await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
      const csu = await this.prisma.seoLocationSource.findFirst({ where: { type: 'CSU' } });

      if (ruian?.autoSync && (!only || only.startsWith('ruian'))) {
        const cfg = (ruian.configJson ?? {}) as { vfr?: { lastFullSyncAt?: string } };
        const lastFull = cfg.vfr?.lastFullSyncAt ? new Date(cfg.vfr.lastFullSyncAt).getTime() : 0;
        const needFull = force && only === 'ruian-full' ? true : Date.now() - lastFull > MONTH_MS;
        if (needFull && (!only || only === 'ruian-full')) {
          results.ruianFull = await this.ruianVfr.runFullImport();
        } else if (!only || only === 'ruian-delta') {
          results.ruianDelta = await this.ruianVfr.syncDeltaChanges();
        }
      }

      if (csu?.autoSync && (!only || only === 'csu')) {
        const last = csu.lastSyncAt?.getTime() ?? 0;
        if (force || Date.now() - last > MONTH_MS) {
          results.csu = await this.csu.syncPopulation();
        }
      }

      return { ok: true, results };
    } catch (err) {
      this.log.warn(`SEO sync tick failed: ${err instanceof Error ? err.message : err}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this.running = false;
    }
  }
}
