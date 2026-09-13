import { Injectable } from '@nestjs/common';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import {
  SocialPublisherService,
  type FacebookTestConnectionResult,
} from './social-publisher.service';
import {
  MetaGraphCoordinatorService,
  type MetaGraphTelemetry,
} from './meta-graph-coordinator.service';

export type MetaFacebookHealthStatus =
  | 'READY'
  | 'CONNECTED_RATE_LIMITED'
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_MISSING'
  | 'DISCONNECTED'
  | 'ERROR';

export type MetaFacebookHealthSnapshot = FacebookTestConnectionResult & {
  status: MetaFacebookHealthStatus;
  storedPageConnected: boolean;
  lastSuccessfulCheckAt?: string | null;
  metaGraphTelemetry?: MetaGraphTelemetry;
};

@Injectable()
export class MetaProviderHealthService {
  private lastSuccessfulCheckAt: string | null = null;
  private healthSnapshotCache: {
    expiresAt: number;
    snapshot: MetaFacebookHealthSnapshot;
  } | null = null;
  private readonly healthCacheMs = 15 * 60 * 1000;

  constructor(
    private readonly publisher: SocialPublisherService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly metaGraph: MetaGraphCoordinatorService,
  ) {}

  hasStoredPageConnection(): boolean {
    const pageId = this.settings.resolveFacebookPageId();
    const token = this.settings.resolveFacebookPageAccessToken();
    const fb = this.settings.getSettings().facebook;
    return Boolean(pageId && (token || fb.pageId || fb.pageName));
  }

  getMetaTelemetry(): MetaGraphTelemetry {
    return this.metaGraph.getTelemetry({
      hasStoredConnection: this.hasStoredPageConnection(),
    });
  }

  private mapStatus(
    result: FacebookTestConnectionResult,
    storedPageConnected: boolean,
  ): MetaFacebookHealthStatus {
    if (
      result.healthStatus === 'CONNECTED_RATE_LIMITED' ||
      result.healthStatus === 'RATE_LIMITED' ||
      result.rateLimited
    ) {
      return 'CONNECTED_RATE_LIMITED';
    }
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
    forceLive?: boolean;
  }): Promise<MetaFacebookHealthSnapshot> {
    const now = Date.now();
    if (
      !options?.bypassCache &&
      !options?.forceLive &&
      this.healthSnapshotCache &&
      this.healthSnapshotCache.expiresAt > now
    ) {
      return {
        ...this.healthSnapshotCache.snapshot,
        cached: true,
        metaGraphTelemetry: this.getMetaTelemetry(),
      };
    }

    const storedPageConnected = this.hasStoredPageConnection();
    const probe = await this.publisher.testFacebookConnection(options);
    const status = this.mapStatus(probe, storedPageConnected);
    if (probe.ok) {
      this.lastSuccessfulCheckAt = probe.checkedAt ?? new Date().toISOString();
    }
    const connected =
      storedPageConnected ||
      probe.connected === true ||
      status === 'CONNECTED_RATE_LIMITED' ||
      status === 'READY';
    const snapshot: MetaFacebookHealthSnapshot = {
      ...probe,
      ok: probe.ok,
      connected,
      rateLimited: status === 'CONNECTED_RATE_LIMITED',
      healthStatus:
        status === 'CONNECTED_RATE_LIMITED'
          ? 'CONNECTED_RATE_LIMITED'
          : status === 'READY'
            ? 'READY'
            : probe.healthStatus,
      status,
      storedPageConnected,
      lastSuccessfulCheckAt: this.lastSuccessfulCheckAt,
      metaGraphTelemetry: this.getMetaTelemetry(),
    };

    if (!options?.forceLive) {
      this.healthSnapshotCache = {
        expiresAt: now + this.healthCacheMs,
        snapshot,
      };
    }

    return snapshot;
  }
}
