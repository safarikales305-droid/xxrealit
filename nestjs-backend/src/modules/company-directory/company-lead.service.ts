import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanyEngagementEventType, CompanyLeadStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyEmailQueueService } from './company-email-queue.service';
import { CompanyEngagementEventService } from './company-engagement-event.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import { COMPANY_OUTREACH_ENABLED } from './company-directory.constants';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';

@Injectable()
export class CompanyLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CompanyAuditService,
    private readonly emailQueue: CompanyEmailQueueService,
    private readonly events: CompanyEngagementEventService,
  ) {}

  async createLead(input: {
    companyId: string;
    userId?: string;
    name: string;
    email: string;
    phone?: string;
    message?: string;
    consent: boolean;
  }) {
    if (!input.consent) {
      throw new BadRequestException('Pro odeslání je nutný souhlas se sdílením kontaktu.');
    }

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: input.companyId },
    });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const lead = await this.prisma.companyLead.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        message: input.message?.trim() || null,
        consent: true,
        status: CompanyLeadStatus.NEW,
      },
    });

    await this.events.trackEvent({
      companyId: input.companyId,
      type: CompanyEngagementEventType.CONTACT_REQUEST,
      userId: input.userId,
    });

    await this.audit.log({
      companyId: input.companyId,
      action: 'LEAD_CREATED',
      message: `Nový lead od ${lead.name}`,
      meta: { leadId: lead.id },
    });

    await this.notifyCompany(lead.id);
    return lead;
  }

  async listLeads(companyId: string) {
    return this.prisma.companyLead.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listAdminLeads(limit = 50) {
    return this.prisma.companyLead.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  private async notifyCompany(leadId: string) {
    if (!COMPANY_OUTREACH_ENABLED) return;

    const lead = await this.prisma.companyLead.findUnique({
      where: { id: leadId },
      include: { company: true },
    });
    if (!lead) return;

    const recipient = lead.company.verifiedBusinessEmail?.trim();
    if (!recipient || lead.company.communicationOptOut) return;

    await this.emailQueue.enqueue({
      companyId: lead.companyId,
      template: 'company_new_lead',
      recipient,
      subject: 'Nový zájemce z XXREALIT',
      variables: {
        leadName: lead.name,
        leadEmail: lead.email,
        leadPhone: lead.phone ?? '',
        leadMessage: lead.message ?? '',
        leadUrl: `${resolveFrontendUrl()}/firmy/${lead.company.slug}#leady`,
      },
    });

    await this.audit.log({
      companyId: lead.companyId,
      action: 'LEAD_NOTIFY',
      message: `Lead notifikace odeslána pro ${lead.name}`,
      meta: { leadId },
    });
  }
}

@Injectable()
export class CompanyEngagementFacadeService {
  constructor(
    private readonly events: CompanyEngagementEventService,
    private readonly campaigns: CompanyEngagementCampaignService,
  ) {}

  async trackPublicEvent(input: {
    companyId: string;
    type: CompanyEngagementEventType;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const event = await this.events.trackEvent(input);
    await this.campaigns.handleSignificantEvent(input.companyId, input.type);
    if (input.type === CompanyEngagementEventType.PROFILE_VIEW) {
      const shouldNotify = await this.events.shouldTriggerProfileViewInterest(input.companyId);
      if (shouldNotify) {
        const views = await this.events.getProfileViewCount(input.companyId, 7);
        await this.campaigns.queueInterestEmail(input.companyId, 'profile_views', {
          profileViewsLast7Days: views,
        });
      }
    }
    return event;
  }
}
