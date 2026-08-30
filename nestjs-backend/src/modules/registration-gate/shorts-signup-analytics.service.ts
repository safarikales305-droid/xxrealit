import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { ShortsSignupEventName } from './dto/shorts-signup.dto';

@Injectable()
export class ShortsSignupAnalyticsService {
  private readonly log = new Logger(ShortsSignupAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(input: {
    eventName: ShortsSignupEventName;
    anonymousSessionId?: string;
    userId?: string;
    triggerViewCount?: number;
    shortType?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrer?: string;
    variantId?: string;
  }) {
    try {
      await this.prisma.shortsSignupEvent.create({
        data: {
          eventName: input.eventName,
          anonymousSessionId: input.anonymousSessionId?.slice(0, 120) ?? null,
          userId: input.userId ?? null,
          triggerViewCount: input.triggerViewCount ?? null,
          shortType: input.shortType ?? null,
          utmSource: input.utmSource?.slice(0, 120) ?? null,
          utmMedium: input.utmMedium?.slice(0, 120) ?? null,
          utmCampaign: input.utmCampaign?.slice(0, 120) ?? null,
          referrer: input.referrer?.slice(0, 500) ?? null,
          variantId: input.variantId?.slice(0, 40) ?? null,
        },
      });
    } catch (err) {
      this.log.warn(`Track event failed: ${err instanceof Error ? err.message : err}`);
    }
    return { ok: true };
  }

  async trackPasswordSetIfEligible(userId: string) {
    const recent = await this.prisma.shortsSignupEvent.findFirst({
      where: {
        userId,
        eventName: { in: ['shorts_signup_success', 'shorts_signup_existing_email'] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!recent) return;
    await this.track({ eventName: 'shorts_signup_password_set', userId });
  }

  async getStats(from: Date, to: Date) {
    const events = await this.prisma.shortsSignupEvent.groupBy({
      by: ['eventName'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      events.map((e) => [e.eventName, e._count._all]),
    ) as Record<string, number>;

    const popupShown = counts.shorts_signup_popup_shown ?? 0;
    const submitted = counts.shorts_signup_submitted ?? 0;
    const success = counts.shorts_signup_success ?? 0;
    const passwordSet = counts.shorts_signup_password_set ?? 0;
    const dismissed =
      (counts.shorts_signup_dismissed ?? 0) + (counts.shorts_signup_closed ?? 0);
    const passwordEmails = counts.shorts_signup_password_email_sent ?? 0;

    const pct = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      counts: {
        popupShown,
        submitted,
        success,
        passwordEmails,
        passwordSet,
        dismissed,
        existingEmail: counts.shorts_signup_existing_email ?? 0,
        failed: counts.shorts_signup_failed ?? 0,
        eligible: counts.shorts_signup_eligible ?? 0,
      },
      conversion: {
        emailSubmitRate: pct(submitted, popupShown),
        registrationRate: pct(success, popupShown),
        passwordCompletionRate: pct(passwordSet, success),
        dismissRate: pct(dismissed, popupShown),
      },
    };
  }
}
