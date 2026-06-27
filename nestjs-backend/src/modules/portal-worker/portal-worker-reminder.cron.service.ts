import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PortalWorkerCrmService } from './portal-worker-crm.service';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class PortalWorkerReminderCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortalWorkerReminderCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly crm: PortalWorkerCrmService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, HOUR_MS);
    this.logger.log('Portal worker registration reminder scheduler initialized (hourly)');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.crm.processRegistrationReminders();
    } catch (e) {
      this.logger.warn(`Reminder tick failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
