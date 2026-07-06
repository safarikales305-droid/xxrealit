import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogService } from '../meta-catalog/meta-catalog.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService, type MetaGraphResult } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

type CatalogGraphFields = {
  id?: string;
  name?: string;
  vertical?: string;
  update_time?: string;
};

type GraphList<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
  summary?: { total_count?: number };
};

type CatalogProductRow = {
  id?: string;
  image_url?: string;
  additional_image_urls?: string[];
  video?: Array<{ url?: string }>;
};

type CommerceMerchantRow = {
  id?: string;
  display_name?: string;
  name?: string;
};

export type MetaCatalogGraphDiagnostics = {
  businessId: string | null;
  businessName: string | null;
  catalogId: string | null;
  catalogName: string | null;
  commerceManagerId: string | null;
  commerceManagerName: string | null;
  datasetId: string | null;
  commerceOnline: boolean;
  commerceMessage: string;
  catalogOnline: boolean;
  catalogMessage: string;
  productCount: number | null;
  lastCatalogUpdate: string | null;
  lastLocalSync: string | null;
  importErrorCount: number;
  metaImagesLoaded: number | null;
  metaVideoCount: number | null;
  graphCheckedAt: string;
  graphError: string | null;
  graphErrorJson: string | null;
};

@Injectable()
export class MetaCenterGraphDiagnosticsService {
  private readonly logger = new Logger(MetaCenterGraphDiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly catalog: MetaCatalogService,
  ) {}

  private formatGraphError(res: MetaGraphResult<unknown>): string {
    if (res.ok) return '';
    try {
      return JSON.stringify(
        res.data ?? {
          httpStatus: res.httpStatus,
          errorCode: res.errorCode,
          errorMessage: res.errorMessage,
        },
      );
    } catch {
      return res.errorMessage;
    }
  }

  private async resolveCatalogIdFromBusiness(
    businessId: string,
    accessToken: string,
    preferredCatalogId: string | null,
  ): Promise<{ catalogId: string | null; catalogName: string | null; error: string | null }> {
    const res = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
      `/${businessId}/owned_product_catalogs`,
      accessToken,
      { fields: 'id,name', limit: '50' },
    );
    if (!res.ok) {
      return { catalogId: null, catalogName: null, error: this.formatGraphError(res) };
    }
    const list = res.data.data ?? [];
    if (!list.length) {
      return { catalogId: null, catalogName: null, error: 'Business nemá žádný product catalog.' };
    }
    const picked =
      (preferredCatalogId
        ? list.find((row) => row.id === preferredCatalogId)
        : undefined) ?? list[0];
    return {
      catalogId: picked?.id ?? null,
      catalogName: picked?.name ?? null,
      error: null,
    };
  }

  private async fetchCommerceManager(
    businessId: string,
    accessToken: string,
  ): Promise<{ id: string | null; name: string | null; error: string | null }> {
    const res = await this.graph.get<GraphList<CommerceMerchantRow>>(
      `/${businessId}/commerce_merchant_settings`,
      accessToken,
      { fields: 'id,display_name', limit: '10' },
    );
    if (!res.ok) {
      return { id: null, name: null, error: this.formatGraphError(res) };
    }
    const row = res.data.data?.[0];
    if (!row?.id) {
      return { id: null, name: null, error: null };
    }
    return {
      id: row.id,
      name: row.display_name ?? row.name ?? 'Commerce Manager',
      error: null,
    };
  }

  private async fetchCatalogNode(
    catalogId: string,
    accessToken: string,
  ): Promise<{ ok: true; data: CatalogGraphFields } | { ok: false; error: string }> {
    const res = await this.graph.get<CatalogGraphFields>(`/${catalogId}`, accessToken, {
      fields: 'id,name,vertical,update_time',
    });
    if (!res.ok) {
      return { ok: false, error: this.formatGraphError(res) };
    }
    return { ok: true, data: res.data };
  }

  private async fetchProductStats(
    catalogId: string,
    accessToken: string,
  ): Promise<
    | { ok: true; productCount: number; imageCount: number; videoCount: number }
    | { ok: false; error: string }
  > {
    let productCount = 0;
    let imageCount = 0;
    let videoCount = 0;
    let after: string | undefined;
    let pages = 0;
    const maxPages = 50;

    do {
      const query: Record<string, string> = {
        fields: 'id,image_url,additional_image_urls,video',
        limit: '100',
      };
      if (after) query.after = after;
      if (pages === 0) query.summary = 'total_count';

      const res = await this.graph.get<GraphList<CatalogProductRow>>(
        `/${catalogId}/products`,
        accessToken,
        query,
      );

      if (!res.ok) {
        return { ok: false, error: this.formatGraphError(res) };
      }

      if (pages === 0 && res.data.summary?.total_count != null) {
        productCount = res.data.summary.total_count;
      }

      for (const product of res.data.data ?? []) {
        const hasImage =
          Boolean(product.image_url?.trim()) ||
          (product.additional_image_urls?.some((u) => Boolean(u?.trim())) ?? false);
        const hasVideo = (product.video?.length ?? 0) > 0;
        if (hasImage) imageCount++;
        if (hasVideo) videoCount++;
      }

      if (productCount === 0) {
        productCount += res.data.data?.length ?? 0;
      }

      after = res.data.paging?.cursors?.after;
      pages += 1;

      if (!after) break;
      if (productCount > 0 && pages * 100 >= productCount) break;
    } while (pages < maxPages);

    return { ok: true, productCount, imageCount, videoCount };
  }

  async buildCatalogDiagnostics(): Promise<MetaCatalogGraphDiagnostics> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const checkedAt = new Date().toISOString();

    const [lastSyncRun, exportErrors, catalogSettings, lastOkSync] = await Promise.all([
      this.prisma.metaCatalogSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.metaCatalogExportItem.count({
        where: { OR: [{ exportStatus: 'error' }, { lastError: { not: null } }] },
      }),
      this.prisma.metaCatalogSetting.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.metaCatalogSyncRun.findFirst({
        where: { result: { in: ['ok', 'partial'] } },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const base: MetaCatalogGraphDiagnostics = {
      businessId: ids.businessId,
      businessName: null,
      catalogId: ids.catalogId,
      catalogName: null,
      commerceManagerId: ids.commerceManagerId,
      commerceManagerName: null,
      datasetId: ids.datasetId,
      commerceOnline: false,
      commerceMessage: 'Meta účet není připojen — Graph API nedostupné.',
      catalogOnline: false,
      catalogMessage: 'Meta účet není připojen — Graph API nedostupné.',
      productCount: null,
      lastCatalogUpdate: null,
      lastLocalSync:
        lastSyncRun?.finishedAt?.toISOString() ??
        catalogSettings?.lastSyncAt?.toISOString() ??
        null,
      importErrorCount: exportErrors + (lastSyncRun?.errorCount ?? 0),
      metaImagesLoaded: null,
      metaVideoCount: null,
      graphCheckedAt: checkedAt,
      graphError: null,
      graphErrorJson: null,
    };

    if (!ids.businessId && !ids.catalogId) {
      base.commerceMessage = 'Chybí FACEBOOK_BUSINESS_ID a FACEBOOK_CATALOG_ID.';
      base.catalogMessage = 'Chybí FACEBOOK_CATALOG_ID (ENV nebo Meta Connect).';
      return base;
    }

    let accessToken: string;
    try {
      accessToken = await this.oauth.resolveAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chybí access token.';
      base.graphError = msg;
      return this.applyLocalFeedFallback(base, ids, catalogSettings);
    }

    let resolvedCatalogId = ids.catalogId;
    let resolvedCatalogName: string | null = null;

    if (ids.businessId) {
      const commerce = await this.fetchCommerceManager(ids.businessId, accessToken);
      if (commerce.error) {
        base.graphErrorJson = commerce.error;
        base.commerceMessage = commerce.error;
      } else if (commerce.id) {
        base.commerceManagerId = commerce.id;
        base.commerceManagerName = commerce.name;
        base.commerceOnline = true;
        base.commerceMessage = `✓ ${commerce.name} (${commerce.id})`;
      } else {
        base.commerceMessage = 'Commerce Manager v API nenalezen — ověřte business ID.';
      }

      if (!resolvedCatalogId) {
        const resolved = await this.resolveCatalogIdFromBusiness(
          ids.businessId,
          accessToken,
          ids.catalogId,
        );
        if (resolved.error) {
          base.graphErrorJson = resolved.error;
          base.catalogMessage = resolved.error;
          return base;
        }
        resolvedCatalogId = resolved.catalogId;
        resolvedCatalogName = resolved.catalogName;
        base.catalogId = resolvedCatalogId;
      } else {
        const owned = await this.resolveCatalogIdFromBusiness(
          ids.businessId,
          accessToken,
          resolvedCatalogId,
        );
        if (!owned.error && owned.catalogName) {
          resolvedCatalogName = owned.catalogName;
        }
        if (owned.error && !base.graphErrorJson) {
          base.graphErrorJson = owned.error;
        }
      }

      base.businessName = ids.businessId;
    } else {
      base.commerceMessage = 'Chybí FACEBOOK_BUSINESS_ID.';
    }

    if (!resolvedCatalogId) {
      base.catalogMessage = 'Chybí FACEBOOK_CATALOG_ID a API nevrátilo owned_product_catalogs.';
      return base;
    }

    const catalogNode = await this.fetchCatalogNode(resolvedCatalogId, accessToken);
    if (!catalogNode.ok) {
      base.graphErrorJson = catalogNode.error;
      base.catalogMessage = catalogNode.error;
      base.commerceOnline = false;
      if (ids.businessId) {
        base.commerceMessage = `${base.commerceMessage} · Catalog: ${catalogNode.error}`;
      }
      return base;
    }

    base.catalogOnline = true;
    base.catalogName = catalogNode.data.name ?? resolvedCatalogName ?? resolvedCatalogId;
    base.lastCatalogUpdate = catalogNode.data.update_time ?? null;

    const productStats = await this.fetchProductStats(resolvedCatalogId, accessToken);
    if (!productStats.ok) {
      base.graphErrorJson = productStats.error;
      base.catalogMessage = `${base.catalogName}: ${productStats.error}`;
      base.catalogOnline = false;
      return base;
    }

    base.productCount = productStats.productCount;
    base.metaImagesLoaded = productStats.imageCount;
    base.metaVideoCount = productStats.videoCount;

    base.catalogMessage =
      `✓ ${base.catalogName} · ${productStats.productCount} produktů · ` +
      `${productStats.imageCount} obrázků · ${productStats.videoCount} videí · ` +
      `Catalog ID ${resolvedCatalogId}`;

    if (ids.businessId) {
      base.commerceOnline = Boolean(base.commerceManagerId);
      if (base.commerceOnline) {
        base.commerceMessage =
          `✓ ${base.commerceManagerName ?? 'Commerce Manager'} · Business ID ${ids.businessId} · ` +
          `Catalog ID ${resolvedCatalogId}`;
      } else if (!base.graphErrorJson) {
        base.commerceMessage = `Business ID ${ids.businessId} · katalog OK, Commerce Manager nenalezen`;
      }
      base.businessName = base.businessName ?? ids.businessId;
    }

    if (ids.datasetId) {
      const dataset = await this.graph.get<{ id?: string; name?: string }>(
        `/${ids.datasetId}`,
        accessToken,
        { fields: 'id,name' },
      );
      if (!dataset.ok) {
        const errJson = this.formatGraphError(dataset);
        base.graphError = errJson;
        base.graphErrorJson = errJson;
      }
    }

    if (lastOkSync?.exportedCount != null && base.metaImagesLoaded === 0) {
      base.metaImagesLoaded = lastOkSync.exportedCount;
    }

    void this.logger.debug(
      `Catalog graph diagnostics: commerce=${base.commerceOnline} catalog=${base.catalogOnline} products=${base.productCount}`,
    );

    return base;
  }

  private async applyLocalFeedFallback(
    base: MetaCatalogGraphDiagnostics,
    ids: ReturnType<typeof resolveMetaCenterIds>,
    catalogSettings: { lastItemCount: number; enabled: boolean } | null,
  ): Promise<MetaCatalogGraphDiagnostics> {
    let itemCount = catalogSettings?.lastItemCount ?? 0;
    try {
      const stats = await this.catalog.computeFeedStats('csv');
      itemCount = stats.itemCount;
    } catch {
      // keep lastItemCount
    }

    if (ids.catalogId && catalogSettings?.enabled !== false && itemCount > 0) {
      base.catalogOnline = true;
      base.productCount = itemCount;
      base.catalogMessage = `Katalog ${ids.catalogId} — ${itemCount} položek ve feedu (bez Graph API tokenu)`;
    } else if (ids.catalogId) {
      base.catalogMessage =
        'FACEBOOK_CATALOG_ID nastaveno — Graph API token chybí, feed je prázdný nebo nebyl vygenerován.';
    } else {
      base.catalogMessage = 'Chybí FACEBOOK_CATALOG_ID (ENV nebo Meta Connect).';
    }

    if (ids.businessId && base.catalogOnline) {
      base.commerceOnline = true;
      base.commerceMessage = `Business ${ids.businessId} — pouze lokální feed (Graph API token chybí)`;
    } else if (ids.businessId) {
      base.commerceMessage = `FACEBOOK_BUSINESS_ID ${ids.businessId} — Graph API token chybí.`;
    } else {
      base.commerceMessage = 'Chybí FACEBOOK_BUSINESS_ID.';
    }

    return base;
  }

  async verifyCatalogViaGraph(catalogId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const res = await this.fetchCatalogNode(catalogId, token);
      if (!res.ok) return { ok: false, message: res.error };
      const stats = await this.fetchProductStats(catalogId, token);
      if (!stats.ok) return { ok: false, message: stats.error };
      return {
        ok: true,
        message: `✓ ${res.data.name ?? catalogId} · ${stats.productCount} produktů`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Graph API nedostupné' };
    }
  }

  async verifyCommerceViaGraph(
    businessId: string | null,
    catalogId: string | null,
  ): Promise<{ ok: boolean; message: string }> {
    if (!businessId) return { ok: false, message: 'Chybí FACEBOOK_BUSINESS_ID.' };
    try {
      const token = await this.oauth.resolveAccessToken();
      const commerce = await this.fetchCommerceManager(businessId, token);
      if (commerce.error) return { ok: false, message: commerce.error };

      let resolvedCatalogId = catalogId;
      if (!resolvedCatalogId) {
        const resolved = await this.resolveCatalogIdFromBusiness(businessId, token, null);
        if (resolved.error) return { ok: false, message: resolved.error };
        resolvedCatalogId = resolved.catalogId;
      }
      if (!resolvedCatalogId) {
        return { ok: false, message: 'Katalog nenalezen přes owned_product_catalogs.' };
      }

      const catalog = await this.fetchCatalogNode(resolvedCatalogId, token);
      if (!catalog.ok) return { ok: false, message: catalog.error };

      return {
        ok: true,
        message:
          `✓ Business ${businessId}` +
          (commerce.name ? ` · ${commerce.name}` : '') +
          ` · katalog ${catalog.data.name ?? resolvedCatalogId}`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Graph API nedostupné' };
    }
  }
}
