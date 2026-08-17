import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyCampaignStatus,
  CompanyCampaignType,
  CompanyDirectoryProfileStatus,
  CompanyEngagementEventType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { CompanyAuditService } from './company-audit.service';
import { CompanyEmailQueueService } from './company-email-queue.service';
import { CompanyEngagementEventService } from './company-engagement-event.service';
import { canAutoEnrollEmailCampaign } from './company-eligibility.util';
import {
  ARES_WORKER_TICK_MS,
  CAMPAIGN_MONTHLY_INTERVAL_MS,
  CAMPAIGN_SEQUENCE_INTERVAL_MS,
  CAMPAIGN_TEST_STEP_DELAYS_MS,
  COMPANY_CAMPAIGN_TEST_MODE,
  COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED,
  COMPANY_INTEREST_NOTIFICATIONS_ENABLED,
  COMPANY_MONTHLY_NURTURE_ENABLED,
  COMPANY_OUTREACH_ENABLED,
  MIN_CONTACT_CONFIDENCE_FOR_CAMPAIGN,
} from './company-directory.constants';

const ACTIVATION_TEMPLATES = [
  'company_activation_step_1',
  'company_activation_step_2',
  'company_activation_step_3',
  'company_activation_step_4',
  'company_activation_step_5',
] as const;

const ACTIVATION_SUBJECTS = [
  'O vaši firmu se zajímají uživatelé XXREALIT',
  'Pochlubte se svou prací na XXREALIT',
  'Váš profil na XXREALIT sledují uživatelé',
  'Váš profil na XXREALIT zatím není převzatý',
  'Doplňte profil firmy a oslovte nové zákazníky',
];

@Injectable()
export class CompanyEngagementCampaignService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyEngagementCampaignService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CompanyAuditService,
    private readonly emailQueue: CompanyEmailQueueService,
    private readonly events: CompanyEngagementEventService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getCampaignDetail(companyId: string) {
    const campaign = await this.prisma.companyEngagementCampaign.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        emailLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    const stats = await this.events.getCompanyStats(companyId, 30);
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const sent = campaign?.emailLogs.filter((l) => l.status === 'SENT').length ?? 0;
    const opened = campaign?.emailLogs.filter((l) => l.openedAt).length ?? 0;
    const clicked = campaign?.emailLogs.filter((l) => l.clickedAt).length ?? 0;

    return {
      company: {
        id: company.id,
        name: company.name,
        email: company.verifiedBusinessEmail,
        slug: company.slug,
        claimed: company.claimedAt != null,
        profileUrl: `/firmy/${company.slug}`,
        firstPostCreatedAt: company.firstPostCreatedAt?.toISOString() ?? null,
        communicationOptOut: company.communicationOptOut,
      },
      stats,
      campaign: campaign
        ? {
            id: campaign.id,
            status: campaign.status,
            campaignType: campaign.campaignType,
            sequenceStep: campaign.sequenceStep,
            startedAt: campaign.startedAt?.toISOString() ?? null,
            nextSendAt: campaign.nextSendAt?.toISOString() ?? null,
            lastSentAt: campaign.lastSentAt?.toISOString() ?? null,
            completedAt: campaign.completedAt?.toISOString() ?? null,
            stoppedReason: campaign.stoppedReason,
            sent,
            opened,
            clicked,
          }
        : null,
    };
  }

  async startCampaign(companyId: string, adminUserId?: string) {
    if (!COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED || !COMPANY_OUTREACH_ENABLED) {
      throw new BadRequestException('Engagement kampaně jsou vypnuté.');
    }

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: { contacts: { where: { status: 'VERIFIED' }, take: 1 } },
    });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const recipient = company.verifiedBusinessEmail?.trim();
    if (!recipient) {
      throw new BadRequestException('Firma nemá ověřený firemní email.');
    }
    if (company.communicationOptOut) {
      throw new BadRequestException('Firma se odhlásila z komunikace.');
    }
    if (company.emailBounced) {
      throw new BadRequestException('Email firmy je označen jako bounced.');
    }

    const active = await this.prisma.companyEngagementCampaign.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (active) {
      throw new BadRequestException('Firma již má aktivní kampaň.');
    }

    const token = company.engagementOptOutToken ?? randomBytes(24).toString('hex');
    if (!company.engagementOptOutToken) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { engagementOptOutToken: token },
      });
    }

    const now = new Date();
    const campaign = await this.prisma.companyEngagementCampaign.create({
      data: {
        companyId,
        status: CompanyCampaignStatus.ACTIVE,
        campaignType: CompanyCampaignType.ACTIVATION_SEQUENCE,
        sequenceStep: 0,
        startedAt: now,
        nextSendAt: now,
      },
    });

    await this.audit.log({
      companyId,
      action: 'CAMPAIGN_EMAIL',
      message: 'Spuštěna aktivační kampaň',
      actorUserId: adminUserId,
    });

    await this.sendActivationStep(campaign.id, 1);
    return this.getCampaignDetail(companyId);
  }

  async startBulkCampaign(companyIds: string[], adminUserId?: string) {
    const results: Array<{ companyId: string; ok: boolean; error?: string }> = [];
    for (const companyId of companyIds) {
      try {
        await this.startCampaign(companyId, adminUserId);
        results.push({ companyId, ok: true });
      } catch (err) {
        results.push({
          companyId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { queued: results.filter((r) => r.ok).length, results };
  }

  async pauseCampaign(companyId: string) {
    return this.updateCampaignStatus(companyId, CompanyCampaignStatus.PAUSED);
  }

  async resumeCampaign(companyId: string) {
    return this.updateCampaignStatus(companyId, CompanyCampaignStatus.ACTIVE);
  }

  async stopCampaign(companyId: string, reason = 'admin_stop') {
    const campaign = await this.prisma.companyEngagementCampaign.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!campaign) throw new BadRequestException('Aktivní kampaň nenalezena.');
    return this.prisma.companyEngagementCampaign.update({
      where: { id: campaign.id },
      data: {
        status: CompanyCampaignStatus.STOPPED,
        stoppedReason: reason,
        completedAt: new Date(),
        nextSendAt: null,
      },
    });
  }

  async stopActiveCampaigns(companyId: string, reason: string) {
    await this.prisma.companyEngagementCampaign.updateMany({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
      data: {
        status: CompanyCampaignStatus.STOPPED,
        stoppedReason: reason,
        completedAt: new Date(),
        nextSendAt: null,
      },
    });
  }

  async tryAutoEnroll(companyId: string) {
    if (!COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED || !COMPANY_OUTREACH_ENABLED) return null;

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: { contacts: { orderBy: { discoveredAt: 'desc' }, take: 3 } },
    });
    if (!company || !canAutoEnrollEmailCampaign(company)) return null;

    const active = await this.prisma.companyEngagementCampaign.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } },
    });
    if (active) return active;

    const recipient =
      company.verifiedBusinessEmail?.trim() ||
      company.discoveredEmail?.trim() ||
      company.email?.trim();
    if (!recipient) return null;

    if (!company.verifiedBusinessEmail && (company.emailConfidence ?? 0) < MIN_CONTACT_CONFIDENCE_FOR_CAMPAIGN) {
      return null;
    }

    const token = company.engagementOptOutToken ?? randomBytes(24).toString('hex');
    if (!company.engagementOptOutToken) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { engagementOptOutToken: token },
      });
    }

    const now = new Date();
    const campaign = await this.prisma.companyEngagementCampaign.create({
      data: {
        companyId,
        status: CompanyCampaignStatus.ACTIVE,
        campaignType: CompanyCampaignType.ACTIVATION_SEQUENCE,
        sequenceStep: 0,
        startedAt: now,
        nextSendAt: now,
      },
    });

    if (!company.verifiedBusinessEmail && recipient) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { email: recipient },
      });
    }

    await this.audit.log({
      companyId,
      action: 'CAMPAIGN_EMAIL',
      message: 'Automaticky spuštěna engagement kampaň po nalezení kontaktu',
    });

    await this.sendActivationStep(campaign.id, 1);
    return campaign;
  }

  async handleSignificantEvent(companyId: string, type: CompanyEngagementEventType) {
    if (!COMPANY_INTEREST_NOTIFICATIONS_ENABLED) return;
    const significant: CompanyEngagementEventType[] = [
      CompanyEngagementEventType.PHONE_CLICK,
      CompanyEngagementEventType.EMAIL_CLICK,
      CompanyEngagementEventType.WEBSITE_CLICK,
      CompanyEngagementEventType.CONTACT_REQUEST,
    ];
    if (!significant.includes(type)) return;
    if (!(await this.events.canSendEngagementEmail(companyId))) return;
    await this.queueInterestEmail(companyId, type);
  }

  async queueInterestEmail(
    companyId: string,
    trigger: string,
    extra?: Record<string, string | number>,
  ) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
    });
    const recipient = company?.verifiedBusinessEmail?.trim();
    if (!company || !recipient) return;

    const sentToday = await this.events.countEngagementEmailsToday(companyId);
    const template = sentToday > 0 ? 'company_interest_digest' : 'company_interest_notification';
    const subject =
      template === 'company_interest_digest'
        ? 'Dnes se o vaši firmu zajímalo několik uživatelů'
        : 'Někdo se zajímal o vaši firmu na XXREALIT';

    const stats = await this.events.getCompanyStats(companyId, 1);
    await this.emailQueue.enqueue({
      companyId,
      template,
      recipient,
      subject,
      variables: {
        trigger,
        profileViewsToday: String(stats.profileViews),
        websiteClicksToday: String(stats.websiteClicks),
        phoneClicksToday: String(stats.phoneClicks),
        interestSummary: this.buildInterestSummary(trigger, stats, extra),
        ...(extra
          ? Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)]))
          : {}),
      },
    });
  }

  async processOptOut(token: string) {
    const company = await this.prisma.companyDirectoryEntry.findFirst({
      where: { engagementOptOutToken: token },
    });
    if (!company) throw new BadRequestException('Neplatný odkaz pro odhlášení.');

    await this.prisma.companyDirectoryEntry.update({
      where: { id: company.id },
      data: {
        communicationOptOut: true,
        communicationOptOutAt: new Date(),
      },
    });

    await this.prisma.companyEngagementCampaign.updateMany({
      where: { companyId: company.id, status: { in: ['ACTIVE', 'PAUSED'] } },
      data: {
        status: CompanyCampaignStatus.OPTED_OUT,
        stoppedReason: 'opt_out',
        completedAt: new Date(),
        nextSendAt: null,
      },
    });

    return { ok: true, companyName: company.name };
  }

  async markEmailBounced(companyId: string) {
    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: { emailBounced: true },
    });
    await this.prisma.companyEngagementCampaign.updateMany({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
      data: {
        status: CompanyCampaignStatus.BOUNCED,
        stoppedReason: 'bounce',
        completedAt: new Date(),
      },
    });
  }

  canAutoEnrollInCampaign(company: {
    verifiedBusinessEmail: string | null;
    communicationOptOut: boolean;
    contacts?: Array<{ confidence: number | null; status: string }>;
  }): boolean {
    if (!company.verifiedBusinessEmail?.trim() || company.communicationOptOut) return false;
    const verified = company.contacts?.find((c) => c.status === 'VERIFIED');
    if (verified?.confidence != null && verified.confidence < MIN_CONTACT_CONFIDENCE_FOR_CAMPAIGN) {
      return false;
    }
    return true;
  }

  private async tick() {
    if (this.processing || !COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED) return;
    this.processing = true;
    try {
      const due = await this.prisma.companyEngagementCampaign.findMany({
        where: {
          status: CompanyCampaignStatus.ACTIVE,
          nextSendAt: { lte: new Date() },
        },
        take: 10,
      });
      for (const campaign of due) {
        await this.processDueCampaign(campaign.id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processDueCampaign(campaignId: string) {
    const campaign = await this.prisma.companyEngagementCampaign.findUnique({
      where: { id: campaignId },
      include: { company: true },
    });
    if (!campaign || campaign.status !== CompanyCampaignStatus.ACTIVE) return;

    const stop = await this.shouldStopCampaign(campaign.company);
    if (stop) {
      await this.prisma.companyEngagementCampaign.update({
        where: { id: campaignId },
        data: {
          status: CompanyCampaignStatus.COMPLETED,
          stoppedReason: stop,
          completedAt: new Date(),
          nextSendAt: null,
        },
      });
      return;
    }

    if (campaign.campaignType === CompanyCampaignType.ACTIVATION_SEQUENCE) {
      const nextStep = campaign.sequenceStep + 1;
      if (nextStep <= 5) {
        await this.sendActivationStep(campaignId, nextStep);
        return;
      }
      if (COMPANY_MONTHLY_NURTURE_ENABLED) {
        await this.prisma.companyEngagementCampaign.update({
          where: { id: campaignId },
          data: {
            campaignType: CompanyCampaignType.MONTHLY_NURTURE,
            nextSendAt: this.addInterval(new Date(), CAMPAIGN_MONTHLY_INTERVAL_MS),
          },
        });
      } else {
        await this.prisma.companyEngagementCampaign.update({
          where: { id: campaignId },
          data: {
            status: CompanyCampaignStatus.COMPLETED,
            completedAt: new Date(),
            nextSendAt: null,
          },
        });
      }
      return;
    }

    if (campaign.campaignType === CompanyCampaignType.MONTHLY_NURTURE) {
      await this.sendMonthlyNurture(campaignId);
    }
  }

  private async sendActivationStep(campaignId: string, step: number) {
    const campaign = await this.prisma.companyEngagementCampaign.findUnique({
      where: { id: campaignId },
      include: { company: true },
    });
    if (!campaign) return;

    const company = campaign.company;
    const recipient = company.verifiedBusinessEmail?.trim();
    if (!recipient) return;

    const stats = await this.events.getCompanyStats(company.id, 7);
    const template = ACTIVATION_TEMPLATES[step - 1];
    const subject = ACTIVATION_SUBJECTS[step - 1];

    const base = resolveFrontendUrl();
    const variables: Record<string, string> = {
      step: String(step),
      claimUrl: `${base}/firmy/${company.slug}#prevzit-profil`,
      postUrl: `${base}/firmy/${company.slug}#pridat-prispevek`,
    };

    if (step === 3 && stats.profileViews > 0) {
      variables.profileViewsLastPeriod = String(stats.profileViews);
      variables.personalizedViewsLine = `Váš profil si za poslední období zobrazilo ${stats.profileViews} uživatelů.`;
    } else {
      variables.personalizedViewsLine =
        'Uživatelé portálu mohou váš profil zobrazovat a hledat služby ve vašem oboru.';
    }

    if (step === 2 && (company.claimedAt || company.firstPostCreatedAt)) {
      await this.prisma.companyEngagementCampaign.update({
        where: { id: campaignId },
        data: {
          status: CompanyCampaignStatus.COMPLETED,
          stoppedReason: 'goal_reached',
          completedAt: new Date(),
          nextSendAt: null,
        },
      });
      return;
    }

    await this.emailQueue.enqueue({
      companyId: company.id,
      campaignId,
      template,
      recipient,
      subject,
      variables,
    });

    const nextSendAt = this.computeNextSendAt(campaign.startedAt ?? new Date(), step);
    await this.prisma.companyEngagementCampaign.update({
      where: { id: campaignId },
      data: {
        sequenceStep: step,
        lastSentAt: new Date(),
        nextSendAt,
        ...(step >= 5 && !COMPANY_MONTHLY_NURTURE_ENABLED
          ? { status: CompanyCampaignStatus.COMPLETED, completedAt: new Date(), nextSendAt: null }
          : {}),
      },
    });
  }

  private async sendMonthlyNurture(campaignId: string) {
    const campaign = await this.prisma.companyEngagementCampaign.findUnique({
      where: { id: campaignId },
      include: { company: true },
    });
    if (!campaign) return;

    const company = campaign.company;
    const recipient = company.verifiedBusinessEmail?.trim();
    if (!recipient) return;

    const stats = await this.events.getCompanyStats(company.id, 30);
    const variables: Record<string, string> = {
      monthlyProfileViews:
        stats.profileViews > 0
          ? `Váš profil si tento měsíc zobrazilo ${stats.profileViews} lidí.`
          : 'Váš profil je viditelný na XXREALIT.',
      nurtureCta: 'Přidejte novou realizaci.',
    };

    await this.emailQueue.enqueue({
      companyId: company.id,
      campaignId,
      template: 'company_monthly_nurture',
      recipient,
      subject: 'Novinky z profilu vaší firmy na XXREALIT',
      variables,
    });

    await this.prisma.companyEngagementCampaign.update({
      where: { id: campaignId },
      data: {
        lastSentAt: new Date(),
        nextSendAt: this.addInterval(new Date(), CAMPAIGN_MONTHLY_INTERVAL_MS),
      },
    });
  }

  private computeNextSendAt(startedAt: Date, completedStep: number): Date | null {
    if (completedStep >= 5 && !COMPANY_MONTHLY_NURTURE_ENABLED) return null;
    if (COMPANY_CAMPAIGN_TEST_MODE) {
      const delay = CAMPAIGN_TEST_STEP_DELAYS_MS[completedStep - 1] ?? CAMPAIGN_SEQUENCE_INTERVAL_MS;
      return new Date(Date.now() + delay);
    }
    return this.addInterval(new Date(), CAMPAIGN_SEQUENCE_INTERVAL_MS);
  }

  private addInterval(from: Date, ms: number): Date {
    return new Date(from.getTime() + ms);
  }

  private async shouldStopCampaign(company: {
    id: string;
    claimedAt: Date | null;
    firstPostCreatedAt: Date | null;
    communicationOptOut: boolean;
    emailBounced: boolean;
    profileStatus: CompanyDirectoryProfileStatus;
  }): Promise<string | null> {
    if (company.claimedAt) return 'claimed';
    if (company.firstPostCreatedAt) return 'first_post';
    if (company.communicationOptOut) return 'opt_out';
    if (company.emailBounced) return 'bounce';
    if (company.profileStatus === CompanyDirectoryProfileStatus.CLAIMED) return 'claimed';
    return null;
  }

  private async updateCampaignStatus(companyId: string, status: CompanyCampaignStatus) {
    const campaign = await this.prisma.companyEngagementCampaign.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!campaign) throw new BadRequestException('Aktivní kampaň nenalezena.');
    return this.prisma.companyEngagementCampaign.update({
      where: { id: campaign.id },
      data: { status },
    });
  }

  private buildInterestSummary(
    trigger: string,
    stats: { profileViews: number; websiteClicks: number; phoneClicks: number },
    extra?: Record<string, string | number>,
  ): string {
    if (trigger === 'profile_views' && extra?.profileViewsLast7Days) {
      return `Váš profil si za posledních 7 dní zobrazilo ${extra.profileViewsLast7Days} uživatelů.`;
    }
    if (trigger === CompanyEngagementEventType.WEBSITE_CLICK) {
      return 'Někdo si otevřel váš web z profilu XXREALIT.';
    }
    if (trigger === CompanyEngagementEventType.PHONE_CLICK) {
      return 'Někdo si zobrazil kontaktní telefon z profilu XXREALIT.';
    }
    if (trigger === CompanyEngagementEventType.EMAIL_CLICK) {
      return 'Někdo si zobrazil kontaktní email z profilu XXREALIT.';
    }
    if (stats.websiteClicks + stats.phoneClicks > 0) {
      return 'Dnes se o vaši firmu zajímalo několik uživatelů.';
    }
    return 'Na XXREALIT se objevil zájem o váš firemní profil.';
  }
}
