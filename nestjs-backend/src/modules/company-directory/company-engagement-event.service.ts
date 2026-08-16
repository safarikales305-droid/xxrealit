import { Injectable } from '@nestjs/common';
import {
  CompanyEngagementEventType,
  CompanyDirectoryProfileStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ENGAGEMENT_EMAIL_COOLDOWN_MS,
  MAX_ENGAGEMENT_EMAILS_PER_COMPANY_PER_DAY,
  PROFILE_VIEW_THRESHOLD,
  COMPANY_INTEREST_NOTIFICATIONS_ENABLED,
} from './company-directory.constants';

@Injectable()
export class CompanyEngagementEventService {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(input: {
    companyId: string;
    type: CompanyEngagementEventType;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.companyEngagementEvent.create({
      data: {
        companyId: input.companyId,
        type: input.type,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async getProfileViewCount(companyId: string, days: number): Promise<number> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.companyEngagementEvent.count({
      where: {
        companyId,
        type: CompanyEngagementEventType.PROFILE_VIEW,
        createdAt: { gte: since },
      },
    });
  }

  async shouldTriggerProfileViewInterest(companyId: string): Promise<boolean> {
    if (!COMPANY_INTEREST_NOTIFICATIONS_ENABLED) return false;
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      select: {
        profileStatus: true,
        verifiedBusinessEmail: true,
        communicationOptOut: true,
        claimedAt: true,
      },
    });
    if (
      !company?.verifiedBusinessEmail?.trim() ||
      company.communicationOptOut ||
      company.claimedAt ||
      company.profileStatus !== CompanyDirectoryProfileStatus.UNCLAIMED
    ) {
      return false;
    }
    const views = await this.getProfileViewCount(companyId, 7);
    if (views < PROFILE_VIEW_THRESHOLD) return false;
    return this.canSendEngagementEmail(companyId);
  }

  async getCompanyStats(companyId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.companyEngagementEvent.groupBy({
      by: ['type'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const row of events) {
      counts[row.type] = row._count._all;
    }

    const leads = await this.prisma.companyLead.count({
      where: { companyId, createdAt: { gte: since } },
    });

    return {
      profileViews: counts.PROFILE_VIEW ?? 0,
      profileClicks: counts.PROFILE_CLICK ?? 0,
      phoneClicks: counts.PHONE_CLICK ?? 0,
      emailClicks: counts.EMAIL_CLICK ?? 0,
      websiteClicks: counts.WEBSITE_CLICK ?? 0,
      postViews: counts.POST_VIEW ?? 0,
      leads,
      days,
    };
  }

  async countEngagementEmailsToday(companyId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.companyEmailLog.count({
      where: {
        companyId,
        createdAt: { gte: start },
        template: {
          in: [
            'company_activation_step_1',
            'company_activation_step_2',
            'company_activation_step_3',
            'company_activation_step_4',
            'company_activation_step_5',
            'company_monthly_nurture',
            'company_interest_notification',
            'company_interest_digest',
          ],
        },
      },
    });
  }

  async canSendEngagementEmail(companyId: string): Promise<boolean> {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      select: {
        communicationOptOut: true,
        emailBounced: true,
        lastEngagementEmailAt: true,
      },
    });
    if (!company || company.communicationOptOut || company.emailBounced) return false;

    const sentToday = await this.countEngagementEmailsToday(companyId);
    if (sentToday >= MAX_ENGAGEMENT_EMAILS_PER_COMPANY_PER_DAY) return false;

    if (company.lastEngagementEmailAt) {
      const elapsed = Date.now() - company.lastEngagementEmailAt.getTime();
      if (elapsed < ENGAGEMENT_EMAIL_COOLDOWN_MS) return false;
    }

    return true;
  }
}
