import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { YouTubePublishJobService } from './youtube-publish-job.service';

const MINUTE_MS = 60_000;

@Injectable()
export class YouTubeQueueCronService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(YouTubeQueueCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly queue: YouTubePublishJobService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, MINUTE_MS);
    this.log.log('[YouTube Queue] minute scheduler initialized');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const { processed } = await this.queue.processQueue();
    if (processed) {
      this.log.log('[YouTube Queue] processed one job');
    }
  }
}
