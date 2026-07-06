import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogSyncService } from '../meta-catalog/meta-catalog-sync.service';
import { META_AD_ACCOUNT_OPTIONAL_MESSAGE, resolveMetaCenterIds } from './meta-center-env.util';
import { META_CATALOG_VIA_BM_MESSAGE } from './meta-graph-permissions.util';
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

  async listCatalogs() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeCatalogId = ids.catalogId;
    if (!ids.businessId) {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          isActive: boolean;
          productCount: number | null;
        }>,
        activeCatalogId,
        scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        error: 'Chybí Business Manager ID — nejdřív připojte Commerce / Catalog OAuth.',
      };
    }
    try {
      const token = await this.resolveToken();
      const res = await this.graph.get<
        GraphList<{ id?: string; name?: string; product_count?: number }>
      >(`/${ids.businessId}/owned_product_catalogs`, token, {
        fields: 'id,name,product_count',
        limit: '50',
      });
      const items = (res.ok ? res.data.data ?? [] : []).map((c) => ({
        id: c.id ?? '',
        name: c.name ?? c.id ?? 'Katalog',
        isActive: c.id === activeCatalogId,
        productCount: c.product_count ?? null,
      }));
      return {
        items: items.filter((i) => i.id),
        activeCatalogId,
        scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        error: res.ok ? null : res.errorMessage,
      };
    } catch (err) {
      return {
        items: [],
        activeCatalogId,
        scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        error: err instanceof Error ? err.message : 'Nelze načíst katalogy.',
      };
    }
  }

  async listAdAccounts() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeAdAccountId = ids.adAccountId;
    if (!ids.businessId) {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          isActive: boolean;
          currency: string | null;
        }>,
        activeAdAccountId,
        error: 'Chybí Business Manager ID.',
      };
    }
    try {
      const token = await this.resolveToken();
      const res = await this.graph.get<
        GraphList<{ id?: string; name?: string; currency?: string; account_id?: string }>
      >(`/${ids.businessId}/owned_ad_accounts`, token, {
        fields: 'id,name,currency,account_id',
        limit: '50',
      });
      const items = (res.ok ? res.data.data ?? [] : []).map((a) => {
        const rawId = a.account_id ?? a.id ?? '';
        const normalized = rawId.startsWith('act_') ? rawId : rawId ? `act_${rawId}` : '';
        return {
          id: normalized,
          name: a.name ?? normalized,
          isActive: normalized === activeAdAccountId || rawId === activeAdAccountId,
          currency: a.currency ?? null,
        };
      });
      return {
        items: items.filter((i) => i.id),
        activeAdAccountId,
        error: res.ok ? null : res.errorMessage,
      };
    } catch (err) {
      return {
        items: [],
        activeAdAccountId,
        error: err instanceof Error ? err.message : 'Nelze načíst reklamní účty.',
      };
    }
  }

  async selectAdAccount(adAccountId: string) {
    const raw = adAccountId.trim();
    if (!raw) return { ok: false, error: 'Ad Account ID je prázdné.' };
    const id = raw.startsWith('act_') ? raw : `act_${raw}`;
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, adAccountId: id },
      update: { adAccountId: id },
    });
    return { ok: true, adAccountId: id };
  }

  private async resolveBusinessIdForAssets(
    row: Awaited<ReturnType<typeof this.getSettingRow>>,
  ): Promise<string | null> {
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    if (ids.businessId) return ids.businessId;
    try {
      const token = await this.resolveToken();
      const res = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
        '/me/businesses',
        token,
        { fields: 'id,name', limit: '5' },
      );
      const business = res.ok ? res.data.data?.[0] : null;
      if (!business?.id) return null;
      await this.prisma.metaCenterSetting.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, businessManagerId: business.id },
        update: { businessManagerId: business.id },
      });
      return business.id;
    } catch {
      return null;
    }
  }

  private async fetchDatasetRows(
    businessId: string,
    token: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      lastFiredTime: string | null;
      sourceApp: string | null;
    }>
  > {
    type PixelRow = {
      id?: string;
      name?: string;
      last_fired_time?: string;
      owner_business?: { id?: string; name?: string };
    };
    const endpoints = [
      `/${businessId}/adspixels`,
      `/${businessId}/owned_pixels`,
      '/me/adspixels',
    ];
    const merged = new Map<string, PixelRow>();
    for (const endpoint of endpoints) {
      const res = await this.graph.get<GraphList<PixelRow>>(endpoint, token, {
        fields: 'id,name,last_fired_time,owner_business',
        limit: '50',
      });
      if (!res.ok) continue;
      for (const pixel of res.data.data ?? []) {
        if (pixel.id) merged.set(pixel.id, pixel);
      }
    }
    return [...merged.values()].map((p) => ({
      id: p.id ?? '',
      name: p.name ?? p.id ?? 'Dataset',
      lastFiredTime: p.last_fired_time ?? null,
      sourceApp: p.owner_business?.name ?? null,
    }));
  }

  async listDatasets() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeDatasetId = ids.datasetId;
    const businessId = await this.resolveBusinessIdForAssets(row);
    if (!businessId) {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          isActive: boolean;
          lastFiredTime: string | null;
          sourceApp: string | null;
        }>,
        activeDatasetId,
        businessId: null,
        canSelect: false,
        error: 'Chybí Business Manager ID — nejdřív připojte Commerce / Catalog OAuth.',
      };
    }
    try {
      const token = await this.resolveToken();
      const rows = await this.fetchDatasetRows(businessId, token);
      const items = rows
        .filter((i) => i.id)
        .map((p) => ({
          ...p,
          isActive: p.id === activeDatasetId,
        }));
      return {
        items,
        activeDatasetId,
        businessId,
        canSelect: true,
        error: items.length ? null : 'V Business Manageru nebyl nalezen žádný Dataset / Pixel.',
      };
    } catch (err) {
      return {
        items: [],
        activeDatasetId,
        businessId,
        canSelect: true,
        error: err instanceof Error ? err.message : 'Nelze načíst datasety.',
      };
    }
  }

  async selectDataset(datasetId: string) {
    const id = datasetId.trim();
    if (!id) return { ok: false, error: 'Dataset ID je prázdné.' };
    const list = await this.listDatasets().catch(() => null);
    const match = list?.items.find((i) => i.id === id);
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        datasetId: id,
        pixelName: match?.name ?? null,
      },
      update: {
        datasetId: id,
        ...(match?.name ? { pixelName: match.name } : {}),
      },
    });
    await this.prisma.metaCenterEventLog.create({
      data: {
        eventType: 'dataset_selected',
        source: 'meta_connect',
        result: 'ok',
        status: 'saved',
        request: { datasetId: id, name: match?.name ?? null },
        response: { savedTo: 'metaCenterSetting.datasetId' },
      },
    });
    return { ok: true, datasetId: id, name: match?.name ?? null };
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

    const pendingCount = await this.prisma.metaCatalogExportItem.count();
    const errorCount = await this.prisma.metaCatalogExportItem.count({
      where: { OR: [{ exportStatus: 'error' }, { lastError: { not: null } }] },
    });

    return {
      catalogId: ids.catalogId ?? row?.catalogId ?? null,
      catalogName: row?.catalogName ?? graph.catalogName ?? null,
      businessId: ids.businessId,
      commerceManagerId: ids.commerceManagerId,
      commerceOnline: graph.commerceOnline,
      catalogOnline: graph.catalogOnline || Boolean(ids.catalogId),
      businessManagementGranted:
        catalogGrantObj?.catalogPermissionsStatus === 'not_required' ||
        catalogGrantObj?.catalogPermissionsStatus === 'granted' ||
        (Array.isArray(catalogGrantObj?.grantedScopes) &&
          (catalogGrantObj.grantedScopes as string[]).includes('business_management')),
      catalogScopeInfo: META_CATALOG_VIA_BM_MESSAGE,
      catalogPermissionsStatus:
        typeof catalogGrantObj?.catalogPermissionsStatus === 'string'
          ? catalogGrantObj.catalogPermissionsStatus
          : null,
      catalogConnectedAt:
        typeof catalogGrantObj?.connectedAt === 'string' ? catalogGrantObj.connectedAt : null,
      productCount: graph.productCount,
      feedItemCount: exportedCount,
      exportErrorCount: errorCount,
      exportPendingCount: pendingCount,
      lastSyncAt: row?.lastAutoSyncAt?.toISOString() ?? graph.lastLocalSync ?? null,
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
            propertyType: true,
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
          propertyType: p?.propertyType ?? null,
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
