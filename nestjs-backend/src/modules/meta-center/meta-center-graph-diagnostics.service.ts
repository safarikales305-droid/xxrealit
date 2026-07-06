import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import {
  buildScopeGrantList,
  classifyGraphFailure,
  classifyMissingScopes,
  hasPermissionWarning,
  issueMessage,
  META_PERMISSION_WARNING_CATALOG,
  type MetaGraphIssueKind,
  type MetaScopeGrantStatus,
} from './meta-graph-permissions.util';
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

type GraphFailure = {
  kind: MetaGraphIssueKind;
  message: string;
  technicalDetail: string | null;
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
  commerceIssueKind: MetaGraphIssueKind;
  catalogOnline: boolean;
  catalogMessage: string;
  catalogIssueKind: MetaGraphIssueKind;
  productCount: number | null;
  lastCatalogUpdate: string | null;
  lastLocalSync: string | null;
  importErrorCount: number;
  metaImagesLoaded: number | null;
  metaVideoCount: number | null;
  graphCheckedAt: string;
  graphError: string | null;
  graphErrorJson: string | null;
  requiredScopes: MetaScopeGrantStatus[];
  permissionWarning: string | null;
  hasPermissionWarning: boolean;
};

@Injectable()
export class MetaCenterGraphDiagnosticsService {
  private readonly logger = new Logger(MetaCenterGraphDiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  private buildPermissionStatus(scopes: string[]): string {
    const business = scopes.includes('business_management') ? '✓' : '✗';
    const catalog = scopes.includes('catalog_management') ? '✓' : '✗';
    return `business_management ${business}, catalog_management ${catalog}`;
  }

  private scopeFailure(endpoint: string, scopes: string[]): GraphFailure {
    const kind = classifyMissingScopes(scopes);
    if (kind === 'missing_permission') {
      return {
        kind,
        message: META_PERMISSION_WARNING_CATALOG,
        technicalDetail: `Chybí scope v tokenu · GET ${endpoint}`,
      };
    }
    return { kind: 'ok', message: '', technicalDetail: null };
  }

  private graphFailure(res: MetaGraphResult<unknown>, endpoint: string, scopes: string[]): GraphFailure {
    return classifyGraphFailure(res, endpoint, scopes);
  }

  async checkRequiredPermissions(): Promise<{
    checkedAt: string;
    tokenValid: boolean;
    scopes: MetaScopeGrantStatus[];
    error: string | null;
  }> {
    const checkedAt = new Date().toISOString();
    try {
      const token = await this.oauth.resolveAccessToken();
      const debug = await this.oauth.debugToken(token);
      const granted = debug.scopes ?? [];
      return {
        checkedAt,
        tokenValid: debug.is_valid !== false,
        scopes: buildScopeGrantList(granted),
        error: null,
      };
    } catch (err) {
      return {
        checkedAt,
        tokenValid: false,
        scopes: buildScopeGrantList([]),
        error: err instanceof Error ? err.message : 'Chybí access token.',
      };
    }
  }

  private async resolveBusinessId(
    businessId: string | null,
    accessToken: string,
    scopes: string[],
  ): Promise<{
    businessId: string | null;
    businessName: string | null;
    failure: GraphFailure | null;
  }> {
    if (businessId) {
      return { businessId, businessName: null, failure: null };
    }
    const scopeErr = this.scopeFailure('/me/businesses', scopes);
    if (scopeErr.kind !== 'ok') {
      return { businessId: null, businessName: null, failure: scopeErr };
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
        failure: this.graphFailure(res, '/me/businesses', scopes),
      };
    }
    const row = res.data.data?.[0];
    if (!row?.id) {
      return {
        businessId: null,
        businessName: null,
        failure: {
          kind: 'not_configured',
          message: 'Business Manager nenalezen v /me/businesses.',
          technicalDetail: null,
        },
      };
    }
    return { businessId: row.id, businessName: row.name ?? null, failure: null };
  }

  private async fetchOwnedProductCatalogs(
    businessId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<{
    catalogId: string | null;
    catalogName: string | null;
    failure: GraphFailure | null;
  }> {
    const endpoint = `/${businessId}/owned_product_catalogs`;
    const scopeErr = this.scopeFailure(endpoint, scopes);
    if (scopeErr.kind !== 'ok') {
      return { catalogId: null, catalogName: null, failure: scopeErr };
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
        failure: this.graphFailure(res, endpoint, scopes),
      };
    }
    const list = res.data.data ?? [];
    if (!list.length) {
      return {
        catalogId: null,
        catalogName: null,
        failure: {
          kind: 'business_no_catalog',
          message: issueMessage('business_no_catalog'),
          technicalDetail: `GET ${endpoint} — prázdný seznam.`,
        },
      };
    }
    const first = list[0];
    return {
      catalogId: first?.id ?? null,
      catalogName: first?.name ?? null,
      failure: null,
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
    failure: GraphFailure | null;
  }> {
    const endpoint = `/${businessId}/commerce_merchant_settings`;
    if (!scopes.includes('business_management')) {
      return {
        id: null,
        name: null,
        failure: this.scopeFailure(endpoint, scopes),
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
        failure: this.graphFailure(res, endpoint, scopes),
      };
    }
    const row = res.data.data?.[0];
    if (!row?.id) {
      return { id: null, name: null, failure: null };
    }
    return {
      id: row.id,
      name: row.display_name ?? row.name ?? 'Commerce Manager',
      failure: null,
    };
  }

  private async fetchCatalogNode(
    catalogId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<
    | { ok: true; data: CatalogGraphFields }
    | { ok: false; failure: GraphFailure }
  > {
    const endpoint = `/${catalogId}`;
    if (!scopes.includes('catalog_management')) {
      return { ok: false, failure: this.scopeFailure(endpoint, scopes) };
    }
    const res = await this.graph.get<CatalogGraphFields>(endpoint, accessToken, {
      fields: 'id,name,vertical,update_time',
    });
    if (!res.ok) {
      const failure = this.graphFailure(res, endpoint, scopes);
      if (failure.kind === 'missing_permission') {
        return {
          ok: false,
          failure: {
            kind: 'catalog_not_in_app',
            message: issueMessage('catalog_not_in_app'),
            technicalDetail: failure.technicalDetail,
          },
        };
      }
      return { ok: false, failure };
    }
    return { ok: true, data: res.data };
  }

  private async fetchProductStats(
    catalogId: string,
    accessToken: string,
    scopes: string[],
  ): Promise<
    | { ok: true; productCount: number; imageCount: number; videoCount: number }
    | { ok: false; failure: GraphFailure }
  > {
    const endpoint = `/${catalogId}/products`;
    if (!scopes.includes('catalog_management')) {
      return { ok: false, failure: this.scopeFailure(endpoint, scopes) };
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
        return { ok: false, failure: this.graphFailure(res, endpoint, scopes) };
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

  private applyCommerceFailure(base: MetaCatalogGraphDiagnostics, failure: GraphFailure) {
    base.commerceIssueKind = failure.kind;
    base.commerceMessage = failure.message;
    if (failure.kind === 'missing_permission') {
      base.hasPermissionWarning = true;
      base.permissionWarning = failure.message;
    } else if (failure.kind === 'api_error') {
      base.graphError = failure.message;
      base.graphErrorJson = failure.technicalDetail;
    }
  }

  private applyCatalogFailure(base: MetaCatalogGraphDiagnostics, failure: GraphFailure) {
    base.catalogIssueKind = failure.kind;
    base.catalogMessage = failure.message;
    if (failure.kind === 'missing_permission' || failure.kind === 'catalog_not_in_app') {
      base.hasPermissionWarning = true;
      base.permissionWarning = failure.message;
    } else if (failure.kind === 'api_error') {
      base.graphError = failure.message;
      base.graphErrorJson = failure.technicalDetail;
    }
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
      commerceIssueKind: 'not_configured',
      catalogOnline: false,
      catalogMessage: 'Čeká na ověření Graph API…',
      catalogIssueKind: 'not_configured',
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
      requiredScopes: buildScopeGrantList([]),
      permissionWarning: null,
      hasPermissionWarning: false,
    };

    let accessToken: string;
    try {
      accessToken = await this.oauth.resolveAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chybí access token.';
      base.commerceIssueKind = 'not_configured';
      base.catalogIssueKind = 'not_configured';
      base.commerceMessage = msg;
      base.catalogMessage = msg;
      return base;
    }

    const tokenDebug = await this.oauth.debugToken(accessToken);
    const scopes = tokenDebug.scopes ?? [];
    base.commercePermissionStatus = this.buildPermissionStatus(scopes);
    base.requiredScopes = buildScopeGrantList(scopes);

    const businessResolved = await this.resolveBusinessId(ids.businessId, accessToken, scopes);
    if (businessResolved.failure && !businessResolved.businessId) {
      this.applyCommerceFailure(base, businessResolved.failure);
      this.applyCatalogFailure(base, { ...businessResolved.failure });
      return base;
    }

    const businessId = businessResolved.businessId;
    base.businessId = businessId;
    base.businessName = businessResolved.businessName;

    if (!businessId) {
      const failure: GraphFailure = {
        kind: 'not_configured',
        message: 'Chybí FACEBOOK_BUSINESS_ID a /me/businesses nevrátilo business.',
        technicalDetail: null,
      };
      this.applyCommerceFailure(base, failure);
      this.applyCatalogFailure(base, failure);
      return base;
    }

    const owned = await this.fetchOwnedProductCatalogs(businessId, accessToken, scopes);
    if (owned.failure || !owned.catalogId) {
      const failure =
        owned.failure ??
        ({
          kind: 'catalog_not_found',
          message: issueMessage('catalog_not_found'),
          technicalDetail: `GET /${businessId}/owned_product_catalogs`,
        } satisfies GraphFailure);
      this.applyCommerceFailure(base, failure);
      this.applyCatalogFailure(base, failure);
      return base;
    }

    const resolvedCatalogId = owned.catalogId;
    base.catalogId = resolvedCatalogId;
    base.catalogName = owned.catalogName;
    await this.persistDiscoveredCatalog(resolvedCatalogId, owned.catalogName);

    const commerce = await this.fetchCommerceManager(businessId, accessToken, scopes);
    if (commerce.failure) {
      this.applyCommerceFailure(base, commerce.failure);
    } else if (commerce.id) {
      base.commerceManagerId = commerce.id;
      base.commerceManagerName = commerce.name;
      base.commerceOnline = true;
      base.commerceIssueKind = 'ok';
      base.commerceMessage = `✓ ${commerce.name} (${commerce.id})`;
    } else {
      base.commerceIssueKind = 'not_configured';
      base.commerceMessage =
        `Commerce API: žádný Commerce Manager u business ${businessId} ` +
        `(oprávnění: ${base.commercePermissionStatus})`;
    }

    const catalogNode = await this.fetchCatalogNode(resolvedCatalogId, accessToken, scopes);
    if (!catalogNode.ok) {
      this.applyCatalogFailure(base, catalogNode.failure);
      return base;
    }

    base.catalogName = catalogNode.data.name ?? owned.catalogName ?? resolvedCatalogId;
    base.lastCatalogUpdate = catalogNode.data.update_time ?? null;

    const productStats = await this.fetchProductStats(resolvedCatalogId, accessToken, scopes);
    if (!productStats.ok) {
      this.applyCatalogFailure(base, productStats.failure);
      return base;
    }

    base.catalogOnline = true;
    base.catalogIssueKind = 'ok';
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

    base.hasPermissionWarning = hasPermissionWarning(
      base.commerceIssueKind,
      base.catalogIssueKind,
    );

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
      if (!res.ok) return { ok: false, message: res.failure.message };
      const stats = await this.fetchProductStats(catalogId, token, scopes);
      if (!stats.ok) return { ok: false, message: stats.failure.message };
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
        return { ok: false, message: business.failure?.message ?? 'Chybí FACEBOOK_BUSINESS_ID.' };
      }

      const owned = await this.fetchOwnedProductCatalogs(business.businessId, token, scopes);
      if (owned.failure || !owned.catalogId) {
        return { ok: false, message: owned.failure?.message ?? 'Katalog nenalezen.' };
      }

      const commerce = await this.fetchCommerceManager(business.businessId, token, scopes);
      if (commerce.failure) return { ok: false, message: commerce.failure.message };

      const catalog = await this.fetchCatalogNode(owned.catalogId, token, scopes);
      if (!catalog.ok) return { ok: false, message: catalog.failure.message };

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
