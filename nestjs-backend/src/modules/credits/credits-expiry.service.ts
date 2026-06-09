import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CreditsService } from './credits.service';

@Injectable()
export class CreditsExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreditsExpiryService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly credits: CreditsService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.credits.expireAllPending().then((n) => {
        if (n > 0) {
          this.logger.log(`[credit-top-up] expired ${n} pending transaction(s)`);
        }
      });
    }, 60 * 60 * 1000);
    void this.credits.expireAllPending();
    this.logger.log('[credit-top-up] expiry scheduler initialized (hourly)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
