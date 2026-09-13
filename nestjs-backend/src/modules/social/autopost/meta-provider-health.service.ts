import { Injectable } from '@nestjs/common';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import {
  SocialPublisherService,
  type FacebookTestConnectionResult,
} from './social-publisher.service';

export type MetaFacebookHealthStatus =
  | 'READY'
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_MISSING'
  | 'DISCONNECTED'
  | 'ERROR';

export type MetaFacebookHealthSnapshot = FacebookTestConnectionResult & {
  status: MetaFacebookHealthStatus;
  storedPageConnected: boolean;
  lastSuccessfulCheckAt?: string | null;
};

@Injectable()
export class MetaProviderHealthService {
  private lastSuccessfulCheckAt: string | null = null;

  constructor(
    private readonly publisher: SocialPublisherService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  hasStoredPageConnection(): boolean {
    const pageId = this.settings.resolveFacebookPageId();
    const token = this.settings.resolveFacebookPageAccessToken();
    const fb = this.settings.getSettings().facebook;
    return Boolean(pageId && (token || fb.pageId || fb.pageName));
  }

  private mapStatus(
    result: FacebookTestConnectionResult,
    storedPageConnected: boolean,
  ): MetaFacebookHealthStatus {
    if (result.healthStatus === 'RATE_LIMITED' || result.rateLimited) return 'RATE_LIMITED';
    if (result.ok) return 'READY';
    if (result.healthStatus === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
    if (!storedPageConnected) return 'DISCONNECTED';
    if (result.graphError?.code === 200 || result.graphError?.code === 10) {
      return 'PERMISSION_MISSING';
    }
    return 'ERROR';
  }

  async getFacebookPageHealth(options?: {
    bypassCache?: boolean;
  }): Promise<MetaFacebookHealthSnapshot> {
    const storedPageConnected = this.hasStoredPageConnection();
    const probe = await this.publisher.testFacebookConnection(options);
    const status = this.mapStatus(probe, storedPageConnected);
    if (probe.ok) {
      this.lastSuccessfulCheckAt = probe.checkedAt ?? new Date().toISOString();
    }
    const connected =
      storedPageConnected ||
      probe.connected === true ||
      status === 'RATE_LIMITED' ||
      status === 'READY';
    return {
      ...probe,
      ok: probe.ok,
      connected,
      rateLimited: status === 'RATE_LIMITED',
      healthStatus:
        status === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : status === 'READY'
            ? 'READY'
            : probe.healthStatus,
      status,
      storedPageConnected,
      lastSuccessfulCheckAt: this.lastSuccessfulCheckAt,
    };
  }
}
