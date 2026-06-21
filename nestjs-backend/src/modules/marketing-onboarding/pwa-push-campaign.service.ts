import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WebPushService } from '../web-push/web-push.service';
import {
  CreatePwaPushCampaignDto,
  UpdatePwaPushCampaignDto,
} from './dto/pwa-push-campaign.dto';

@Injectable()
export class PwaPushCampaignService {
  private readonly logger = new Logger(PwaPushCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushService,
  ) {}

  listAdmin() {
    return this.prisma.pwaPushCampaign.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  create(dto: CreatePwaPushCampaignDto) {
    return this.prisma.pwaPushCampaign.create({
      data: {
        title: dto.title.trim(),
        body: dto.body,
        url: dto.url?.trim() || null,
        targetRoles: dto.targetRoles ?? [],
        targetCity: dto.targetCity?.trim() || null,
        targetInterests: dto.targetInterests ?? [],
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      },
    });
  }

  async update(id: string, dto: UpdatePwaPushCampaignDto) {
    const existing = await this.prisma.pwaPushCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === 'SENT') {
      throw new BadRequestException('Odeslanou kampaň nelze upravit.');
    }
    return this.prisma.pwaPushCampaign.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.url !== undefined ? { url: dto.url?.trim() || null } : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.targetCity !== undefined ? { targetCity: dto.targetCity?.trim() || null } : {}),
        ...(dto.targetInterests !== undefined ? { targetInterests: dto.targetInterests } : {}),
        ...(dto.scheduledAt !== undefined
          ? {
              scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
              status: dto.scheduledAt ? 'SCHEDULED' : existing.status,
            }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async delete(id: string) {
    await this.prisma.pwaPushCampaign.delete({ where: { id } });
    return { ok: true };
  }

  async sendNow(id: string, limit = 5000) {
    const campaign = await this.prisma.pwaPushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    if (campaign.status === 'SENT') {
      throw new BadRequestException('Kampaň již byla odeslána.');
    }
    const recipients = await this.resolveRecipients(campaign, limit);
    let sent = 0;
    for (const userId of recipients) {
      const r = await this.webPush.sendToUser(
        userId,
        {
          title: campaign.title,
          body: campaign.body,
          url: campaign.url ?? '/',
          tag: `pwa-campaign-${campaign.id}`,
        },
        'any',
      );
      sent += r.sent > 0 ? 1 : 0;
    }
    await this.prisma.pwaPushCampaign.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentCount: sent,
      },
    });
    return { ok: true, recipients: recipients.length, sent };
  }

  async processDueCampaigns() {
    const now = new Date();
    const due = await this.prisma.pwaPushCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: 3,
    });
    for (const c of due) {
      try {
        await this.sendNow(c.id);
      } catch (err) {
        this.logger.warn(
          `PWA campaign ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { processed: due.length };
  }

  private async resolveRecipients(
    campaign: {
      targetRoles: string[];
      targetCity: string | null;
      targetInterests: string[];
    },
    limit: number,
  ): Promise<string[]> {
    const where: Prisma.UserWhereInput = {
      notifyPwaPush: true,
      webPushSubscriptions: { some: {} },
    };

    if (campaign.targetRoles.length > 0) {
      const roles = campaign.targetRoles.filter((r): r is UserRole =>
        Object.values(UserRole).includes(r as UserRole),
      );
      if (roles.length > 0) {
        where.role = { in: roles };
      }
    }
    if (campaign.targetCity?.trim()) {
      const city = campaign.targetCity.trim();
      where.OR = [
        { city: { contains: city, mode: 'insensitive' } },
        { agentProfile: { city: { contains: city, mode: 'insensitive' } } },
        { companyProfile: { city: { contains: city, mode: 'insensitive' } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
      take: Math.min(Math.max(limit, 1), 10000),
    });
    return users.map((u) => u.id);
  }
}
