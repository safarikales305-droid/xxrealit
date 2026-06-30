import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailCampaignsService } from './email-campaigns.service';

const MINUTE_MS = 60_000;

@Injectable()
export class EmailCampaignsCronService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EmailCampaignsCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly campaigns: EmailCampaignsService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, MINUTE_MS);
    this.log.log('[email-campaigns] minute scheduler initialized');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.campaigns.processDueRecipients(undefined, 40);
      if (n > 0) {
        this.log.log(`[email-campaigns] processed ${n} recipient step(s)`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`[email-campaigns] cron failed: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
