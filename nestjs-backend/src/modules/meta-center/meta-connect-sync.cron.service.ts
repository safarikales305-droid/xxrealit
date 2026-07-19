import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { META_CONNECT_SYNC_INTERVAL_MS } from './meta-connect.constants';
import { MetaConnectDiagnosticsService } from './meta-connect-diagnostics.service';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';

const SETTINGS_ID = 'default';

@Injectable()
export class MetaConnectSyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaConnectSyncCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MetaConnectOAuthService))
    private readonly oauth: MetaConnectOAuthService,
    private readonly discovery: MetaConnectDiscoveryService,
    private readonly diagnostics: MetaConnectDiagnosticsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), META_CONNECT_SYNC_INTERVAL_MS);
    this.logger.log('[Meta Connect] 24h sync scheduler initialized');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runSyncNow(): Promise<{ ok: boolean; error?: string }> {
    return this.tick(true);
  }

  private async tick(force = false): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: false, error: 'Synchronizace již běží.' };
    this.running = true;
    try {
      const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
      if (!row?.syncEnabled || !row.metaUserAccessTokenEncrypted) {
        return { ok: false, error: 'Synchronizace není aktivní nebo chybí token.' };
      }

      if (!force && row.lastAutoSyncAt) {
        const elapsed = Date.now() - row.lastAutoSyncAt.getTime();
        if (elapsed < META_CONNECT_SYNC_INTERVAL_MS - 60_000) {
          return { ok: true };
        }
      }

      const refreshed = await this.oauth.refreshAccessToken();
      if (!refreshed.ok) {
        this.logger.warn(`[Meta Connect] token refresh failed: ${refreshed.error}`);
      }

      const token = await this.oauth.resolveAccessToken();
      await this.discovery.discoverAndPersist(token);
      await this.diagnostics.runFullDiagnostics();

      await this.prisma.metaCenterSetting.update({
        where: { id: SETTINGS_ID },
        data: { lastAutoSyncAt: new Date() },
      });

      this.logger.log('[Meta Connect] auto sync completed');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Meta Connect] sync failed: ${message}`);
      return { ok: false, error: message };
    } finally {
      this.running = false;
    }
  }
}
