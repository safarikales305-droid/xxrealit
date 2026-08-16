import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CompanyEmailLogStatus, CompanyEmailQueueStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import {
  ARES_WORKER_TICK_MS,
  COMPANY_EMAIL_QUEUE_BATCH_SIZE,
  COMPANY_EMAIL_QUEUE_DELAY_MS,
  COMPANY_OUTREACH_ENABLED,
} from './company-directory.constants';

@Injectable()
export class CompanyEmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyEmailQueueService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(input: {
    companyId: string;
    campaignId?: string;
    template: string;
    recipient: string;
    subject: string;
    variables?: Record<string, string>;
    scheduledAt?: Date;
  }) {
    return this.prisma.companyEmailQueueItem.create({
      data: {
        companyId: input.companyId,
        campaignId: input.campaignId ?? null,
        template: input.template,
        recipient: input.recipient.trim().toLowerCase(),
        subject: input.subject,
        variables: input.variables ?? {},
        scheduledAt: input.scheduledAt ?? new Date(),
      },
    });
  }

  private async tick() {
    if (this.processing || !COMPANY_OUTREACH_ENABLED) return;
    this.processing = true;
    try {
      const items = await this.prisma.companyEmailQueueItem.findMany({
        where: {
          status: CompanyEmailQueueStatus.QUEUED,
          scheduledAt: { lte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: COMPANY_EMAIL_QUEUE_BATCH_SIZE,
      });

      for (const item of items) {
        await this.processItem(item.id);
        await new Promise((r) => setTimeout(r, COMPANY_EMAIL_QUEUE_DELAY_MS));
      }
    } finally {
      this.processing = false;
    }
  }

  private async processItem(id: string) {
    const item = await this.prisma.companyEmailQueueItem.findUnique({ where: { id } });
    if (!item || item.status !== CompanyEmailQueueStatus.QUEUED) return;

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: item.companyId },
    });
    if (!company || company.communicationOptOut || company.emailBounced) {
      await this.prisma.companyEmailQueueItem.update({
        where: { id },
        data: { status: CompanyEmailQueueStatus.CANCELLED, processedAt: new Date() },
      });
      return;
    }

    await this.prisma.companyEmailQueueItem.update({
      where: { id },
      data: { status: CompanyEmailQueueStatus.PROCESSING, attempts: { increment: 1 } },
    });

    const vars = (item.variables as Record<string, string> | null) ?? {};
    const optOutUrl = company.engagementOptOutToken
      ? `${resolveFrontendUrl()}/firmy/unsubscribe?token=${company.engagementOptOutToken}`
      : '';

    const log = await this.prisma.companyEmailLog.create({
      data: {
        companyId: item.companyId,
        campaignId: item.campaignId,
        recipient: item.recipient,
        subject: item.subject,
        template: item.template,
        status: CompanyEmailLogStatus.QUEUED,
      },
    });

    try {
      await this.emails.sendTemplatedEmail({
        type: 'company_outreach',
        to: item.recipient,
        templateKey: item.template,
        variables: {
          portalName: 'XXREALIT',
          companyName: company.name,
          companyUrl: `${resolveFrontendUrl()}/firmy/${company.slug}`,
          claimUrl: `${resolveFrontendUrl()}/firmy/${company.slug}#prevzit-profil`,
          postUrl: `${resolveFrontendUrl()}/firmy/${company.slug}#pridat-prispevek`,
          optOutUrl,
          ...vars,
        },
      });

      await this.prisma.companyEmailLog.update({
        where: { id: log.id },
        data: { status: CompanyEmailLogStatus.SENT, sentAt: new Date() },
      });
      await this.prisma.companyEmailQueueItem.update({
        where: { id },
        data: { status: CompanyEmailQueueStatus.SENT, processedAt: new Date() },
      });
      await this.prisma.companyDirectoryEntry.update({
        where: { id: item.companyId },
        data: { lastEngagementEmailAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.companyEmailLog.update({
        where: { id: log.id },
        data: { status: CompanyEmailLogStatus.FAILED, error: message },
      });
      await this.prisma.companyEmailQueueItem.update({
        where: { id },
        data: {
          status: item.attempts >= 2 ? CompanyEmailQueueStatus.FAILED : CompanyEmailQueueStatus.QUEUED,
          lastError: message,
          processedAt: new Date(),
        },
      });
      this.log.warn(`Email queue item ${id} failed: ${message}`);
    }
  }
}
