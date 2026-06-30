import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Post, StatisticsSettings } from '@prisma/client';
import { dayKeyUtc, postTotalLikes, randomIntInRange } from '../../common/listing-statistics.util';
import { PrismaService } from '../../database/prisma.service';
import { StatisticsSettingsService } from './statistics-settings.service';

type PostAutopilotRow = Pick<
  Post,
  | 'id'
  | 'realLikes'
  | 'manualLikes'
  | 'autopilotLikes'
  | 'likesAutopilotEnabled'
  | 'likesAutopilotRatePerHour'
  | 'likesAutopilotMaxTotal'
  | 'lastAutopilotLikesAt'
  | 'autopilotLikesDayKey'
  | 'autopilotLikesAddedToday'
  | 'publishedAt'
  | 'createdAt'
>;

@Injectable()
export class PostLikesAutopilotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PostLikesAutopilotService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: StatisticsSettingsService,
  ) {}

  onModuleInit() {
    this.log.log('[post-likes-autopilot] scheduler initialized (tick each 30s)');
    this.timer = setInterval(() => void this.tick(), 30_000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.settingsService.get();
      if (!settings.postsLikesAutopilotEnabled) return;

      const now = new Date();
      const rows = await this.prisma.post.findMany({
        where: {
          likesAutopilotEnabled: true,
          type: { not: 'short' },
        },
        select: {
          id: true,
          realLikes: true,
          manualLikes: true,
          autopilotLikes: true,
          likesAutopilotEnabled: true,
          likesAutopilotRatePerHour: true,
          likesAutopilotMaxTotal: true,
          lastAutopilotLikesAt: true,
          autopilotLikesDayKey: true,
          autopilotLikesAddedToday: true,
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
        this.log.log(`[post-likes-autopilot] updated ${touched} posts`);
      }
    } catch (error) {
      this.log.error('[post-likes-autopilot] tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  private async processRow(
    row: PostAutopilotRow,
    settings: StatisticsSettings,
    now: Date,
  ): Promise<number> {
    const intervalMinutes = settings.postsLikesIntervalMinutes;
    if (intervalMinutes <= 0) return 0;

    if (!row.lastAutopilotLikesAt) {
      await this.prisma.post.update({
        where: { id: row.id },
        data: { lastAutopilotLikesAt: now },
      });
      return 0;
    }

    const steps = Math.floor(
      (now.getTime() - row.lastAutopilotLikesAt.getTime()) / (intervalMinutes * 60_000),
    );
    if (steps <= 0) return 0;

    const rateMin = settings.postsLikesRateMin;
    const rateMax = settings.postsLikesRateMax;
    const ratePerHour = row.likesAutopilotRatePerHour ?? settings.postsLikesRatePerHour;

    let perStep = randomIntInRange(rateMin, rateMax);
    if (perStep <= 0 && ratePerHour > 0) {
      perStep = Math.max(1, Math.round(ratePerHour * (intervalMinutes / 60)));
    }
    if (perStep <= 0) return 0;

    let toAdd = perStep * steps;
    const maxTotal = row.likesAutopilotMaxTotal ?? settings.postsLikesMaxTotal;
    if (maxTotal > 0) {
      const remaining = maxTotal - row.autopilotLikes;
      if (remaining <= 0) return 0;
      toAdd = Math.min(toAdd, remaining);
    }

    const publishedAt = row.publishedAt ?? row.createdAt;
    const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
    const maxPerDay =
      ageHours >= 24 ? settings.postsLikesAfter24hMax : settings.postsLikesMaxPerDay;

    const todayKey = dayKeyUtc(now);
    let addedToday = row.autopilotLikesAddedToday;
    if (row.autopilotLikesDayKey !== todayKey) addedToday = 0;

    if (maxPerDay > 0) {
      const dayRemaining = maxPerDay - addedToday;
      if (dayRemaining <= 0) return 0;
      toAdd = Math.min(toAdd, dayRemaining);
    }

    if (toAdd <= 0) return 0;

    const nextAutopilot = row.autopilotLikes + toAdd;
    await this.prisma.post.update({
      where: { id: row.id },
      data: {
        autopilotLikes: nextAutopilot,
        lastAutopilotLikesAt: now,
        autopilotLikesDayKey: todayKey,
        autopilotLikesAddedToday: addedToday + toAdd,
      },
    });
    this.log.log(
      `[post-likes-autopilot] id=${row.id} add=${toAdd} total=${postTotalLikes({ ...row, autopilotLikes: nextAutopilot })}`,
    );
    return toAdd;
  }
}
