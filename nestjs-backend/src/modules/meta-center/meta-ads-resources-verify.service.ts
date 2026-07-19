import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';

export type MetaAdsResourceCheck = {
  key: string;
  label: string;
  id: string | null;
  ok: boolean;
  httpStatus: number | null;
  message: string;
};

@Injectable()
export class MetaAdsResourcesVerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  async verifyAll(): Promise<{
    ok: boolean;
    checks: MetaAdsResourceCheck[];
    graphVersion: string;
  }> {
    const row = await this.prisma.metaCenterSetting.findFirst();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const graphVersion = row?.graphApiVersion || this.fbConfig.getGraphApiVersion();
    const checks: MetaAdsResourceCheck[] = [];

    let token: string;
    try {
      token = await this.oauth.resolveMarketingAccessToken();
    } catch (err) {
      return {
        ok: false,
        graphVersion,
        checks: [
          {
            key: 'token',
            label: 'Marketing Access Token',
            id: null,
            ok: false,
            httpStatus: null,
            message: err instanceof Error ? err.message : 'Token chybí.',
          },
        ],
      };
    }

    const base = this.graph.graphBase(graphVersion);

    const probes: Array<{
      key: string;
      label: string;
      id: string | null;
      path: string | null;
    }> = [
      { key: 'page', label: 'Facebook Page', id: row?.pageId?.trim() ?? null, path: row?.pageId?.trim() ? `/${row.pageId.trim()}?fields=id,name` : null },
      {
        key: 'ad_account',
        label: 'Ad Account',
        id: ids.adAccountId,
        path: ids.adAccountId
          ? `/act_${ids.adAccountId.replace(/^act_/, '')}?fields=id,name,account_status`
          : null,
      },
      {
        key: 'catalog',
        label: 'Catalog',
        id: ids.catalogId,
        path: ids.catalogId ? `/${ids.catalogId}?fields=id,name` : null,
      },
      {
        key: 'pixel',
        label: 'Pixel',
        id: ids.pixelId,
        path: ids.pixelId ? `/${ids.pixelId}?fields=id,name` : null,
      },
      {
        key: 'dataset',
        label: 'Dataset',
        id: ids.datasetId,
        path: ids.datasetId ? `/${ids.datasetId}?fields=id,name` : null,
      },
    ];

    for (const probe of probes) {
      if (!probe.id || !probe.path) {
        checks.push({
          key: probe.key,
          label: probe.label,
          id: probe.id,
          ok: false,
          httpStatus: null,
          message: 'ID není nakonfigurováno.',
        });
        continue;
      }
      const result = await this.graph.get<Record<string, unknown>>(probe.path, token);
      checks.push({
        key: probe.key,
        label: probe.label,
        id: probe.id,
        ok: result.ok,
        httpStatus: result.httpStatus,
        message: result.ok
          ? 'OK'
          : result.errorMessage ?? `Graph API chyba (HTTP ${result.httpStatus}).`,
      });
    }

    return {
      ok: checks.every((c) => c.ok),
      checks,
      graphVersion,
    };
  }
}
