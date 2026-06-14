import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FACEBOOK_URL_IMPORT_CRON_MS } from './facebook-url-import.constants';
import { FacebookUrlImportService } from './facebook-url-import.service';

@Injectable()
export class FacebookUrlImportCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookUrlImportCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly imports: FacebookUrlImportService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runScheduled().catch((err) => {
        this.logger.warn(`FACEBOOK_URL_CRON_FAIL ${String(err)}`);
      });
    }, FACEBOOK_URL_IMPORT_CRON_MS);
    void this.runScheduled();
    this.logger.log('[facebook-url-import] cron initialized (every 6h)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runScheduled() {
    await this.imports.syncAllEnabled();
  }
}
