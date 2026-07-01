import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TikTokQueueService } from './tiktok-queue.service';
import { TikTokOAuthService } from './tiktok-oauth.service';

const MINUTE_MS = 60_000;

@Injectable()
export class TikTokQueueCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TikTokQueueCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue: TikTokQueueService,
    private readonly oauth: TikTokOAuthService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, MINUTE_MS);
    this.logger.log('[TikTok Queue] minute scheduler initialized');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const conn = await this.oauth.getActiveConnection();
    if (!conn?.isActive) return;
    const { processed } = await this.queue.processNext();
    if (processed) {
      this.logger.log('[TikTok Queue] processed one job');
    }
  }
}
