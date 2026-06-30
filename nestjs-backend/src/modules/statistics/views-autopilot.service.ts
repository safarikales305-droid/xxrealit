import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Property, StatisticsSettings } from '@prisma/client';
import {
  dayKeyUtc,
  isShortsListing,
  propertyTotalViews,
  randomIntInRange,
} from '../../common/listing-statistics.util';
import { PrismaService } from '../../database/prisma.service';
import { StatisticsSettingsService } from './statistics-settings.service';

type PropertyAutopilotRow = Pick<
  Property,
  | 'id'
  | 'listingType'
  | 'videoUrl'
  | 'realViews'
  | 'manualViews'
  | 'autopilotViews'
  | 'viewsCount'
  | 'viewsAutopilotEnabled'
  | 'autoViewsEnabled'
  | 'viewsAutopilotRatePerHour'
  | 'viewsAutopilotRateMin'
  | 'viewsAutopilotRateMax'
  | 'viewsAutopilotIntervalMinutes'
  | 'viewsAutopilotMaxPerDay'
  | 'viewsAutopilotMaxTotal'
  | 'autoViewsIncrement'
  | 'autoViewsIntervalMinutes'
  | 'lastAutopilotViewsAt'
  | 'lastAutoViewsAt'
  | 'autopilotViewsDayKey'
  | 'autopilotViewsAddedToday'
  | 'publishedAt'
  | 'createdAt'
>;

@Injectable()
export class ViewsAutopilotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ViewsAutopilotService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: StatisticsSettingsService,
  ) {}

  onModuleInit() {
    this.log.log('[views-autopilot] scheduler initialized (tick each 30s)');
    this.timer = setInterval(() => void this.tick(), 30_000);
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
      const settings = await this.settingsService.get();
      const now = new Date();
      const rows = await this.prisma.property.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          approved: true,
          OR: [{ viewsAutopilotEnabled: true }, { autoViewsEnabled: true }],
        },
        select: {
          id: true,
          listingType: true,
          videoUrl: true,
          realViews: true,
          manualViews: true,
          autopilotViews: true,
          viewsCount: true,
          viewsAutopilotEnabled: true,
          autoViewsEnabled: true,
          viewsAutopilotRatePerHour: true,
          viewsAutopilotRateMin: true,
          viewsAutopilotRateMax: true,
          viewsAutopilotIntervalMinutes: true,
          viewsAutopilotMaxPerDay: true,
          viewsAutopilotMaxTotal: true,
          autoViewsIncrement: true,
          autoViewsIntervalMinutes: true,
          lastAutopilotViewsAt: true,
          lastAutoViewsAt: true,
          autopilotViewsDayKey: true,
          autopilotViewsAddedToday: true,
          publishedAt: true,
          createdAt: true,
        },
      });

      let touched = 0;
      for (const row of rows) {
        const added = await this.processRow(row, settings, now);
        if (added > 0) touched += 1;
      }
      if (touched > 0) {
        this.log.log(`[views-autopilot] updated ${touched} listings`);
      }
    } catch (error) {
      this.log.error('[views-autopilot] tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  private async processRow(
    row: PropertyAutopilotRow,
    settings: StatisticsSettings,
    now: Date,
  ): Promise<number> {
    const shorts = isShortsListing(row);
    const globalEnabled = shorts
      ? settings.shortsViewsAutopilotEnabled
      : settings.classicViewsAutopilotEnabled;
    const perListingEnabled = row.viewsAutopilotEnabled || row.autoViewsEnabled;
    if (!globalEnabled || !perListingEnabled) return 0;

    const legacyMode = row.autoViewsEnabled && !row.viewsAutopilotEnabled;
    if (legacyMode) {
      return this.processLegacyRow(row, now);
    }

    const intervalMinutes =
      row.viewsAutopilotIntervalMinutes ??
      (shorts ? settings.shortsViewsIntervalMinutes : settings.classicViewsIntervalMinutes);
    if (intervalMinutes <= 0) return 0;

    const lastAt = row.lastAutopilotViewsAt ?? row.lastAutoViewsAt;
    if (!lastAt) {
      await this.prisma.property.update({
        where: { id: row.id },
        data: { lastAutopilotViewsAt: now, lastAutoViewsAt: now },
      });
      return 0;
    }

    const intervalMs = intervalMinutes * 60_000;
    const elapsedMs = now.getTime() - lastAt.getTime();
    const steps = Math.floor(elapsedMs / intervalMs);
    if (steps <= 0) return 0;

    const rateMin =
      row.viewsAutopilotRateMin ??
      (shorts ? settings.shortsViewsRateMin : settings.classicViewsRateMin);
    const rateMax =
      row.viewsAutopilotRateMax ??
      (shorts ? settings.shortsViewsRateMax : settings.classicViewsRateMax);
    const ratePerHour =
      row.viewsAutopilotRatePerHour ??
      (shorts ? settings.shortsViewsRatePerHour : settings.classicViewsRatePerHour);

    let perStep = randomIntInRange(rateMin, rateMax);
    if (perStep <= 0 && ratePerHour > 0) {
      perStep = Math.max(1, Math.round(ratePerHour * (intervalMinutes / 60)));
    }
    if (perStep <= 0) return 0;

    const publishedAt = row.publishedAt ?? row.createdAt;
    const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
    if (ageHours <= settings.newListingBoostHours) {
      perStep = Math.max(1, Math.round(perStep * settings.newListingBoostMultiplier));
    }

    let toAdd = perStep * steps;
    const maxTotal =
      row.viewsAutopilotMaxTotal ??
      (shorts ? settings.shortsViewsMaxTotal : settings.classicViewsMaxTotal);
    if (maxTotal > 0) {
      const remaining = maxTotal - row.autopilotViews;
      if (remaining <= 0) return 0;
      toAdd = Math.min(toAdd, remaining);
    }

    const maxPerDay =
      row.viewsAutopilotMaxPerDay ??
      (shorts ? settings.shortsViewsMaxPerDay : settings.classicViewsMaxPerDay);
    const todayKey = dayKeyUtc(now);
    let addedToday = row.autopilotViewsAddedToday;
    if (row.autopilotViewsDayKey !== todayKey) {
      addedToday = 0;
    }
    if (maxPerDay > 0) {
      const dayRemaining = maxPerDay - addedToday;
      if (dayRemaining <= 0) return 0;
      toAdd = Math.min(toAdd, dayRemaining);
    }

    if (toAdd <= 0) return 0;

    const nextAutopilot = row.autopilotViews + toAdd;
    const total = propertyTotalViews({
      realViews: row.realViews,
      manualViews: row.manualViews,
      autopilotViews: nextAutopilot,
    });

    await this.prisma.property.update({
      where: { id: row.id },
      data: {
        autopilotViews: nextAutopilot,
        viewsCount: total,
        lastAutopilotViewsAt: now,
        lastAutoViewsAt: now,
        autopilotViewsDayKey: todayKey,
        autopilotViewsAddedToday: addedToday + toAdd,
      },
    });
    this.log.log(`[views-autopilot] id=${row.id} add=${toAdd} total=${total}`);
    return toAdd;
  }

  /** Zachová původní chování autoViewsIncrement / autoViewsIntervalMinutes. */
  private async processLegacyRow(row: PropertyAutopilotRow, now: Date): Promise<number> {
    const increment = Math.trunc(row.autoViewsIncrement ?? 0);
    const intervalMinutes = Math.trunc(row.autoViewsIntervalMinutes ?? 0);
    if (increment <= 0 || intervalMinutes <= 0) return 0;

    const lastAt = row.lastAutoViewsAt ?? row.lastAutopilotViewsAt;
    if (!lastAt) {
      await this.prisma.property.update({
        where: { id: row.id },
        data: { lastAutoViewsAt: now, lastAutopilotViewsAt: now },
      });
      return 0;
    }

    const steps = Math.floor((now.getTime() - lastAt.getTime()) / (intervalMinutes * 60_000));
    if (steps <= 0) return 0;

    const toAdd = steps * increment;
    const nextAutopilot = row.autopilotViews + toAdd;
    const total = propertyTotalViews({
      realViews: row.realViews,
      manualViews: row.manualViews,
      autopilotViews: nextAutopilot,
    });

    await this.prisma.property.update({
      where: { id: row.id },
      data: {
        autopilotViews: nextAutopilot,
        viewsCount: total,
        lastAutoViewsAt: now,
        lastAutopilotViewsAt: now,
      },
    });
    return toAdd;
  }
}
