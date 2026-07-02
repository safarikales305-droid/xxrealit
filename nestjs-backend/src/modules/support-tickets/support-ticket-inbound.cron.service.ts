import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupportTicketInboundService } from './support-ticket-inbound.service';

const POLL_MS = 120_000;

@Injectable()
export class SupportTicketInboundCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportTicketInboundCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly inbound: SupportTicketInboundService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
    this.logger.log('[Support IMAP] scheduler initialized (2 min interval)');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const { fetched } = await this.inbound.pollAllMailboxes();
      if (fetched > 0) {
        this.logger.log(`[Support IMAP] processed ${fetched} inbound message(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `[Support IMAP] tick failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
