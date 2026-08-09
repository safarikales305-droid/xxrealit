import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { FACEBOOK_MEDIA_REFRESH_CRON_INTERVAL_MS } from './facebook-page.constants';
import { FacebookMediaRefreshService } from './facebook-media-refresh.service';

@Injectable()
export class FacebookMediaRefreshCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookMediaRefreshCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaRefresh: FacebookMediaRefreshService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runScheduledRefresh().catch((err) => {
        this.logger.warn(`[FacebookMediaRefresh] cron failed: ${String(err)}`);
      });
    }, FACEBOOK_MEDIA_REFRESH_CRON_INTERVAL_MS);

    void this.runScheduledRefresh().catch((err) => {
      this.logger.warn(`[FacebookMediaRefresh] initial run failed: ${String(err)}`);
    });
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runScheduledRefresh() {
    const connections = await this.prisma.facebookPageConnection.findMany({
      where: { isActive: true },
      select: { id: true, pageId: true, userId: true },
    });

    let totalRefreshed = 0;
    for (const conn of connections) {
      const result = await this.mediaRefresh.refreshStaleMediaForConnection(conn.id);
      totalRefreshed += result.refreshed;
    }

    if (totalRefreshed > 0) {
      this.logger.log(
        `[FacebookMediaRefresh] cron connections=${connections.length} refreshed=${totalRefreshed}`,
      );
    }
  }
}
