import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogSyncService } from '../meta-catalog/meta-catalog-sync.service';
import { META_AD_ACCOUNT_OPTIONAL_MESSAGE, resolveMetaCenterIds } from './meta-center-env.util';
import { META_CATALOG_VIA_BM_MESSAGE } from './meta-graph-permissions.util';
import {
  isAdvancedAccessGraphError,
  META_CATALOG_LIST_DASHBOARD_WARNING,
  META_CATALOG_LIST_FEED_INFO,
} from './meta-graph-permissions.util';
import { MetaCenterGraphDiagnosticsService } from './meta-center-graph-diagnostics.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { META_EXTERNAL_LINKS } from './meta-graph-permissions.util';
import { MetaGraphClientService } from './meta-graph-client.service';
import { MetaCenterApiLogService } from './meta-center-api-log.service';
import {
  metaListNotConfigured,
  metaListOk,
  metaPanelNotConfigured,
} from './meta-center-safe-response.util';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import { MetaMarketingDiagnosticsService } from './meta-marketing-diagnostics.service';

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
    private readonly marketingDiag: MetaMarketingDiagnosticsService,
    private readonly apiLog: MetaCenterApiLogService,
  ) {}

  private async getSettingRow() {
    return this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
  }

  private async resolveMarketingToken(): Promise<string> {
    return this.oauth.resolveMarketingAccessToken();
  }

  private async resolveToken(): Promise<string> {
    return this.oauth.resolveAccessToken();
  }

  private async tryResolveMarketingToken(): Promise<string | null> {
    return this.oauth.tryResolveMarketingAccessToken();
  }

  private marketingTokenErrorMessage(row: Awaited<ReturnType<typeof this.getSettingRow>>): string {
    if (!row?.marketingAccessTokenEncrypted) {
      return 'Reklamní účet není připojený nebo token nemá ads_read/ads_management.';
    }
    if (!isMarketingAdsTokenActive(row)) {
      return 'Reklamní účet není připojený nebo token nemá ads_read/ads_management.';
    }
    return 'Reklamní účet není připojený nebo token nemá ads_read/ads_management.';
  }

  async listCatalogs() {
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeCatalogId = ids.catalogId ?? row?.catalogId ?? null;

    const storedCatalogItem = activeCatalogId
      ? {
          id: activeCatalogId,
          name: row?.catalogName ?? activeCatalogId,
          isActive: true,
          productCount: null as number | null,
        }
      : null;

    const storedListResponse = (
      extra?: Record<string, unknown>,
    ) =>
      storedCatalogItem
        ? metaListOk([storedCatalogItem], {
            activeCatalogId,
            scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
            ...extra,
          })
        : null;

    if (activeCatalogId) {
      return storedListResponse({
        listStatus: 'from_config',
        listUnavailable: false,
        catalogListInfo: META_CATALOG_LIST_FEED_INFO,
        message: null,
      })!;
    }

    if (!ids.businessId) {
      return metaListNotConfigured(
        'Chybí Business Manager ID — nejdřív připojte Commerce / Catalog OAuth.',
        { activeCatalogId, scopeInfo: META_CATALOG_VIA_BM_MESSAGE },
      );
    }

    const catalogListEndpoint = `/${ids.businessId}/owned_product_catalogs`;
    const catalogListQuery = { fields: 'id,name,product_count', limit: '50' };

    try {
      const token = await this.resolveToken().catch(() => null);
      if (!token) {
        return metaListNotConfigured('Chybí Meta access token pro načtení katalogů.', {
          activeCatalogId,
          scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        });
      }

      const tokenDebug = await this.oauth.debugToken(token).catch(() => ({
        scopes: [] as string[],
      }));
      const scopes = tokenDebug.scopes ?? [];

      const started = Date.now();
      const res = await this.graph.get<
        GraphList<{ id?: string; name?: string; product_count?: number }>
      >(catalogListEndpoint, token, catalogListQuery);

      await this.apiLog.logCatalogGraphCall({
        endpoint: catalogListEndpoint,
        query: catalogListQuery,
        scopes,
        response: res.ok ? res.data : res.data,
        httpStatus: res.httpStatus,
        errorMessage: res.ok ? null : res.errorMessage,
        durationMs: Date.now() - started,
      });

      if (!res.ok && isAdvancedAccessGraphError(res)) {
        return metaListOk([], {
          activeCatalogId,
          scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
          listStatus: 'graph_unavailable',
          listUnavailable: true,
          warning: META_CATALOG_LIST_DASHBOARD_WARNING,
          graphError: res.data,
        });
      }

      const items = (res.ok ? res.data.data ?? [] : []).map((c) => ({
        id: c.id ?? '',
        name: c.name ?? c.id ?? 'Katalog',
        isActive: c.id === activeCatalogId,
        productCount: c.product_count ?? null,
      }));
      const filtered = items.filter((i) => i.id);

      if (!res.ok) {
        return metaListOk(filtered, {
          activeCatalogId,
          scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
          listStatus: 'error',
          listUnavailable: true,
          warning: res.errorMessage,
          graphError: res.data,
        });
      }

      return metaListOk(filtered, {
        activeCatalogId,
        scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        listStatus: 'ok',
        listUnavailable: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nelze načíst katalogy z Graph API.';
      return metaListOk([], {
        activeCatalogId,
        scopeInfo: META_CATALOG_VIA_BM_MESSAGE,
        listStatus: 'graph_unavailable',
        listUnavailable: true,
        warning: msg,
      });
    }
  }

  async listAdAccounts(adminUserId?: string) {
    await this.marketingDiag.logMarketingAppSnapshot(adminUserId, 'ad-accounts');
    const row = await this.getSettingRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeAdAccountId = ids.adAccountId ?? row?.adAccountId ?? null;
    const tokenMsg = this.marketingTokenErrorMessage(row);

    if (!isMarketingAdsTokenActive(row ?? {})) {
      return metaListNotConfigured(tokenMsg, { activeAdAccountId });
    }

    if (!ids.businessId) {
      return metaListNotConfigured(
        'Chybí Business Manager ID — nejdřív připojte Marketing OAuth.',
        { activeAdAccountId },
      );
    }

    try {
      const token = await this.tryResolveMarketingToken();
      if (!token) {
        return metaListNotConfigured(tokenMsg, { activeAdAccountId });
      }
      const res = await this.marketingDiag.graphGetWithMarketingLog<
        GraphList<{ id?: string; name?: string; currency?: string; account_id?: string }>
      >(adminUserId, 'ad-accounts', `/${ids.businessId}/owned_ad_accounts`, token, {
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
      const filtered = items.filter((i) => i.id);
      if (!res.ok) {
        return {
          ...metaListNotConfigured(res.errorMessage || tokenMsg, {
            activeAdAccountId,
            graphError: res.data,
          }),
          items: filtered,
          status: filtered.length ? ('ok' as const) : ('error' as const),
          ok: filtered.length > 0,
        };
      }
      return metaListOk(filtered, { activeAdAccountId });
    } catch (err) {
      return metaListNotConfigured(
        err instanceof Error ? err.message : 'Nelze načíst reklamní účty.',
        { activeAdAccountId },
      );
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
    const row = await this.getSettingRow().catch(() => null);
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const activeDatasetId = ids.datasetId ?? row?.datasetId ?? null;

    if (!activeDatasetId && !process.env.META_DATASET_ID?.trim()) {
      return metaListNotConfigured('Dataset není vybraný.', {
        activeDatasetId: null,
        businessId: ids.businessId ?? row?.businessManagerId ?? null,
        canSelect: Boolean(ids.businessId ?? row?.businessManagerId),
      });
    }

    const businessId = await this.resolveBusinessIdForAssets(row).catch(() => null);
    if (!businessId) {
      return metaListNotConfigured(
        'Chybí Business Manager ID — nejdřív připojte Commerce / Catalog OAuth.',
        { activeDatasetId, businessId: null, canSelect: false },
      );
    }
    try {
      const token = await this.resolveToken().catch(() => null);
      if (!token) {
        return metaListNotConfigured('Chybí Meta access token pro načtení datasetů.', {
          activeDatasetId,
          businessId,
          canSelect: true,
        });
      }
      const rows = await this.fetchDatasetRows(businessId, token);
      const items = rows
        .filter((i) => i.id)
        .map((p) => ({
          ...p,
          isActive: p.id === activeDatasetId,
        }));
      if (!items.length && activeDatasetId) {
        return metaListOk(
          [
            {
              id: activeDatasetId,
              name: row?.pixelName ?? activeDatasetId,
              isActive: true,
              lastFiredTime: null,
              sourceApp: null,
            },
          ],
          {
            activeDatasetId,
            businessId,
            canSelect: true,
            warning: 'Dataset z konfigurace — Graph API nevrátilo žádné datasety.',
          },
        );
      }
      return metaListOk(items, {
        activeDatasetId,
        businessId,
        canSelect: true,
        ...(items.length
          ? {}
          : {
              ok: false as const,
              status: 'not_configured' as const,
              message: 'Dataset není vybraný.',
            }),
      });
    } catch (err) {
      if (activeDatasetId) {
        return metaListOk(
          [
            {
              id: activeDatasetId,
              name: row?.pixelName ?? activeDatasetId,
              isActive: true,
              lastFiredTime: null,
              sourceApp: null,
            },
          ],
          {
            activeDatasetId,
            businessId,
            canSelect: true,
            warning: err instanceof Error ? err.message : 'Nelze načíst datasety.',
          },
        );
      }
      return metaListNotConfigured(
        err instanceof Error ? err.message : 'Nelze načíst datasety.',
        { activeDatasetId, businessId, canSelect: true },
      );
    }
  }

  async selectDataset(datasetId: string) {
    const id = datasetId.trim();
    if (!id) return { ok: false, error: 'Dataset ID je prázdné.' };
    const list = await this.listDatasets().catch(() => null);
    const items =
      list && Array.isArray(list.items)
        ? (list.items as Array<{ id: string; name?: string | null }>)
        : [];
    const match = items.find((i) => i.id === id);
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
    try {
      const row = await this.getSettingRow();
      const ids = resolveMetaCenterIds(row ?? ({} as never));
      const graph = await this.graphDiag.buildCatalogDiagnostics().catch(() => null);
      const exportedCount = await this.prisma.metaCatalogExportItem
        .count({ where: { exportStatus: 'exported' } })
        .catch(() => 0);
      const grantsSnap = row?.diagnosticsSnapshot as Record<string, unknown> | null;
      const catalogGrant =
        grantsSnap?.oauthFlowGrants &&
        typeof grantsSnap.oauthFlowGrants === 'object' &&
        (grantsSnap.oauthFlowGrants as Record<string, unknown>).catalog;
      const catalogGrantObj =
        catalogGrant && typeof catalogGrant === 'object'
          ? (catalogGrant as Record<string, unknown>)
          : null;

      const pendingCount = await this.prisma.metaCatalogExportItem.count().catch(() => 0);
      const errorCount = await this.prisma.metaCatalogExportItem
        .count({
          where: { OR: [{ exportStatus: 'error' }, { lastError: { not: null } }] },
        })
        .catch(() => 0);

      const catalogId = ids.catalogId ?? row?.catalogId ?? graph?.catalogId ?? null;
      const catalogOnline = graph?.catalogOnline || Boolean(catalogId);

      return {
        ok: true as const,
        status: 'ok' as const,
        message: null,
        catalogId,
        catalogName: row?.catalogName ?? graph?.catalogName ?? null,
        businessId: ids.businessId ?? graph?.businessId ?? null,
        commerceManagerId: ids.commerceManagerId,
        commerceOnline: graph?.commerceOnline ?? false,
        catalogOnline,
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
        productCount: graph?.productCount ?? null,
        feedItemCount: exportedCount,
        exportErrorCount: errorCount,
        exportPendingCount: pendingCount,
        lastSyncAt: row?.lastAutoSyncAt?.toISOString() ?? graph?.lastLocalSync ?? null,
        commerceManagerUrl: META_EXTERNAL_LINKS.commerceManager,
        catalogsUrl: META_EXTERNAL_LINKS.catalogs,
        warning: graph?.graphError ?? null,
        graphError: graph?.graphErrorJson ?? null,
      };
    } catch (err) {
      const row = await this.getSettingRow().catch(() => null);
      const ids = resolveMetaCenterIds(row ?? ({} as never));
      return {
        ...metaPanelNotConfigured(
          err instanceof Error ? err.message : 'Nelze načíst panel katalogu.',
          {
            catalogId: ids.catalogId ?? row?.catalogId ?? null,
            catalogName: row?.catalogName ?? null,
            businessId: ids.businessId ?? null,
            commerceManagerId: ids.commerceManagerId ?? null,
            commerceOnline: false,
            catalogOnline: Boolean(ids.catalogId ?? row?.catalogId),
            catalogPermissionsStatus: null,
            catalogConnectedAt: null,
            productCount: null,
            feedItemCount: null,
            exportErrorCount: null,
            exportPendingCount: null,
            lastSyncAt: row?.lastAutoSyncAt?.toISOString() ?? null,
            commerceManagerUrl: META_EXTERNAL_LINKS.commerceManager,
            catalogsUrl: META_EXTERNAL_LINKS.catalogs,
          },
        ),
      };
    }
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

  async getAdAccountPanel(adminUserId?: string) {
    await this.marketingDiag.logMarketingAppSnapshot(adminUserId, 'ad-account');
    const row = await this.getSettingRow().catch(() => null);
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const tokenMsg = this.marketingTokenErrorMessage(row);

    if (!ids.adAccountId) {
      return {
        ok: false as const,
        status: 'not_configured' as const,
        message: META_AD_ACCOUNT_OPTIONAL_MESSAGE,
        connected: false,
        optional: true,
        adAccountId: null,
        name: null,
        currency: null,
        timezone: null,
        error: { message: META_AD_ACCOUNT_OPTIONAL_MESSAGE, type: 'not_configured', code: null, endpoint: '' },
      };
    }

    if (!isMarketingAdsTokenActive(row ?? {})) {
      return {
        ok: false as const,
        status: 'not_configured' as const,
        message: tokenMsg,
        connected: false,
        optional: true,
        adAccountId: ids.adAccountId,
        name: row?.adAccountName ?? null,
        currency: null,
        timezone: null,
        error: { message: tokenMsg, type: 'permission_denied', code: null, endpoint: '' },
      };
    }

    try {
      const token = await this.tryResolveMarketingToken();
      if (!token) {
        return {
          ok: false as const,
          status: 'not_configured' as const,
          message: tokenMsg,
          connected: false,
          optional: true,
          adAccountId: ids.adAccountId,
          name: row?.adAccountName ?? null,
          currency: null,
          timezone: null,
          error: { message: tokenMsg, type: 'not_configured', code: null, endpoint: '' },
        };
      }
      const actId = ids.adAccountId.replace(/^act_/, '');
      const res = await this.marketingDiag.graphGetWithMarketingLog<{
        id?: string;
        name?: string;
        currency?: string;
        timezone_name?: string;
        account_status?: number;
      }>(adminUserId, 'ad-account', `/act_${actId}`, token, {
        fields: 'id,name,currency,timezone_name,account_status',
      });
      if (!res.ok) {
        return {
          ok: false as const,
          status: 'error' as const,
          message: res.errorMessage,
          connected: false,
          optional: true,
          adAccountId: ids.adAccountId,
          name: row?.adAccountName ?? null,
          currency: null,
          timezone: null,
          error: {
            code: res.errorCode != null ? String(res.errorCode) : null,
            message: res.errorMessage,
            type: 'graph_api',
            endpoint: `/act_${actId}`,
          },
          graphError: res.data,
        };
      }
      return {
        ok: true as const,
        status: 'ok' as const,
        message: null,
        connected: true,
        optional: false,
        adAccountId: ids.adAccountId,
        name: res.data.name ?? row?.adAccountName ?? null,
        currency: res.data.currency ?? null,
        timezone: res.data.timezone_name ?? null,
        accountStatus: res.data.account_status ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nelze ověřit reklamní účet.';
      return {
        ok: false as const,
        status: 'not_configured' as const,
        message: msg,
        connected: false,
        optional: true,
        adAccountId: ids.adAccountId,
        name: row?.adAccountName ?? null,
        currency: null,
        timezone: null,
        error: { message: msg, type: 'internal', code: null, endpoint: '' },
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
