import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ActivityLogCategory,
  EmailCampaignStatus,
  EmailLogStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { ActivityLogService } from './activity-log.service';
import { isCommunicationRole } from './communication.constants';
import type {
  CommunicationEmailBulkDto,
  CommunicationEmailSendDto,
} from './dto/communication-email.dto';

@Injectable()
export class CommunicationEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private assertAccess(role: UserRole) {
    if (!isCommunicationRole(role)) {
      throw new ForbiddenException('E-mail centrum je dostupné jen pro profesionální účty.');
    }
  }

  async listLogs(userId: string, role: UserRole, limit = 100) {
    this.assertAccess(role);
    const rows = await this.prisma.emailLog.findMany({
      where: {
        type: { startsWith: 'communication:' },
        payloadJson: {
          path: ['senderUserId'],
          equals: userId,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });

    return rows.map((r) => ({
      id: r.id,
      to: r.recipientEmail,
      subject: r.subject,
      status: r.status,
      type: r.type,
      delivered: r.status === EmailLogStatus.sent,
      error: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
  }

  async listTemplates(userId: string, role: UserRole) {
    this.assertAccess(role);
    const rows = await this.prisma.emailTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true, subject: true },
    });
    return rows;
  }

  async sendIndividual(userId: string, role: UserRole, dto: CommunicationEmailSendDto) {
    this.assertAccess(role);
    const html = `<div style="font-family:sans-serif;line-height:1.5">${dto.body.replace(/\n/g, '<br>')}</div>`;
    const text = dto.body;

    await this.emails.sendRawEmail({
      type: `communication:individual`,
      to: dto.to,
      subject: dto.subject,
      html,
      text,
      metadata: {
        senderUserId: userId,
        listingId: dto.listingId ?? null,
        recipientName: dto.recipientName ?? null,
      },
    });

    await this.activityLog.log({
      category: ActivityLogCategory.EMAIL,
      userId,
      listingId: dto.listingId ?? null,
      message: `E-mail → ${dto.to}: ${dto.subject}`,
      metadata: { recipientName: dto.recipientName },
    });

    if (dto.recipientName || dto.to) {
      await this.prisma.crmContact.updateMany({
        where: { ownerUserId: userId, email: dto.to },
        data: { lastContactAt: new Date() },
      });
    }

    return { ok: true };
  }

  async sendBulk(userId: string, role: UserRole, dto: CommunicationEmailBulkDto) {
    this.assertAccess(role);
    if (!dto.recipients.length) {
      throw new BadRequestException('Zadejte alespoň jednoho příjemce.');
    }

    const campaign = await this.prisma.emailCampaign.create({
      data: {
        type: 'communication_bulk',
        title: dto.subject,
        subject: dto.subject,
        htmlContent: dto.body.replace(/\n/g, '<br>'),
        status: EmailCampaignStatus.draft,
        audienceJson: { senderUserId: userId, recipients: dto.recipients },
      },
    });

    let sent = 0;
    let failed = 0;
    const html = `<div style="font-family:sans-serif;line-height:1.5">${dto.body.replace(/\n/g, '<br>')}</div>`;

    for (const to of dto.recipients) {
      try {
        await this.emails.sendRawEmail({
          type: `communication:bulk`,
          to,
          subject: dto.subject,
          html,
          text: dto.body,
          metadata: { senderUserId: userId, campaignId: campaign.id },
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    await this.prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failed === dto.recipients.length ? EmailCampaignStatus.failed : EmailCampaignStatus.sent,
        sentAt: new Date(),
      },
    });

    await this.activityLog.log({
      category: ActivityLogCategory.EMAIL,
      userId,
      message: `Hromadný e-mail: ${sent}/${dto.recipients.length} odesláno`,
      metadata: { campaignId: campaign.id, sent, failed },
    });

    return { ok: true, sent, failed, campaignId: campaign.id };
  }

  async countAll() {
    return this.prisma.emailLog.count();
  }
}
