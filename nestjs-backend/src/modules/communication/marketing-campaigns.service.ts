import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityLogCategory,
  MarketingCampaignAudience,
  MarketingCampaignChannel,
  MarketingCampaignStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CommunicationEmailService } from './communication-email.service';
import { CommunicationWhatsAppService } from './communication-whatsapp.service';
import { ActivityLogService } from './activity-log.service';
import { isCommunicationRole } from './communication.constants';
import type { CreateMarketingCampaignDto } from './dto/create-marketing-campaign.dto';

@Injectable()
export class MarketingCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: CommunicationWhatsAppService,
    private readonly email: CommunicationEmailService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private assertAccess(role: UserRole) {
    if (!isCommunicationRole(role)) {
      throw new ForbiddenException('Marketing kampaně jsou dostupné jen pro profesionální účty.');
    }
  }

  private audienceWhere(
    audience: MarketingCampaignAudience,
    region?: string | null,
    city?: string | null,
  ) {
    switch (audience) {
      case MarketingCampaignAudience.AGENTS:
        return { role: UserRole.AGENT };
      case MarketingCampaignAudience.INVESTORS:
        return { role: UserRole.INVESTOR };
      case MarketingCampaignAudience.FINANCIAL_ADVISORS:
        return { role: UserRole.FINANCIAL_ADVISOR };
      case MarketingCampaignAudience.CONSTRUCTION_COMPANIES:
        return { role: UserRole.COMPANY };
      case MarketingCampaignAudience.CRAFTSMEN:
        return { role: UserRole.CRAFTSMAN };
      case MarketingCampaignAudience.BY_REGION:
        return region?.trim()
          ? {
              OR: [
                { brokerRegionLabel: { contains: region.trim(), mode: 'insensitive' as const } },
                { brokerPreferredRegions: { has: region.trim() } },
              ],
            }
          : {};
      case MarketingCampaignAudience.BY_CITY:
        return city?.trim() ? { city: { equals: city.trim(), mode: 'insensitive' as const } } : {};
      case MarketingCampaignAudience.ALL_USERS:
      default:
        return { role: { not: UserRole.ADMIN } };
    }
  }

  async list(userId: string, role: UserRole) {
    this.assertAccess(role);
    const where = role === UserRole.ADMIN ? {} : { createdByUserId: userId };
    const rows = await this.prisma.marketingCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toRow(r));
  }

  async create(userId: string, role: UserRole, dto: CreateMarketingCampaignDto) {
    this.assertAccess(role);
    const row = await this.prisma.marketingCampaign.create({
      data: {
        createdByUserId: userId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        channel: dto.channel,
        audience: dto.audience,
        audienceRegion: dto.audienceRegion?.trim() || null,
        audienceCity: dto.audienceCity?.trim() || null,
        status: dto.scheduledAt ? MarketingCampaignStatus.SCHEDULED : MarketingCampaignStatus.DRAFT,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
    return this.toRow(row);
  }

  async send(userId: string, role: UserRole, campaignId: string) {
    this.assertAccess(role);
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: role === UserRole.ADMIN ? { id: campaignId } : { id: campaignId, createdByUserId: userId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status: MarketingCampaignStatus.SENDING },
    });

    const users = await this.prisma.user.findMany({
      where: {
        ...this.audienceWhere(campaign.audience, campaign.audienceRegion, campaign.audienceCity),
        email: { not: '' },
      },
      select: { id: true, email: true, name: true, phone: true, whatsappPhone: true },
      take: 500,
    });

    let delivered = 0;
    let failed = 0;

    for (const u of users) {
      try {
        if (campaign.channel === MarketingCampaignChannel.EMAIL && u.email) {
          await this.email.sendIndividual(userId, role, {
            to: u.email,
            recipientName: u.name ?? undefined,
            subject: campaign.title,
            body: campaign.body,
          });
          delivered += 1;
        } else if (campaign.channel === MarketingCampaignChannel.WHATSAPP) {
          const phone = u.whatsappPhone?.trim() || u.phone?.trim();
          if (!phone) {
            failed += 1;
            continue;
          }
          await this.whatsapp.sendMessage(userId, role, {
            toPhone: phone,
            recipientName: u.name ?? undefined,
            message: campaign.body,
          });
          delivered += 1;
        } else if (campaign.channel === MarketingCampaignChannel.INTERNAL_MESSAGE) {
          await this.prisma.userNotification.create({
            data: {
              userId: u.id,
              type: 'MARKETING_CAMPAIGN',
              title: campaign.title,
              body: campaign.body.slice(0, 1000),
              data: { link: '/profil/dashboard?tab=notifications' },
            },
          });
          delivered += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    const updated = await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: failed === users.length ? MarketingCampaignStatus.FAILED : MarketingCampaignStatus.SENT,
        sentAt: new Date(),
        recipientCount: users.length,
        deliveredCount: delivered,
        failedCount: failed,
      },
    });

    await this.activityLog.log({
      category: ActivityLogCategory.MARKETING_CAMPAIGN,
      userId,
      message: `Kampaň „${campaign.title}“ odeslána (${delivered}/${users.length})`,
      metadata: { campaignId, channel: campaign.channel, delivered, failed },
    });

    return this.toRow(updated);
  }

  async countAll() {
    return this.prisma.marketingCampaign.count();
  }

  private toRow(r: {
    id: string;
    title: string;
    body: string;
    channel: MarketingCampaignChannel;
    audience: MarketingCampaignAudience;
    audienceRegion: string | null;
    audienceCity: string | null;
    status: MarketingCampaignStatus;
    scheduledAt: Date | null;
    sentAt: Date | null;
    recipientCount: number;
    deliveredCount: number;
    failedCount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      channel: r.channel,
      audience: r.audience,
      audienceRegion: r.audienceRegion,
      audienceCity: r.audienceCity,
      status: r.status,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      recipientCount: r.recipientCount,
      deliveredCount: r.deliveredCount,
      failedCount: r.failedCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
