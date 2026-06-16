import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppConfigService } from './whatsapp-config.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WhatsAppTemplatesSyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppTemplatesSyncCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly templates: WhatsAppMetaTemplatesService,
    private readonly config: WhatsAppConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runSync('cron');
    }, DAY_MS);
    this.logger.log('[WhatsApp Templates] daily sync scheduler initialized');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSync(source: string) {
    if (!this.config.isCloudApiConfigured()) return;
    const result = await this.templates.syncTemplates();
    if (result.ok) {
      this.logger.log(
        `[WhatsApp Templates] ${source} sync: ${result.syncedCount} šablon (${result.approvedCount} schválených)`,
      );
    } else if (result.error) {
      this.logger.warn(`[WhatsApp Templates] ${source} sync failed: ${result.error}`);
    }
  }
}
