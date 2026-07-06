import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService, type MetaGraphResult } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

const SCOPE_BUSINESS_MANAGEMENT = 'business_management';
const SCOPE_CATALOG_MANAGEMENT = 'catalog_management';

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
  commercePermissionStatus: string | null;
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
  ) {}

  private hasScope(scopes: string[], scope: string): boolean {
    return scopes.includes(scope);
  }

  private buildPermissionStatus(scopes: string[]): string {
    const business = this.hasScope(scopes, SCOPE_BUSINESS_MANAGEMENT) ? '✓' : '✗';
    const catalog = this.hasScope(scopes, SCOPE_CATALOG_MANAGEMENT) ? '✓' : '✗';
    return `business_management ${business}, catalog_management ${catalog}`;
  }

  private missingPermissionMessage(endpoint: string, scopes: string[]): string {
    const missing: string[] = [];
    if (!this.hasScope(scopes, SCOPE_BUSINESS_MANAGEMENT)) {
      missing.push(SCOPE_BUSINESS_MANAGEMENT);
    }
    if (!this.hasScope(scopes, SCOPE_CATALOG_MANAGEMENT)) {
      missing.push(SCOPE_CATALOG_MANAGEMENT);
    }
    if (missing.length === 0) {
      return `Chybí oprávnění catalog_management nebo business_management. Endpoint: GET ${endpoint}`;
    }
    return `Chybí oprávnění: ${missing.join(', ')}. Endpoint: GET ${endpoint}`;
  }

  private formatGraphError(res: MetaGraphResult<unknown>, endpoint: string, scopes: string[]): string {
    if (res.ok) return '';
    const err = (
      res.data as {
        error?: {
          message?: string;
          code?: number;
          type?: string;
          error_subcode?: number;
          fbtrace_id?: string;
        };
      } | null
    )?.error;
    const errType = err?.type ?? '';
    const errCode = err?.code;
    const errMsg = err?.message ?? res.errorMessage;

    const isPermissionError =
      errCode === 200 ||
      errCode === 10 ||
      errType === 'OAuthException' ||
      errType === 'GraphMethodException' ||
      /permission|not authorized|does not have/i.test(errMsg);

    if (isPermissionError) {
      return `${this.missingPermissionMessage(endpoint, scopes)} (${errType || 'GraphAPI'}${errCode != null ? ` #${errCode}` : ''}: ${errMsg})`;
    }

    try {
      return JSON.stringify({
        endpoint: `GET ${endpoint}`,
        type: errType || null,
        code: errCode ?? null,
        message: errMsg,
        subcode: err?.error_subcode ?? null,
        fbtrace_id: err?.fbtrace_id ?? null,
        raw: res.data,
      });
    } catch {
      return `${errType || 'GraphAPI'} @ GET ${endpoint}: ${errMsg}`;
    }
  }

  private async resolveBusinessId(
    businessId: string | null,
    accessToken: string,
    scopes: string[],
  ): Promise<{ businessId: string | null; businessName: string | null; error: string | null }> {
    if (businessId) {
      return { businessId, businessName: null, error: null };
    }
    if (!this.hasScope(scopes, SCOPE_BUSINESS_MANAGEMENT)) {
      return {
        businessId: null,
        businessName: null,
        error: this.missingPermissionMessage('/me/businesses', scopes),
      };
    }
    const res = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
      '/me/businesses',
      accessToken,
      { fields: 'id,name', limit: '1' },
    );
    if (!res.ok) {
      return {
        businessId: null,
        businessName: null,
        error: this.formatGraphError(res, '/me/businesses', scopes),
      };
    }
    const row = res.data.data?.[0];
    return {
      businessId: row?.id ?? null,
      businessName: row?.name ?? null,
      error: row?.id ? null : 'Business Manager nenalezen v /me/businesses.',
    };
  }

  private async fetchOwnedProductCatalogs(
    businessId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<{
    catalogId: string | null;
    catalogName: string | null;
    error: string | null;
  }> {
    const endpoint = `/${businessId}/owned_product_catalogs`;
    if (
      !this.hasScope(scopes, SCOPE_BUSINESS_MANAGEMENT) ||
      !this.hasScope(scopes, SCOPE_CATALOG_MANAGEMENT)
    ) {
      return {
        catalogId: null,
        catalogName: null,
        error: this.missingPermissionMessage(endpoint, scopes),
      };
    }

    const res = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
      endpoint,
      accessToken,
      { fields: 'id,name', limit: '50' },
    );
    if (!res.ok) {
      return {
        catalogId: null,
        catalogName: null,
        error: this.formatGraphError(res, endpoint, scopes),
      };
    }
    const list = res.data.data ?? [];
    if (!list.length) {
      return {
        catalogId: null,
        catalogName: null,
        error: `GET ${endpoint} — business nemá žádný product catalog.`,
      };
    }
    const first = list[0];
    return {
      catalogId: first?.id ?? null,
      catalogName: first?.name ?? null,
      error: null,
    };
  }

  private async persistDiscoveredCatalog(catalogId: string, catalogName: string | null) {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.catalogId?.trim() === catalogId) return;
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        catalogId,
        catalogName,
      },
      update: {
        catalogId,
        ...(catalogName ? { catalogName } : {}),
      },
    });
    this.logger.log(`[catalog-graph] Catalog ID uloženo do nastavení: ${catalogId}`);
  }

  private async fetchCommerceManager(
    businessId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<{
    id: string | null;
    name: string | null;
    error: string | null;
    skipped: boolean;
  }> {
    const endpoint = `/${businessId}/commerce_merchant_settings`;
    if (!this.hasScope(scopes, SCOPE_BUSINESS_MANAGEMENT)) {
      return {
        id: null,
        name: null,
        error: this.missingPermissionMessage(endpoint, scopes),
        skipped: true,
      };
    }

    const res = await this.graph.get<GraphList<CommerceMerchantRow>>(endpoint, accessToken, {
      fields: 'id,display_name',
      limit: '10',
    });
    if (!res.ok) {
      return {
        id: null,
        name: null,
        error: this.formatGraphError(res, endpoint, scopes),
        skipped: false,
      };
    }
    const row = res.data.data?.[0];
    if (!row?.id) {
      return { id: null, name: null, error: null, skipped: false };
    }
    return {
      id: row.id,
      name: row.display_name ?? row.name ?? 'Commerce Manager',
      error: null,
      skipped: false,
    };
  }

  private async fetchCatalogNode(
    catalogId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<{ ok: true; data: CatalogGraphFields } | { ok: false; error: string }> {
    const endpoint = `/${catalogId}`;
    if (!this.hasScope(scopes, SCOPE_CATALOG_MANAGEMENT)) {
      return { ok: false, error: this.missingPermissionMessage(endpoint, scopes) };
    }
    const res = await this.graph.get<CatalogGraphFields>(endpoint, accessToken, {
      fields: 'id,name,vertical,update_time',
    });
    if (!res.ok) {
      return { ok: false, error: this.formatGraphError(res, endpoint, scopes) };
    }
    return { ok: true, data: res.data };
  }

  private async fetchProductStats(
    catalogId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<
    | { ok: true; productCount: number; imageCount: number; videoCount: number }
    | { ok: false; error: string }
  > {
    const endpoint = `/${catalogId}/products`;
    if (!this.hasScope(scopes, SCOPE_CATALOG_MANAGEMENT)) {
      return { ok: false, error: this.missingPermissionMessage(endpoint, scopes) };
    }

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

      const res = await this.graph.get<GraphList<CatalogProductRow>>(endpoint, accessToken, query);
      if (!res.ok) {
        return { ok: false, error: this.formatGraphError(res, endpoint, scopes) };
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
      catalogId: null,
      catalogName: null,
      commerceManagerId: ids.commerceManagerId,
      commerceManagerName: null,
      commercePermissionStatus: null,
      datasetId: ids.datasetId,
      commerceOnline: false,
      commerceMessage: 'Čeká na ověření Graph API…',
      catalogOnline: false,
      catalogMessage: 'Čeká na ověření Graph API…',
      productCount: null,
      lastCatalogUpdate: null,
      lastLocalSync:
        lastSyncRun?.finishedAt?.toISOString() ??
        catalogSettings?.lastSyncAt?.toISOString() ??
        lastOkSync?.finishedAt?.toISOString() ??
        null,
      importErrorCount: exportErrors + (lastSyncRun?.errorCount ?? 0),
      metaImagesLoaded: null,
      metaVideoCount: null,
      graphCheckedAt: checkedAt,
      graphError: null,
      graphErrorJson: null,
    };

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

    const tokenDebug = await this.oauth.debugToken(accessToken);
    const scopes = tokenDebug.scopes ?? [];
    base.commercePermissionStatus = this.buildPermissionStatus(scopes);

    const businessResolved = await this.resolveBusinessId(ids.businessId, accessToken, scopes);
    if (businessResolved.error && !businessResolved.businessId) {
      base.graphErrorJson = businessResolved.error;
      base.commerceMessage = businessResolved.error;
      base.catalogMessage = businessResolved.error;
      return base;
    }

    const businessId = businessResolved.businessId;
    base.businessId = businessId;
    base.businessName = businessResolved.businessName;

    if (!businessId) {
      base.commerceMessage = 'Chybí FACEBOOK_BUSINESS_ID a /me/businesses nevrátilo business.';
      base.catalogMessage = base.commerceMessage;
      return base;
    }

    const owned = await this.fetchOwnedProductCatalogs(businessId, accessToken, scopes);
    if (owned.error || !owned.catalogId) {
      const err = owned.error ?? `GET /${businessId}/owned_product_catalogs — katalog nenalezen.`;
      base.graphErrorJson = err;
      base.catalogMessage = err;
      base.commerceMessage = err;
      return base;
    }

    const resolvedCatalogId = owned.catalogId;
    base.catalogId = resolvedCatalogId;
    base.catalogName = owned.catalogName;
    await this.persistDiscoveredCatalog(resolvedCatalogId, owned.catalogName);

    const commerce = await this.fetchCommerceManager(businessId, accessToken, scopes);
    if (commerce.error) {
      base.graphErrorJson = commerce.error;
      base.commerceMessage = commerce.error;
    } else if (commerce.id) {
      base.commerceManagerId = commerce.id;
      base.commerceManagerName = commerce.name;
      base.commerceOnline = true;
      base.commerceMessage = `✓ ${commerce.name} (${commerce.id})`;
    } else {
      base.commerceMessage =
        `Commerce API: žádný Commerce Manager u business ${businessId} ` +
        `(oprávnění: ${base.commercePermissionStatus})`;
    }

    const catalogNode = await this.fetchCatalogNode(resolvedCatalogId, accessToken, scopes);
    if (!catalogNode.ok) {
      base.graphErrorJson = catalogNode.error;
      base.catalogMessage = catalogNode.error;
      return base;
    }

    base.catalogName = catalogNode.data.name ?? owned.catalogName ?? resolvedCatalogId;
    base.lastCatalogUpdate = catalogNode.data.update_time ?? null;

    const productStats = await this.fetchProductStats(resolvedCatalogId, accessToken, scopes);
    if (!productStats.ok) {
      base.graphErrorJson = productStats.error;
      base.catalogMessage = productStats.error;
      return base;
    }

    base.catalogOnline = true;
    base.productCount = productStats.productCount;
    base.metaImagesLoaded = productStats.imageCount;
    base.metaVideoCount = productStats.videoCount;

    base.catalogMessage =
      `✓ ${base.catalogName} · ${productStats.productCount} produktů · ` +
      `${productStats.imageCount} obrázků · ${productStats.videoCount} videí`;

    if (base.commerceOnline) {
      base.commerceMessage =
        `✓ ${base.commerceManagerName} · Business ID ${businessId} · Catalog ID ${resolvedCatalogId}`;
    }

    void this.logger.debug(
      `Catalog graph diagnostics: commerce=${base.commerceOnline} catalog=${base.catalogOnline} ` +
        `products=${base.productCount} scopes=${base.commercePermissionStatus}`,
    );

    return base;
  }

  async verifyCatalogViaGraph(catalogId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const scopes = (await this.oauth.debugToken(token)).scopes ?? [];
      const res = await this.fetchCatalogNode(catalogId, token, scopes);
      if (!res.ok) return { ok: false, message: res.error };
      const stats = await this.fetchProductStats(catalogId, token, scopes);
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
    try {
      const token = await this.oauth.resolveAccessToken();
      const scopes = (await this.oauth.debugToken(token)).scopes ?? [];
      const business = await this.resolveBusinessId(businessId, token, scopes);
      if (!business.businessId) {
        return { ok: false, message: business.error ?? 'Chybí FACEBOOK_BUSINESS_ID.' };
      }

      const owned = await this.fetchOwnedProductCatalogs(business.businessId, token, scopes);
      if (owned.error || !owned.catalogId) {
        return { ok: false, message: owned.error ?? 'Katalog nenalezen.' };
      }

      const commerce = await this.fetchCommerceManager(business.businessId, token, scopes);
      if (commerce.error) return { ok: false, message: commerce.error };

      const catalog = await this.fetchCatalogNode(owned.catalogId, token, scopes);
      if (!catalog.ok) return { ok: false, message: catalog.error };

      return {
        ok: true,
        message:
          `✓ Business ${business.businessId}` +
          (commerce.name ? ` · ${commerce.name}` : '') +
          ` · katalog ${catalog.data.name ?? owned.catalogId}`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Graph API nedostupné' };
    }
  }
}
