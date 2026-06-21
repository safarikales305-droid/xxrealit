import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PwaPushCampaignService } from './pwa-push-campaign.service';

const MINUTE_MS = 60_000;

@Injectable()
export class PwaPushCampaignCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PwaPushCampaignCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly campaigns: PwaPushCampaignService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), MINUTE_MS);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.campaigns.processDueCampaigns();
      if (r.processed > 0) {
        this.logger.log(`Processed ${r.processed} due PWA push campaign(s)`);
      }
    } finally {
      this.running = false;
    }
  }
}
