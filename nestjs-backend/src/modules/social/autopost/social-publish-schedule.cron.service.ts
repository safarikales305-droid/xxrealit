import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SocialPublishScheduleService } from './social-publish-schedule.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';

const MINUTE_MS = 60_000;

@Injectable()
export class SocialPublishScheduleCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialPublishScheduleCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly scheduleService: SocialPublishScheduleService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick('cron');
    }, MINUTE_MS);
    this.logger.log('[Social Publish Schedule] minute scheduler initialized');
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
      const result = await this.scheduleService.processDueSchedules(10);
      if (result.processed > 0) {
        this.logger.log(`[Social Publish Schedule] ${source}: processed ${result.processed} schedule(s)`);
      }
    } finally {
      this.running = false;
    }
  }
}
