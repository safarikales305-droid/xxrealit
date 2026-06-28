import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SocialPlatform,
  SocialPublishContentType,
  SocialPublishRepeatType,
  SocialPublishScheduleLastStatus,
  SocialPublishStatus,
  SocialPublishTriggerSource,
  FacebookPostType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { SocialPublishEnqueueService, SocialPublishProcessorService } from './social-publish-enqueue.service';
import { SocialPublishLogService } from './social-publish-log.service';
import {
  computeNextRunAt,
  resolvePropertyFacebookStatus,
  shouldDisableSchedule,
} from './social-publish-schedule.util';
import { isShortsVideoProperty } from './social-facebook-reel.util';

export type PropertyScheduleInput = {
  propertyIds: string[];
  firstRunAt: string;
  repeatType: SocialPublishRepeatType;
  repeatIntervalDays?: number | null;
  repeatUntil?: string | null;
  maxRuns?: number | null;
  requireActive?: boolean;
  requireApproved?: boolean;
  /** Shorts: true = Reel, false = video post, undefined = globální nastavení */
  shortsPublishAsReel?: boolean | null;
};

@Injectable()
export class SocialPublishScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enqueue: SocialPublishEnqueueService,
    private readonly processor: SocialPublishProcessorService,
    private readonly logService: SocialPublishLogService,
  ) {}

  private resolvePropertyContentType(property: {
    listingType?: string | null;
    videoUrl?: string | null;
  }): SocialPublishContentType {
    const isShort =
      String(property.listingType ?? '').toUpperCase() === 'SHORTS' ||
      Boolean(property.videoUrl?.trim());
    return isShort ? SocialPublishContentType.SHORT : SocialPublishContentType.PROPERTY;
  }

  async getFacebookStatus(propertyIds: string[]) {
    const ids = [...new Set(propertyIds.filter(Boolean))];
    if (ids.length === 0) return { items: [] as Record<string, unknown>[] };

    const properties = await this.prisma.property.findMany({
      where: { id: { in: ids } },
      select: { id: true, listingType: true, videoUrl: true },
    });

    const schedules = await this.prisma.socialPublishSchedule.findMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
        contentId: { in: ids },
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
    });

    const queues = await this.prisma.socialPublishQueue.findMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
        contentId: { in: ids },
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
    });

    const publishedLogs = await this.prisma.socialPublishLog.groupBy({
      by: ['contentId'],
      where: {
        platform: SocialPlatform.FACEBOOK,
        contentId: { in: ids },
        contentType: { in: ['PROPERTY', 'SHORT'] },
        status: SocialPublishStatus.PUBLISHED,
      },
    });
    const publishedSet = new Set(publishedLogs.map((r) => r.contentId));

    const scheduleByContent = new Map(schedules.map((s) => [s.contentId, s]));
    const queueByContent = new Map(queues.map((q) => [q.contentId, q]));

    const items = properties.map((p) => {
      const schedule = scheduleByContent.get(p.id);
      const queue = queueByContent.get(p.id);
      const status = resolvePropertyFacebookStatus({
        queueStatus: queue?.status,
        scheduleEnabled: schedule?.enabled,
        scheduleRepeatType: schedule?.repeatType,
        scheduleLastStatus: schedule?.lastStatus,
        hasPublishedLog: publishedSet.has(p.id),
      });
      return {
        propertyId: p.id,
        status,
        schedule: schedule
          ? {
              id: schedule.id,
              enabled: schedule.enabled,
              nextRunAt: schedule.nextRunAt.toISOString(),
              repeatType: schedule.repeatType,
              repeatIntervalDays: schedule.repeatIntervalDays,
              repeatUntil: schedule.repeatUntil?.toISOString() ?? null,
              maxRuns: schedule.maxRuns,
              runCount: schedule.runCount,
              lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
              lastStatus: schedule.lastStatus,
              lastError: schedule.lastError,
            }
          : null,
        queue: queue
          ? {
              id: queue.id,
              status: queue.status,
              publishedUrl: queue.publishedUrl,
              externalPostId: queue.externalPostId,
              lastError: queue.lastError,
            }
          : null,
      };
    });

    return { items };
  }

  async publishNow(
    propertyIds: string[],
    userId: string | undefined,
    force = false,
    opts: { publishAsReel?: boolean } = {},
  ) {
    const results: Array<{
      propertyId: string;
      ok: boolean;
      error?: string;
      skipped?: boolean;
      reason?: string;
      publishedUrl?: string;
      externalPostId?: string;
    }> = [];

    for (const propertyId of propertyIds) {
      const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
      if (!property || property.deletedAt) {
        results.push({ propertyId, ok: false, error: 'Inzerát nenalezen' });
        continue;
      }

      const contentType = this.resolvePropertyContentType(property);
      if (!force) {
        const dup = await this.logService.wasPublishedToday({ contentType, contentId: propertyId });
        if (dup) {
          results.push({
            propertyId,
            ok: false,
            skipped: true,
            reason: 'Dnes již publikováno — použijte vynucení',
          });
          continue;
        }
      }

      const enq = await this.enqueue.enqueuePropertyManual(propertyId, {
        force: Boolean(force),
        triggerSource: SocialPublishTriggerSource.MANUAL,
        triggeredByUserId: userId,
        facebookPostType: opts.publishAsReel ? FacebookPostType.FACEBOOK_REEL : undefined,
      });
      if (!enq.ok) {
        results.push({
          propertyId,
          ok: false,
          skipped: enq.skipped,
          reason: enq.reason,
          error: enq.error,
        });
        continue;
      }

      if (enq.queueId) {
        try {
          await this.processor.processItem(enq.queueId);
        } catch {
          /* processItem updates queue row */
        }
      }

      const queue = enq.queueId
        ? await this.prisma.socialPublishQueue.findUnique({ where: { id: enq.queueId } })
        : null;
      if (queue?.status === SocialPublishStatus.FAILED) {
        results.push({
          propertyId,
          ok: false,
          error: queue.lastError ?? 'Publikace selhala',
        });
      } else if (queue?.status === SocialPublishStatus.PUBLISHED) {
        results.push({
          propertyId,
          ok: true,
          publishedUrl: queue.publishedUrl ?? undefined,
          externalPostId: queue.externalPostId ?? undefined,
        });
      } else {
        results.push({ propertyId, ok: true });
      }
    }

    return { results };
  }

  async upsertSchedules(input: PropertyScheduleInput, userId: string | undefined) {
    const firstRunAt = new Date(input.firstRunAt);
    if (!Number.isFinite(firstRunAt.getTime())) {
      throw new BadRequestException('Neplatné datum prvního publikování');
    }
    if (
      input.repeatType === SocialPublishRepeatType.CUSTOM_DAYS &&
      (!input.repeatIntervalDays || input.repeatIntervalDays < 1)
    ) {
      throw new BadRequestException('Vlastní interval musí být alespoň 1 den');
    }

    const repeatUntil = input.repeatUntil ? new Date(input.repeatUntil) : null;
    if (repeatUntil && !Number.isFinite(repeatUntil.getTime())) {
      throw new BadRequestException('Neplatné datum konce opakování');
    }

    const results: Array<{ propertyId: string; ok: boolean; scheduleId?: string; error?: string }> = [];

    for (const propertyId of input.propertyIds) {
      const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
      if (!property || property.deletedAt) {
        results.push({ propertyId, ok: false, error: 'Inzerát nenalezen' });
        continue;
      }

      const contentType = this.resolvePropertyContentType(property);
      const row = await this.prisma.socialPublishSchedule.upsert({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType,
            contentId: propertyId,
          },
        },
        create: {
          platform: SocialPlatform.FACEBOOK,
          contentType,
          contentId: propertyId,
          enabled: true,
          nextRunAt: firstRunAt,
          repeatType: input.repeatType,
          repeatIntervalDays:
            input.repeatType === SocialPublishRepeatType.CUSTOM_DAYS
              ? input.repeatIntervalDays ?? null
              : null,
          repeatUntil,
          maxRuns: input.maxRuns ?? null,
          requireActive: input.requireActive ?? true,
          requireApproved: input.requireApproved ?? true,
          shortsPublishAsReel: input.shortsPublishAsReel ?? null,
          createdByUserId: userId ?? null,
        },
        update: {
          enabled: true,
          nextRunAt: firstRunAt,
          repeatType: input.repeatType,
          repeatIntervalDays:
            input.repeatType === SocialPublishRepeatType.CUSTOM_DAYS
              ? input.repeatIntervalDays ?? null
              : null,
          repeatUntil,
          maxRuns: input.maxRuns ?? null,
          requireActive: input.requireActive ?? true,
          requireApproved: input.requireApproved ?? true,
          shortsPublishAsReel: input.shortsPublishAsReel ?? null,
          lastError: null,
        },
      });
      results.push({ propertyId, ok: true, scheduleId: row.id });
    }

    return { results };
  }

  async cancelSchedules(propertyIds: string[]) {
    const results: Array<{ propertyId: string; ok: boolean; error?: string }> = [];

    for (const propertyId of propertyIds) {
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, listingType: true, videoUrl: true },
      });
      if (!property) {
        results.push({ propertyId, ok: false, error: 'Inzerát nenalezen' });
        continue;
      }
      const contentType = this.resolvePropertyContentType(property);
      const existing = await this.prisma.socialPublishSchedule.findUnique({
        where: {
          platform_contentType_contentId: {
            platform: SocialPlatform.FACEBOOK,
            contentType,
            contentId: propertyId,
          },
        },
      });
      if (!existing) {
        results.push({ propertyId, ok: true });
        continue;
      }
      await this.prisma.socialPublishSchedule.update({
        where: { id: existing.id },
        data: { enabled: false },
      });
      results.push({ propertyId, ok: true });
    }

    return { results };
  }

  async processDueSchedules(limit = 10) {
    const now = new Date();
    const due = await this.prisma.socialPublishSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });

    let processed = 0;
    for (const schedule of due) {
      const ok = await this.runSchedule(schedule.id);
      if (ok) processed += 1;
    }
    return { processed };
  }

  private async runSchedule(scheduleId: string): Promise<boolean> {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule || !schedule.enabled) return false;

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
    });
    if (!property || property.deletedAt) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát smazaný nebo neexistuje');
      return false;
    }

    if (schedule.requireActive && !isPropertyPubliclyListed(property)) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát není aktivní');
      return false;
    }
    if (schedule.requireApproved && !property.approved) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát není schválený');
      return false;
    }

    const dup = await this.logService.wasPublishedToday({
      contentType: schedule.contentType,
      contentId: schedule.contentId,
    });
    if (dup) {
      await this.advanceScheduleAfterRun(schedule.id, SocialPublishScheduleLastStatus.SKIPPED, 'Dnes již publikováno');
      return true;
    }

    const enq = await this.enqueue.enqueuePropertyManual(schedule.contentId, {
      force: false,
      triggerSource: SocialPublishTriggerSource.SCHEDULE,
      scheduleId: schedule.id,
      scheduledAt: schedule.nextRunAt,
      facebookPostType: this.resolveScheduleFacebookPostType(schedule, property),
    });

    if (!enq.ok) {
      await this.markScheduleFailed(schedule.id, enq.reason ?? enq.error ?? 'Zařazení selhalo');
      return false;
    }

    if (enq.queueId) {
      await this.processor.processItem(enq.queueId);
      const queue = await this.prisma.socialPublishQueue.findUnique({ where: { id: enq.queueId } });
      if (queue?.status === SocialPublishStatus.PUBLISHED) {
        await this.advanceScheduleAfterRun(schedule.id, SocialPublishScheduleLastStatus.SUCCESS);
        return true;
      }
      if (queue?.status === SocialPublishStatus.FAILED) {
        await this.markScheduleFailed(schedule.id, queue.lastError ?? 'Publikace selhala');
        return false;
      }
    }

    return true;
  }

  async advanceScheduleAfterRun(
    scheduleId: string,
    status: SocialPublishScheduleLastStatus,
    error?: string,
  ) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) return;

    const runCount = schedule.runCount + 1;
    const nextRunAt = computeNextRunAt(
      schedule.repeatType,
      schedule.repeatIntervalDays,
      schedule.nextRunAt,
    );
    const disable = shouldDisableSchedule({
      runCount,
      maxRuns: schedule.maxRuns,
      repeatUntil: schedule.repeatUntil,
      nextRunAt,
      repeatType: schedule.repeatType,
    });

    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: {
        runCount,
        lastRunAt: new Date(),
        lastStatus: status,
        lastError: error ?? null,
        nextRunAt: disable || !nextRunAt ? schedule.nextRunAt : nextRunAt,
        enabled: disable ? false : schedule.enabled,
      },
    });
  }

  private async markScheduleSkipped(scheduleId: string, reason: string) {
    await this.advanceScheduleAfterRun(scheduleId, SocialPublishScheduleLastStatus.SKIPPED, reason);
  }

  private async markScheduleFailed(scheduleId: string, error: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) return;

    const nextRunAt =
      schedule.repeatType !== SocialPublishRepeatType.NONE
        ? computeNextRunAt(schedule.repeatType, schedule.repeatIntervalDays, new Date())
        : null;

    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        lastStatus: SocialPublishScheduleLastStatus.FAILED,
        lastError: error,
        nextRunAt: nextRunAt ?? schedule.nextRunAt,
        enabled:
          schedule.repeatType !== SocialPublishRepeatType.NONE && nextRunAt
            ? schedule.enabled
            : false,
      },
    });
  }

  getPublishLog(propertyId: string) {
    return this.logService.listForProperty(propertyId);
  }

  private resolveScheduleFacebookPostType(
    schedule: { shortsPublishAsReel: boolean | null },
    property: { listingType?: string | null; videoUrl?: string | null },
  ): FacebookPostType | undefined {
    if (!isShortsVideoProperty(property) && !property.videoUrl?.trim()) {
      return undefined;
    }
    if (schedule.shortsPublishAsReel === true) {
      return FacebookPostType.FACEBOOK_REEL;
    }
    if (schedule.shortsPublishAsReel === false) {
      return FacebookPostType.FACEBOOK_VIDEO;
    }
    return undefined;
  }
}
