import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogSyncService } from '../meta-catalog/meta-catalog-sync.service';
import { META_AD_ACCOUNT_OPTIONAL_MESSAGE, resolveMetaCenterIds } from './meta-center-env.util';
import { MetaCenterGraphDiagnosticsService } from './meta-center-graph-diagnostics.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { META_EXTERNAL_LINKS } from './meta-graph-permissions.util';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

type GraphList<T> = { data?: T[] };

@Injectable()
export class MetaCenterAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraphClientService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graphDiag: MetaCenterGraphDiagnosticsService,
    private readonly catalogSync: MetaCatalogSyncService,
    private readonly provision: MetaConnectProvisionService,
  ) {}

  private async getSettingRow() {
    return this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
  }

  private async resolveToken(): Promise<string> {
    return this.oauth.resolveAccessToken();
  }

  async listDatasets() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeDatasetId = ids.datasetId;
    if (!ids.businessId) {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          isActive: boolean;
          lastFiredTime: string | null;
          sourceApp: string | null;
        }>,
        activeDatasetId,
        error: 'Chybí Business Manager ID — nejdřív připojte Catalog OAuth.',
      };
    }
    try {
      const token = await this.resolveToken();
      const res = await this.graph.get<
        GraphList<{
          id?: string;
          name?: string;
          last_fired_time?: string;
          owner_business?: { id?: string; name?: string };
        }>
      >(`/${ids.businessId}/adspixels`, token, {
        fields: 'id,name,last_fired_time,owner_business',
        limit: '50',
      });
      const items = (res.ok ? res.data.data ?? [] : []).map((p) => ({
        id: p.id ?? '',
        name: p.name ?? p.id ?? 'Dataset',
        isActive: p.id === activeDatasetId,
        lastFiredTime: p.last_fired_time ?? null,
        sourceApp: p.owner_business?.name ?? null,
      }));
      return { items: items.filter((i) => i.id), activeDatasetId, error: null };
    } catch (err) {
      return {
        items: [],
        activeDatasetId,
        error: err instanceof Error ? err.message : 'Nelze načíst datasety.',
      };
    }
  }

  async selectDataset(datasetId: string) {
    const id = datasetId.trim();
    if (!id) return { ok: false, error: 'Dataset ID je prázdné.' };
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, datasetId: id },
      update: { datasetId: id },
    });
    return { ok: true, datasetId: id };
  }

  async getCatalogPanel() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const graph = await this.graphDiag.buildCatalogDiagnostics();
    const exportedCount = await this.prisma.metaCatalogExportItem.count({
      where: { exportStatus: 'exported' },
    });
    const grantsSnap = row?.diagnosticsSnapshot as Record<string, unknown> | null;
    const catalogGrant =
      grantsSnap?.oauthFlowGrants &&
      typeof grantsSnap.oauthFlowGrants === 'object' &&
      (grantsSnap.oauthFlowGrants as Record<string, unknown>).catalog;
    const catalogGrantObj =
      catalogGrant && typeof catalogGrant === 'object'
        ? (catalogGrant as Record<string, unknown>)
        : null;

    return {
      catalogId: ids.catalogId ?? row?.catalogId ?? null,
      catalogName: row?.catalogName ?? graph.catalogName ?? null,
      businessId: ids.businessId,
      commerceManagerId: ids.commerceManagerId,
      commerceOnline: graph.commerceOnline,
      catalogOnline: graph.catalogOnline,
      catalogManagementGranted: catalogGrantObj?.catalogManagementGranted === true,
      catalogPermissionsStatus:
        typeof catalogGrantObj?.catalogPermissionsStatus === 'string'
          ? catalogGrantObj.catalogPermissionsStatus
          : null,
      catalogConnectedAt:
        typeof catalogGrantObj?.connectedAt === 'string' ? catalogGrantObj.connectedAt : null,
      productCount: graph.productCount,
      feedItemCount: exportedCount,
      lastSyncAt: row?.lastAutoSyncAt?.toISOString() ?? null,
      commerceManagerUrl: META_EXTERNAL_LINKS.commerceManager,
      catalogsUrl: META_EXTERNAL_LINKS.catalogs,
    };
  }

  async listCatalogProducts(take = 50) {
    const limit = Math.min(100, Math.max(1, take));
    const exports = await this.prisma.metaCatalogExportItem.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const propertyIds = exports.map((e) => e.propertyId);
    const properties = propertyIds.length
      ? await this.prisma.property.findMany({
          where: { id: { in: propertyIds } },
          select: {
            id: true,
            title: true,
            price: true,
            currency: true,
            city: true,
            mainImage: true,
            thumbnailUrl: true,
            facebookShareImageUrl: true,
          },
        })
      : [];
    const propMap = new Map(properties.map((p) => [p.id, p]));

    return {
      items: exports.map((e) => {
        const p = propMap.get(e.propertyId);
        const image =
          p?.facebookShareImageUrl ?? p?.mainImage ?? p?.thumbnailUrl ?? null;
        return {
          propertyId: e.propertyId,
          title: p?.title ?? e.propertyId,
          price: p?.price ?? null,
          currency: p?.currency ?? 'CZK',
          city: p?.city ?? null,
          image,
          availability: e.exportStatus === 'exported' ? 'in stock' : 'pending',
          exportStatus: e.exportStatus,
          lastExportedAt: e.lastExportedAt?.toISOString() ?? null,
          metaProductId: e.metaProductId,
          lastError: e.lastError,
        };
      }),
    };
  }

  async getAdAccountPanel() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    if (!ids.adAccountId) {
      return {
        connected: false,
        optional: true,
        message: META_AD_ACCOUNT_OPTIONAL_MESSAGE,
        adAccountId: null,
        name: null,
        currency: null,
        timezone: null,
      };
    }
    try {
      const token = await this.resolveToken();
      const actId = ids.adAccountId.replace(/^act_/, '');
      const res = await this.graph.get<{
        id?: string;
        name?: string;
        currency?: string;
        timezone_name?: string;
        account_status?: number;
      }>(`/act_${actId}`, token, {
        fields: 'id,name,currency,timezone_name,account_status',
      });
      if (!res.ok) {
        return {
          connected: false,
          optional: true,
          message: res.errorMessage,
          adAccountId: ids.adAccountId,
          name: row?.adAccountName ?? null,
          currency: null,
          timezone: null,
        };
      }
      return {
        connected: true,
        optional: false,
        message: null,
        adAccountId: ids.adAccountId,
        name: res.data.name ?? row?.adAccountName ?? null,
        currency: res.data.currency ?? null,
        timezone: res.data.timezone_name ?? null,
        accountStatus: res.data.account_status ?? null,
      };
    } catch (err) {
      return {
        connected: Boolean(ids.adAccountId),
        optional: true,
        message: err instanceof Error ? err.message : null,
        adAccountId: ids.adAccountId,
        name: row?.adAccountName ?? null,
        currency: null,
        timezone: null,
      };
    }
  }

  async connectExistingCatalog(catalogId: string) {
    const id = catalogId.trim();
    if (!id) return { ok: false, error: 'Catalog ID je prázdné.' };
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, catalogId: id },
      update: { catalogId: id },
    });
    return { ok: true, catalogId: id };
  }

  async createCatalogAsset() {
    return this.provision.createCatalog();
  }

  async syncCatalogFeed() {
    return this.catalogSync.runSync('delta');
  }
}
