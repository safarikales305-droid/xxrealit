import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PortalWorkerCommunicationService } from './portal-worker-communication.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PortalWorkerProfileReminderCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortalWorkerProfileReminderCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly communication: PortalWorkerCommunicationService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, DAY_MS);
    this.logger.log('Portal worker profile reminder scheduler initialized (daily)');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.communication.processDailyProfileReminders();
      if (result.sent > 0) {
        this.logger.log(`Sent ${result.sent} worker profile completion reminders`);
      }
    } catch (e) {
      this.logger.warn(`Profile reminder tick failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
