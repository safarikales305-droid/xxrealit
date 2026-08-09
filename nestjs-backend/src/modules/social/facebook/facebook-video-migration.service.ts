import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FacebookMediaRefreshService } from './facebook-media-refresh.service';

@Injectable()
export class FacebookVideoMigrationService implements OnModuleInit {
  private readonly logger = new Logger(FacebookVideoMigrationService.name);

  constructor(private readonly mediaRefresh: FacebookMediaRefreshService) {}

  onModuleInit() {
    void this.repairImportedFacebookVideos().catch((err) => {
      this.logger.warn(`[FacebookMediaRefresh] startup repair failed: ${String(err)}`);
    });
  }

  async repairImportedFacebookVideos(): Promise<{ repaired: number; skipped: boolean }> {
    const result = await this.mediaRefresh.repairAllImportedFacebookVideos({ limit: 500 });
    return { repaired: result.refreshed, skipped: result.processed === 0 };
  }
}
