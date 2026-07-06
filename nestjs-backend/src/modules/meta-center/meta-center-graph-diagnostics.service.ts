import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

type CatalogGraphFields = {
  id?: string;
  name?: string;
  product_count?: number;
  vertical?: string;
  update_time?: string;
};

type ProductFeedRow = {
  id?: string;
  name?: string;
  latest_upload?: { end_time?: string; num_success?: number; num_error?: number };
  product_count?: number;
};

type GraphList<T> = { data?: T[] };

export type MetaCatalogGraphDiagnostics = {
  businessId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  commerceOnline: boolean;
  commerceMessage: string;
  catalogOnline: boolean;
  catalogMessage: string;
  catalogName: string | null;
  productCount: number | null;
  lastCatalogUpdate: string | null;
  lastLocalSync: string | null;
  importErrorCount: number;
  metaImagesLoaded: number | null;
  graphCheckedAt: string;
  graphError: string | null;
};

@Injectable()
export class MetaCenterGraphDiagnosticsService {
  private readonly logger = new Logger(MetaCenterGraphDiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

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
      catalogId: ids.catalogId,
      datasetId: ids.datasetId,
      commerceOnline: false,
      commerceMessage: 'Meta účet není připojen — Graph API nedostupné.',
      catalogOnline: false,
      catalogMessage: 'Meta účet není připojen — Graph API nedostupné.',
      catalogName: null,
      productCount: null,
      lastCatalogUpdate: null,
      lastLocalSync:
        lastSyncRun?.finishedAt?.toISOString() ??
        catalogSettings?.lastSyncAt?.toISOString() ??
        null,
      importErrorCount: exportErrors + (lastSyncRun?.errorCount ?? 0),
      metaImagesLoaded: null,
      graphCheckedAt: checkedAt,
      graphError: null,
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
      base.commerceMessage = msg;
      base.catalogMessage = msg;
      return base;
    }

    if (ids.businessId) {
      const business = await this.graph.get<{ id?: string; name?: string }>(
        `/${ids.businessId}`,
        accessToken,
        { fields: 'id,name' },
      );
      if (!business.ok) {
        base.commerceMessage = business.errorMessage;
      } else {
        base.commerceMessage = `Business Manager: ${business.data.name ?? business.data.id}`;
        base.commerceOnline = true;
      }
    } else {
      base.commerceMessage = 'Chybí FACEBOOK_BUSINESS_ID.';
    }

    if (!ids.catalogId) {
      base.catalogMessage = 'Chybí FACEBOOK_CATALOG_ID.';
      return base;
    }

    const catalog = await this.graph.get<CatalogGraphFields>(
      `/${ids.catalogId}`,
      accessToken,
      { fields: 'id,name,product_count,vertical,update_time' },
    );

    if (!catalog.ok) {
      base.catalogMessage = catalog.errorMessage;
      base.commerceOnline = false;
      base.commerceMessage = ids.businessId
        ? `${base.commerceMessage} · Katalog: ${catalog.errorMessage}`
        : catalog.errorMessage;
      return base;
    }

    base.catalogOnline = true;
    base.catalogName = catalog.data.name ?? ids.catalogId;
    base.productCount =
      typeof catalog.data.product_count === 'number' ? catalog.data.product_count : null;
    base.lastCatalogUpdate = catalog.data.update_time ?? null;
    base.catalogMessage = `Online — ${base.catalogName}${
      base.productCount != null ? ` (${base.productCount} produktů)` : ''
    }`;

    if (ids.businessId) {
      base.commerceOnline = true;
      base.commerceMessage = `Online — Business ${ids.businessId}, katalog ${base.catalogName}`;
    }

    const feeds = await this.graph.get<GraphList<ProductFeedRow>>(
      `/${ids.catalogId}/product_feeds`,
      accessToken,
      { fields: 'id,name,latest_upload,product_count' },
    );

    if (feeds.ok && feeds.data.data?.length) {
      let imagesLoaded = 0;
      let feedErrors = 0;
      for (const feed of feeds.data.data) {
        const upload = feed.latest_upload;
        if (upload?.num_success != null) imagesLoaded += upload.num_success;
        if (upload?.num_error != null) feedErrors += upload.num_error;
      }
      if (imagesLoaded > 0) base.metaImagesLoaded = imagesLoaded;
      if (feedErrors > 0) base.importErrorCount += feedErrors;
      const latestEnd = feeds.data.data
        .map((f) => f.latest_upload?.end_time)
        .filter(Boolean)
        .sort()
        .pop();
      if (latestEnd) base.lastCatalogUpdate = latestEnd;
    } else if (base.productCount != null) {
      base.metaImagesLoaded = base.productCount;
    }

    if (ids.datasetId) {
      const dataset = await this.graph.get<{ id?: string; name?: string }>(
        `/${ids.datasetId}`,
        accessToken,
        { fields: 'id,name' },
      );
      if (!dataset.ok) {
        base.graphError = dataset.errorMessage;
      }
    }

    if (lastOkSync?.exportedCount != null && base.metaImagesLoaded == null) {
      base.metaImagesLoaded = lastOkSync.exportedCount;
    }

    void this.logger.debug(
      `Catalog graph diagnostics: commerce=${base.commerceOnline} catalog=${base.catalogOnline} products=${base.productCount}`,
    );

    return base;
  }

  async verifyCatalogViaGraph(catalogId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const res = await this.graph.get<CatalogGraphFields>(
        `/${catalogId}`,
        token,
        { fields: 'id,name,product_count' },
      );
      if (!res.ok) return { ok: false, message: res.errorMessage };
      return {
        ok: true,
        message: `${res.data.name ?? catalogId} (${res.data.product_count ?? '?'} produktů)`,
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
    if (!catalogId) return { ok: false, message: 'Chybí FACEBOOK_CATALOG_ID.' };
    try {
      const token = await this.oauth.resolveAccessToken();
      const business = await this.graph.get<{ id?: string; name?: string }>(
        `/${businessId}`,
        token,
        { fields: 'id,name' },
      );
      if (!business.ok) return { ok: false, message: business.errorMessage };
      const catalog = await this.graph.get<CatalogGraphFields>(
        `/${catalogId}`,
        token,
        { fields: 'id,name,product_count' },
      );
      if (!catalog.ok) return { ok: false, message: catalog.errorMessage };
      return {
        ok: true,
        message: `Business ${business.data.name ?? businessId} · katalog ${catalog.data.name ?? catalogId}`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Graph API nedostupné' };
    }
  }
}
