import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsAppMarketingCampaignStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppMarketingService } from './whatsapp-marketing.service';

const MINUTE_MS = 60_000;

@Injectable()
export class WhatsAppCampaignScheduleCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppCampaignScheduleCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketing: WhatsAppMarketingService,
    private readonly config: WhatsAppConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick('cron');
    }, MINUTE_MS);
    this.logger.log('[WhatsApp Campaign Schedule] minute scheduler initialized (Europe/Prague)');
    void this.tick('startup');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(source: string) {
    if (this.running) return;
    if (!this.config.isCloudApiConfigured()) return;

    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.whatsAppMarketingCampaign.findMany({
        where: {
          status: WhatsAppMarketingCampaignStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      });

      if (!due.length) return;

      this.logger.log(
        `[WhatsApp Campaign Schedule] ${source}: found ${due.length} due campaign(s) at ${now.toISOString()}`,
      );

      for (const campaign of due) {
        this.logger.log(
          `[WhatsApp Campaign Schedule] triggering campaignId=${campaign.id} name="${campaign.name}" scheduledAt=${campaign.scheduledAt?.toISOString() ?? '—'}`,
        );
        try {
          const result = await this.marketing.runCampaign(campaign.id, 'cron');
          this.logger.log(
            `[WhatsApp Campaign Schedule] done campaignId=${campaign.id} sent=${result.sentCount}/${result.recipientCount} failed=${result.failedCount} status=${result.status}`,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[WhatsApp Campaign Schedule] failed campaignId=${campaign.id}: ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
