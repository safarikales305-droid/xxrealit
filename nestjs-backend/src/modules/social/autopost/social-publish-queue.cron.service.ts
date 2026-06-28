import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SocialPublishProcessorService } from './social-publish-enqueue.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';

const MINUTE_MS = 60_000;

@Injectable()
export class SocialPublishQueueCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialPublishQueueCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly processor: SocialPublishProcessorService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick('cron');
    }, MINUTE_MS);
    this.logger.log('[Social Publish Queue] minute scheduler initialized');
    void this.tick('startup');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(source: string) {
    if (this.running) return;
    if (!this.settings.isFacebookAutopostReady()) return;

    this.running = true;
    try {
      const result = await this.processor.processDueBatch(5);
      if (result.processed > 0) {
        this.logger.log(`[Social Publish Queue] ${source}: processed ${result.processed} item(s)`);
      }
    } finally {
      this.running = false;
    }
  }
}
