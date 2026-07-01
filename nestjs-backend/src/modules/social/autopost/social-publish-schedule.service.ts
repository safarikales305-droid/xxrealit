import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublishSchedulerLogService, type SchedulerTickDetail } from './social-publish-scheduler-log.service';
import {
  computeNextRunAt,
  formatCountdown,
  pragueDateKey,
  pragueNowMinute,
  resolvePropertyFacebookStatus,
  resolveSchedulePlannerStatus,
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
    private readonly settings: SocialAutopostSettingsService,
    private readonly schedulerLog: SocialPublishSchedulerLogService,
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

  async processDueSchedules(limitPerBatch = 20, source = 'cron') {
    const tickDetails: SchedulerTickDetail[] = [];
    let publishedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let dueCount = 0;
    let totalProcessed = 0;

    const now = pragueNowMinute();

    for (let batch = 0; batch < 5; batch += 1) {
      const due = await this.prisma.socialPublishSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' },
        take: limitPerBatch,
      });
      if (due.length === 0) break;
      dueCount += due.length;

      for (const schedule of due) {
        const outcome = await this.runSchedule(schedule.id);
        totalProcessed += 1;
        if (outcome.outcome === 'published') publishedCount += 1;
        else if (outcome.outcome === 'failed') failedCount += 1;
        else if (outcome.outcome === 'skipped') skippedCount += 1;
        tickDetails.push(outcome.detail);
      }

      if (due.length < limitPerBatch) break;
    }

    await this.schedulerLog.writeTick({
      source,
      dueCount,
      publishedCount,
      failedCount,
      skippedCount,
      details: tickDetails,
    });

    return { processed: totalProcessed, dueCount, publishedCount, failedCount, skippedCount };
  }

  private async runSchedule(scheduleId: string): Promise<{
    outcome: 'published' | 'failed' | 'skipped' | 'noop';
    detail: SchedulerTickDetail;
  }> {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    const baseDetail: SchedulerTickDetail = {
      scheduleId,
      contentId: schedule?.contentId ?? '',
      outcome: 'failed',
    };
    if (!schedule || !schedule.enabled) {
      return { outcome: 'noop', detail: { ...baseDetail, outcome: 'skipped', error: 'Plán neaktivní' } };
    }

    const now = pragueNowMinute();
    if (schedule.nextRunAt > now) {
      return { outcome: 'noop', detail: { ...baseDetail, outcome: 'skipped', error: 'Ještě není čas' } };
    }

    baseDetail.contentId = schedule.contentId;

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
    });
    if (!property || property.deletedAt) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát smazaný nebo neexistuje');
      return {
        outcome: 'skipped',
        detail: { ...baseDetail, outcome: 'skipped', error: 'Inzerát smazaný' },
      };
    }

    if (schedule.requireActive && !isPropertyPubliclyListed(property)) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát není aktivní');
      return {
        outcome: 'skipped',
        detail: { ...baseDetail, outcome: 'skipped', error: 'Inzerát není aktivní' },
      };
    }
    if (schedule.requireApproved && !property.approved) {
      await this.markScheduleSkipped(schedule.id, 'Inzerát není schválený');
      return {
        outcome: 'skipped',
        detail: { ...baseDetail, outcome: 'skipped', error: 'Inzerát není schválený' },
      };
    }

    await this.settings.reload();
    const isRepeating = schedule.repeatType !== SocialPublishRepeatType.NONE;
    const globalRepeat =
      this.settings.getSettings().global.repeatPublishingEnabled !== false &&
      this.settings.getSettings().facebook.repeatPublishing !== false;
    const allowRepublish = isRepeating || globalRepeat;

    if (!allowRepublish) {
      const dup = await this.logService.wasPublishedToday({
        contentType: schedule.contentType,
        contentId: schedule.contentId,
      });
      if (dup) {
        const err = 'Dnes již publikováno';
        await this.logService.writeLog({
          contentType: schedule.contentType,
          contentId: schedule.contentId,
          scheduleId: schedule.id,
          status: SocialPublishStatus.SKIPPED,
          lastError: err,
          triggerSource: SocialPublishTriggerSource.SCHEDULE,
        });
        await this.advanceScheduleAfterRun(
          schedule.id,
          SocialPublishScheduleLastStatus.SKIPPED,
          err,
        );
        return {
          outcome: 'skipped',
          detail: { ...baseDetail, outcome: 'skipped', error: err },
        };
      }
    }

    const enq = await this.enqueue.enqueuePropertyManual(schedule.contentId, {
      force: allowRepublish,
      triggerSource: SocialPublishTriggerSource.SCHEDULE,
      scheduleId: schedule.id,
      scheduledAt: schedule.nextRunAt,
      facebookPostType: this.resolveScheduleFacebookPostType(schedule, property),
    });

    if (!enq.ok) {
      const err = enq.reason ?? enq.error ?? 'Zařazení selhalo';
      await this.logService.writeLog({
        contentType: schedule.contentType,
        contentId: schedule.contentId,
        scheduleId: schedule.id,
        status: SocialPublishStatus.SKIPPED,
        lastError: err,
        triggerSource: SocialPublishTriggerSource.SCHEDULE,
      });
      await this.markScheduleFailed(schedule.id, err);
      return {
        outcome: 'failed',
        detail: {
          ...baseDetail,
          outcome: 'failed',
          error: enq.reason ?? enq.error ?? 'Zařazení selhalo',
        },
      };
    }

    if (!enq.queueId) {
      await this.markScheduleFailed(schedule.id, 'Fronta nevrátila ID');
      return {
        outcome: 'failed',
        detail: { ...baseDetail, outcome: 'failed', error: 'Fronta nevrátila ID' },
      };
    }

    await this.processor.processItem(enq.queueId);
    const queue = await this.prisma.socialPublishQueue.findUnique({ where: { id: enq.queueId } });

    if (queue?.status === SocialPublishStatus.PUBLISHED) {
      await this.advanceScheduleAfterRun(schedule.id, SocialPublishScheduleLastStatus.SUCCESS);
      return {
        outcome: 'published',
        detail: {
          ...baseDetail,
          outcome: 'published',
          externalPostId: queue.externalPostId ?? undefined,
          publishedUrl: queue.publishedUrl ?? undefined,
          graphResponse: queue.lastApiResponse ?? undefined,
        },
      };
    }

    if (queue?.status === SocialPublishStatus.FAILED) {
      const err = queue.lastError ?? 'Publikace selhala';
      await this.logService.writeLog({
        contentType: schedule.contentType,
        contentId: schedule.contentId,
        scheduleId: schedule.id,
        queueId: enq.queueId,
        status: SocialPublishStatus.FAILED,
        lastError: err,
        graphApiResponse: queue.lastApiResponse ?? undefined,
        triggerSource: SocialPublishTriggerSource.SCHEDULE,
      });
      await this.markScheduleFailed(schedule.id, err);
      return {
        outcome: 'failed',
        detail: {
          ...baseDetail,
          outcome: 'failed',
          error: err,
          graphResponse: queue.lastApiResponse ?? undefined,
        },
      };
    }

    const err = queue?.lastError ?? 'Publikace nebyla dokončena';
    await this.markScheduleFailed(schedule.id, err);
    return {
      outcome: 'failed',
      detail: { ...baseDetail, outcome: 'failed', error: err },
    };
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
        ...(status === SocialPublishScheduleLastStatus.SUCCESS
          ? { lastPublishedAt: new Date() }
          : {}),
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
        ? computeNextRunAt(schedule.repeatType, schedule.repeatIntervalDays, schedule.nextRunAt)
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

  private facebookPageMeta() {
    const fb = this.settings.getSettings().facebook;
    return {
      pageId: fb.pageId ?? '',
      pageName: fb.pageName ?? 'Facebook stránka',
    };
  }

  private resolvePublishTypeLabel(
    schedule: { shortsPublishAsReel: boolean | null },
    property: { listingType?: string | null; videoUrl?: string | null } | null,
    queuePostType?: FacebookPostType | null,
  ): string {
    if (queuePostType === FacebookPostType.FACEBOOK_REEL) return 'Facebook Reel';
    if (queuePostType === FacebookPostType.FACEBOOK_VIDEO) return 'Facebook video';
    if (schedule.shortsPublishAsReel === true && property && isShortsVideoProperty(property)) {
      return 'Facebook Reel';
    }
    if (schedule.shortsPublishAsReel === false && property?.videoUrl?.trim()) {
      return 'Facebook video';
    }
    return 'Facebook příspěvek';
  }

  private serializeScheduleRow(
    schedule: {
      id: string;
      contentId: string;
      contentType: SocialPublishContentType;
      enabled: boolean;
      nextRunAt: Date;
      repeatType: SocialPublishRepeatType;
      repeatIntervalDays: number | null;
      repeatUntil: Date | null;
      maxRuns: number | null;
      runCount: number;
      requireActive: boolean;
      requireApproved: boolean;
      shortsPublishAsReel: boolean | null;
      lastRunAt: Date | null;
      lastPublishedAt: Date | null;
      lastStatus: SocialPublishScheduleLastStatus | null;
      lastError: string | null;
      lastIntroVideoUsed?: boolean;
      lastIntroVideoIdUsed?: string | null;
      lastIntroVideoTitle?: string | null;
      lastSourceListingVideoUrl?: string | null;
      lastFinalVideoUrl?: string | null;
      lastFinalVideoGeneratedAt?: Date | null;
      lastTotalReelDurationSec?: number | null;
      createdAt: Date;
      createdByUserId: string | null;
      createdBy?: { id: string; name: string | null; email: string } | null;
    },
    property: { id: string; title: string; listingType?: string | null; videoUrl?: string | null } | null,
    queue: {
      status: SocialPublishStatus;
      facebookPostType?: FacebookPostType | null;
      publishedUrl?: string | null;
      externalPostId?: string | null;
      lastError?: string | null;
      lastApiResponse?: unknown;
    } | null,
  ) {
    const page = this.facebookPageMeta();
    const now = new Date();
    const displayStatus = resolveSchedulePlannerStatus({
      enabled: schedule.enabled,
      repeatType: schedule.repeatType,
      lastStatus: schedule.lastStatus,
      queueStatus: queue?.status,
      nextRunAt: schedule.nextRunAt,
    });

    return {
      id: schedule.id,
      propertyId: schedule.contentId,
      propertyTitle: property?.title?.trim() || schedule.contentId,
      publishType: this.resolvePublishTypeLabel(schedule, property, queue?.facebookPostType),
      publishTypeKey: queue?.facebookPostType ?? null,
      planCreatedAt: schedule.createdAt.toISOString(),
      scheduledAt: schedule.nextRunAt.toISOString(),
      repeatType: schedule.repeatType,
      repeatIntervalDays: schedule.repeatIntervalDays,
      repeatUntil: schedule.repeatUntil?.toISOString() ?? null,
      maxRuns: schedule.maxRuns,
      runCount: schedule.runCount,
      lastPublishedAt: schedule.lastPublishedAt?.toISOString() ?? null,
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      nextRunAt: schedule.nextRunAt.toISOString(),
      enabled: schedule.enabled,
      displayStatus,
      countdown: schedule.enabled ? formatCountdown(schedule.nextRunAt, now) : '—',
      lastError: schedule.lastError ?? queue?.lastError ?? null,
      author: schedule.createdBy
        ? {
            id: schedule.createdBy.id,
            name: schedule.createdBy.name,
            email: schedule.createdBy.email,
          }
        : null,
      facebookPageId: page.pageId,
      facebookPageName: page.pageName,
      requireActive: schedule.requireActive,
      requireApproved: schedule.requireApproved,
      shortsPublishAsReel: schedule.shortsPublishAsReel,
      introVideoUsed: schedule.lastIntroVideoUsed === true,
      introVideoTitle: schedule.lastIntroVideoTitle ?? null,
      finalVideoUrl: schedule.lastFinalVideoUrl ?? null,
      finalVideoGeneratedAt: schedule.lastFinalVideoGeneratedAt?.toISOString() ?? null,
      totalReelDurationSec: schedule.lastTotalReelDurationSec ?? null,
      queue: queue
        ? {
            status: queue.status,
            publishedUrl: queue.publishedUrl,
            externalPostId: queue.externalPostId,
            lastError: queue.lastError,
          }
        : null,
    };
  }

  async listSchedules() {
    const schedules = await this.prisma.socialPublishSchedule.findMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
      orderBy: [{ enabled: 'desc' }, { nextRunAt: 'asc' }],
      take: 200,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const contentIds = schedules.map((s) => s.contentId);
    const properties = await this.prisma.property.findMany({
      where: { id: { in: contentIds } },
      select: { id: true, title: true, listingType: true, videoUrl: true },
    });
    const propertyById = new Map(properties.map((p) => [p.id, p]));

    const queues = await this.prisma.socialPublishQueue.findMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
        contentId: { in: contentIds },
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
    });
    const queueByContent = new Map(queues.map((q) => [q.contentId, q]));

    const items = schedules.map((s) =>
      this.serializeScheduleRow(
        s,
        propertyById.get(s.contentId) ?? null,
        queueByContent.get(s.contentId) ?? null,
      ),
    );

    return { items, dashboard: this.buildDashboard(items, schedules) };
  }

  private buildDashboard(
    items: Array<{
      displayStatus: string;
      scheduledAt: string;
      publishType: string;
      lastPublishedAt: string | null;
    }>,
    schedules: Array<{ nextRunAt: Date; enabled: boolean }>,
  ) {
    const now = new Date();
    const todayKey = pragueDateKey(now);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let scheduledToday = 0;
    let scheduledThisWeek = 0;
    let waiting = 0;
    let publishedToday = 0;
    let failed = 0;
    let reels = 0;
    let posts = 0;

    for (const item of items) {
      const schedKey = pragueDateKey(new Date(item.scheduledAt));
      if (item.displayStatus === 'WAITING' || item.displayStatus === 'REPEATING') waiting += 1;
      if (item.displayStatus === 'FAILED') failed += 1;
      if (item.publishType.includes('Reel')) reels += 1;
      else posts += 1;
      if (schedKey === todayKey) scheduledToday += 1;
      const schedDate = new Date(item.scheduledAt);
      if (schedDate >= now && schedDate <= weekEnd) scheduledThisWeek += 1;
    }

    for (const s of schedules) {
      if (s.enabled && pragueDateKey(s.nextRunAt) === todayKey) {
        /* already counted via items */
      }
    }

    const publishedTodayLogs = items.filter(
      (i) =>
        i.displayStatus === 'PUBLISHED' &&
        i.lastPublishedAt &&
        pragueDateKey(new Date(i.lastPublishedAt)) === todayKey,
    ).length;

    return {
      scheduledToday,
      scheduledThisWeek,
      waiting,
      publishedToday: publishedTodayLogs,
      failed,
      reels,
      posts,
    };
  }

  async getScheduleDetail(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
      select: { id: true, title: true, listingType: true, videoUrl: true },
    });

    const queue = await this.prisma.socialPublishQueue.findUnique({
      where: {
        platform_contentType_contentId: {
          platform: SocialPlatform.FACEBOOK,
          contentType: schedule.contentType,
          contentId: schedule.contentId,
        },
      },
    });

    const history = await this.logService.listForSchedule(scheduleId, schedule.contentId);

    const schedulerTicks = await this.schedulerLog.listRecent(20);

    return {
      schedule: this.serializeScheduleRow(schedule, property, queue),
      history,
      schedulerTicks: schedulerTicks.map((t) => ({
        id: t.id,
        checkedAt: t.checkedAt.toISOString(),
        source: t.source,
        dueCount: t.dueCount,
        publishedCount: t.publishedCount,
        failedCount: t.failedCount,
        skippedCount: t.skippedCount,
        details: t.details,
      })),
    };
  }

  async updateScheduleById(
    scheduleId: string,
    input: Omit<PropertyScheduleInput, 'propertyIds'> & { resetRunCount?: boolean },
  ) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const firstRunAt = new Date(input.firstRunAt);
    if (!Number.isFinite(firstRunAt.getTime())) {
      throw new BadRequestException('Neplatné datum publikování');
    }

    const repeatUntil = input.repeatUntil ? new Date(input.repeatUntil) : null;
    if (repeatUntil && !Number.isFinite(repeatUntil.getTime())) {
      throw new BadRequestException('Neplatné datum konce opakování');
    }

    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: {
        enabled: true,
        nextRunAt: firstRunAt,
        repeatType: input.repeatType,
        repeatIntervalDays:
          input.repeatType === SocialPublishRepeatType.CUSTOM_DAYS
            ? input.repeatIntervalDays ?? null
            : null,
        repeatUntil,
        maxRuns: input.maxRuns ?? null,
        requireActive: input.requireActive ?? schedule.requireActive,
        requireApproved: input.requireApproved ?? schedule.requireApproved,
        shortsPublishAsReel: input.shortsPublishAsReel ?? schedule.shortsPublishAsReel,
        lastError: null,
        lastStatus: SocialPublishScheduleLastStatus.PENDING,
        ...(input.resetRunCount ? { runCount: 0 } : {}),
      },
    });

    return this.getScheduleDetail(scheduleId);
  }

  async pauseSchedule(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Plán nenalezen');
    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: { enabled: false },
    });
    return { ok: true };
  }

  async resumeSchedule(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Plán nenalezen');
    const now = new Date();
    let nextRunAt: Date;
    if (schedule.nextRunAt < now) {
      if (schedule.repeatType !== SocialPublishRepeatType.NONE) {
        nextRunAt =
          computeNextRunAt(schedule.repeatType, schedule.repeatIntervalDays, now) ?? now;
      } else {
        nextRunAt = now;
      }
    } else {
      nextRunAt = schedule.nextRunAt;
    }
    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: { enabled: true, nextRunAt, lastError: null },
    });
    return { ok: true, nextRunAt: nextRunAt.toISOString() };
  }

  async deleteSchedule(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Plán nenalezen');
    await this.prisma.socialPublishSchedule.delete({ where: { id: scheduleId } });
    return { ok: true };
  }

  async publishScheduleNow(scheduleId: string, userId?: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const publishAsReel = schedule.shortsPublishAsReel === true;
    const result = await this.publishNow([schedule.contentId], userId, true, { publishAsReel });
    const row = result.results[0];
    return {
      ok: Boolean(row?.ok),
      error: row?.error,
      publishedUrl: row?.publishedUrl,
      externalPostId: row?.externalPostId,
    };
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
