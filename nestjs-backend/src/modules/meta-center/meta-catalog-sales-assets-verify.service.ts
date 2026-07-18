import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService, type MetaGraphResult } from './meta-graph-client.service';
import { resolveMetaCenterIds } from './meta-center-env.util';

const SETTINGS_ID = 'default';

type GraphList<T> = { data?: T[] };

type IdName = { id?: string; name?: string };
type IdNameBusiness = IdName & { business?: { id?: string; name?: string } };
type ExternalEventSource = { id?: string; type?: string; pixel?: IdName };

export type MetaCatalogSalesAssetCheck = {
  key: string;
  label: string;
  ok: boolean;
  graphPath: string;
  graphUrl: string;
  message: string;
  requestId?: string | null;
  fbtraceId?: string | null;
  response?: unknown;
};

export type MetaCatalogEventSourceInfo = {
  configuredDatasetId: string | null;
  configuredPixelId: string | null;
  catalogEventSources: Array<{ id: string | null; type: string | null; pixelId: string | null }>;
  catalogPixelIds: string[];
  resolvedPixelId: string | null;
  resolvedEventSourceType: 'PIXEL' | 'DATASET' | 'NONE';
  promotedObjectPixelId: string | null;
  promotedObjectCustomEventType: 'PURCHASE' | 'VIEW_CONTENT' | null;
  canUseConversionOptimization: boolean;
};

export type MetaCatalogSalesAssetsVerification = {
  ok: boolean;
  message: string;
  canUseConversionOptimization: boolean;
  catalogLaunchMode: 'sales' | 'traffic';
  verifiedPixelId: string | null;
  configuredPixelId: string | null;
  configuredDatasetId: string | null;
  promotedObjectPixelId: string | null;
  eventSource: MetaCatalogEventSourceInfo;
  checks: MetaCatalogSalesAssetCheck[];
  assets: {
    business: IdName | null;
    adAccount: IdNameBusiness | null;
    catalog: IdNameBusiness | null;
    dataset: IdName | null;
    pixel: IdName | null;
    page: IdName | null;
    instagram: IdName | null;
  };
};

@Injectable()
export class MetaCatalogSalesAssetsVerifyService {
  private readonly logger = new Logger(MetaCatalogSalesAssetsVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  async verifyForCatalogSalesLaunch(): Promise<MetaCatalogSalesAssetsVerification> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const token = await this.oauth.resolveMarketingAccessToken();
    const graphVersion = row?.graphApiVersion?.trim() || undefined;
    const graphBase = this.graph.graphBase(graphVersion);

    const catalogId = ids.catalogId?.replace(/^catalog_/i, '').trim() || null;
    const adAccountRaw = ids.adAccountId?.replace(/^act_/i, '').trim() || null;
    const businessId = ids.businessId?.trim() || null;
    const configuredPixelId = ids.pixelId?.trim() || null;
    const configuredDatasetId = ids.datasetId?.trim() || null;
    const pageId = row?.pageId?.trim() || null;
    const instagramId = row?.instagramBusinessId?.trim() || null;

    const checks: MetaCatalogSalesAssetCheck[] = [];
    const assets: MetaCatalogSalesAssetsVerification['assets'] = {
      business: null,
      adAccount: null,
      catalog: null,
      dataset: null,
      pixel: null,
      page: null,
      instagram: null,
    };

    const pushCheck = (
      key: string,
      label: string,
      graphPath: string,
      ok: boolean,
      message: string,
      response?: unknown,
      headers?: Record<string, string>,
    ) => {
      checks.push({
        key,
        label,
        ok,
        graphPath,
        graphUrl: `${graphBase.replace(/\/$/, '')}${graphPath}`,
        message,
        requestId: headers?.['x-fb-request-id'] ?? headers?.['x-fb-trace-id'] ?? null,
        fbtraceId: extractFbTraceId(response),
        response,
      });
    };

    if (!businessId) {
      pushCheck('business', 'Business Manager', '/me/businesses', false, '❌ Catalog není propojen s Business Managerem — chybí Business ID.');
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }

    const businessRes = await this.graph.getWithResponseHeaders<IdName>(
      `/${businessId}`,
      token,
      { fields: 'id,name' },
    );
    if (!businessRes.ok || !businessRes.data?.id) {
      pushCheck(
        'business',
        'Business Manager',
        `/${businessId}`,
        false,
        '❌ Catalog není propojen s Business Managerem — Business Manager neexistuje nebo není dostupný.',
        businessRes.data,
        businessRes.responseHeaders,
      );
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }
    assets.business = { id: businessRes.data.id, name: businessRes.data.name };
    pushCheck('business', 'Business Manager', `/${businessId}`, true, '✔ Business Manager nalezen.', businessRes.data);

    if (!adAccountRaw) {
      pushCheck('ad_account', 'Ad Account', '/act_?', false, '❌ Chybí Ad Account ID.');
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }

    const adAccountPath = `/act_${adAccountRaw}`;
    const adAccountRes = await this.graph.getWithResponseHeaders<IdNameBusiness>(
      adAccountPath,
      token,
      { fields: 'id,name,business{id,name}' },
    );
    if (!adAccountRes.ok || !adAccountRes.data?.id) {
      pushCheck(
        'ad_account',
        'Ad Account',
        adAccountPath,
        false,
        '❌ Reklamní účet neexistuje nebo není dostupný.',
        adAccountRes.data,
        adAccountRes.responseHeaders,
      );
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }
    assets.adAccount = adAccountRes.data;
    pushCheck('ad_account', 'Ad Account', adAccountPath, true, '✔ Ad Account nalezen.', adAccountRes.data);

    const adAccountBusinessId = adAccountRes.data.business?.id?.trim() || null;
    if (adAccountBusinessId && adAccountBusinessId !== businessId) {
      pushCheck(
        'ad_account_business',
        'Ad Account ↔ Business',
        adAccountPath,
        false,
        '❌ Catalog není propojen s Business Managerem — Ad Account patří jinému Business Manageru.',
        adAccountRes.data,
      );
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }

    if (!catalogId) {
      pushCheck('catalog', 'Catalog', '/catalog?', false, '❌ Chybí Catalog ID.');
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }

    const catalogPath = `/${catalogId}`;
    const catalogRes = await this.graph.getWithResponseHeaders<IdNameBusiness>(
      catalogPath,
      token,
      { fields: 'id,name,business{id,name}' },
    );
    if (!catalogRes.ok || !catalogRes.data?.id) {
      pushCheck(
        'catalog',
        'Catalog',
        catalogPath,
        false,
        '❌ Katalog neexistuje nebo není dostupný.',
        catalogRes.data,
        catalogRes.responseHeaders,
      );
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }
    assets.catalog = catalogRes.data;
    pushCheck('catalog', 'Catalog', catalogPath, true, '✔ Katalog nalezen.', catalogRes.data);

    const catalogBusinessId = catalogRes.data.business?.id?.trim() || null;
    if (catalogBusinessId && catalogBusinessId !== businessId) {
      pushCheck(
        'catalog_business',
        'Catalog ↔ Business',
        catalogPath,
        false,
        '❌ Catalog není propojen s Business Managerem.',
        catalogRes.data,
      );
      return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
    }

    if (pageId) {
      const pageRes = await this.graph.getWithResponseHeaders<IdName>(`/${pageId}`, token, { fields: 'id,name' });
      if (pageRes.ok && pageRes.data?.id) {
        assets.page = pageRes.data;
        pushCheck('page', 'Page', `/${pageId}`, true, '✔ Facebook stránka nalezena.', pageRes.data);
      } else {
        pushCheck('page', 'Page', `/${pageId}`, false, 'Facebook stránka není dostupná.', pageRes.data);
      }
    }

    if (instagramId) {
      const igRes = await this.graph.getWithResponseHeaders<IdName>(
        `/${instagramId}`,
        token,
        { fields: 'id,name,username' },
      );
      if (igRes.ok && igRes.data?.id) {
        assets.instagram = igRes.data;
        pushCheck('instagram', 'Instagram', `/${instagramId}`, true, '✔ Instagram účet nalezen.', igRes.data);
      } else {
        pushCheck('instagram', 'Instagram', `/${instagramId}`, false, 'Instagram účet není dostupný.', igRes.data);
      }
    }

    const catalogSourcesPath = `/${catalogId}/external_event_sources`;
    const catalogSourcesRes = await this.graph.getWithResponseHeaders<GraphList<ExternalEventSource>>(
      catalogSourcesPath,
      token,
      { fields: 'id,type,pixel{id,name}', limit: '50' },
    );
    const catalogSources = catalogSourcesRes.ok ? catalogSourcesRes.data.data ?? [] : [];
    const catalogPixelIds = new Set<string>();
    for (const source of catalogSources) {
      if (source.pixel?.id) catalogPixelIds.add(source.pixel.id);
      if (source.id && (source.type?.toUpperCase().includes('PIXEL') || source.pixel?.id)) {
        catalogPixelIds.add(source.id);
      }
    }

    if (configuredDatasetId) {
      const datasetRes = await this.graph.getWithResponseHeaders<IdName>(
        `/${configuredDatasetId}`,
        token,
        { fields: 'id,name' },
      );
      if (datasetRes.ok && datasetRes.data?.id) {
        assets.dataset = datasetRes.data;
        pushCheck('dataset', 'Dataset', `/${configuredDatasetId}`, true, '✔ Dataset nalezen.', datasetRes.data);
      } else {
        pushCheck(
          'dataset',
          'Dataset',
          `/${configuredDatasetId}`,
          false,
          '❌ Dataset neexistuje nebo není dostupný.',
          datasetRes.data,
          datasetRes.responseHeaders,
        );
        return this.fail(checks, assets, configuredPixelId, configuredDatasetId, null, checks[checks.length - 1]!.message);
      }
    }

    let verifiedPixelId: string | null = configuredPixelId;
    if (!verifiedPixelId && configuredPixelId) {
      verifiedPixelId = configuredPixelId;
    }

    pushCheck(
      'catalog_event_sources',
      'Catalog → Event Sources',
      catalogSourcesPath,
      catalogSourcesRes.ok,
      catalogSourcesRes.ok
        ? `✔ Katalog vrátil ${catalogSources.length} zdroj(ů) událostí.`
        : '❌ Nelze načíst zdroje událostí katalogu.',
      catalogSourcesRes.data,
      catalogSourcesRes.responseHeaders,
    );

    if (configuredPixelId) {
      const pixelPath = `/${configuredPixelId}`;
      const pixelProbe = await this.graph.getWithResponseHeaders<IdName>(
        pixelPath,
        token,
        { fields: 'id,name' },
      );
      if (pixelProbe.ok && pixelProbe.data?.id) {
        verifiedPixelId = configuredPixelId;
      }
    }

    if (!verifiedPixelId && catalogPixelIds.size === 1) {
      verifiedPixelId = [...catalogPixelIds][0] ?? null;
      pushCheck(
        'pixel_config',
        'Pixel z katalogu',
        catalogSourcesPath,
        true,
        `✔ Pixel není v nastavení — nalezen Pixel propojený s katalogem (${verifiedPixelId}).`,
        { catalogPixelIds: [...catalogPixelIds] },
      );
    }

    if (!verifiedPixelId) {
      pushCheck(
        'pixel_config',
        'Pixel / Event Source',
        catalogSourcesPath,
        false,
        'Katalog nemá dostupný podporovaný zdroj událostí pro optimalizaci nákupu. Bude použit režim katalogové návštěvnosti.',
        {
          configuredDatasetId,
          configuredPixelId,
          catalogEventSources: catalogSources,
        },
        catalogSourcesRes.responseHeaders,
      );
      const eventSource = this.buildEventSourceInfo({
        configuredPixelId,
        configuredDatasetId,
        catalogSources,
        catalogPixelIds,
        verifiedPixelId: null,
        canUseConversionOptimization: false,
      });
      return this.success(
        checks,
        assets,
        configuredPixelId,
        configuredDatasetId,
        null,
        false,
        eventSource,
      );
    }

    if (configuredPixelId && configuredDatasetId && configuredPixelId !== configuredDatasetId) {
      const datasetLinkedToPixel = catalogPixelIds.has(configuredPixelId);
      pushCheck(
        'dataset_pixel',
        'Dataset ↔ Pixel',
        catalogSourcesPath,
        datasetLinkedToPixel,
        datasetLinkedToPixel
          ? '✔ Dataset a Pixel jsou propojené přes katalog.'
          : '❌ Dataset není propojen s Pixelem.',
        {
          datasetId: configuredDatasetId,
          pixelId: configuredPixelId,
          catalogPixelIds: [...catalogPixelIds],
        },
      );
      if (!datasetLinkedToPixel) {
        const eventSource = this.buildEventSourceInfo({
          configuredPixelId,
          configuredDatasetId,
          catalogSources,
          catalogPixelIds,
          verifiedPixelId: null,
          canUseConversionOptimization: false,
        });
        return this.success(
          checks,
          assets,
          configuredPixelId,
          configuredDatasetId,
          null,
          false,
          eventSource,
          checks[checks.length - 1]!.message,
        );
      }
    }

    const pixelPath = `/${verifiedPixelId}`;
    const pixelRes = await this.graph.getWithResponseHeaders<IdName>(
      pixelPath,
      token,
      { fields: 'id,name' },
    );
    if (!pixelRes.ok || !pixelRes.data?.id) {
      pushCheck(
        'pixel_exists',
        'Pixel',
        pixelPath,
        false,
        '❌ Pixel neexistuje nebo není aktivní. Použije se režim katalogové návštěvnosti.',
        pixelRes.data,
        pixelRes.responseHeaders,
      );
      const eventSource = this.buildEventSourceInfo({
        configuredPixelId,
        configuredDatasetId,
        catalogSources,
        catalogPixelIds,
        verifiedPixelId: null,
        canUseConversionOptimization: false,
      });
      return this.success(
        checks,
        assets,
        configuredPixelId,
        configuredDatasetId,
        null,
        false,
        eventSource,
        checks[checks.length - 1]!.message,
      );
    }
    assets.pixel = { id: pixelRes.data.id, name: pixelRes.data.name };
    pushCheck('pixel_exists', 'Pixel', pixelPath, true, '✔ Pixel existuje.', pixelRes.data);

    const businessPixels = await this.collectPixelIds(token, [
      `/${businessId}/adspixels`,
      `/${businessId}/owned_pixels`,
    ]);
    const pixelInBusiness = businessPixels.has(verifiedPixelId);
    pushCheck(
      'pixel_business',
      'Pixel ↔ Business',
      `/${businessId}/adspixels`,
      pixelInBusiness,
      pixelInBusiness
        ? '✔ Pixel patří Business Manageru.'
        : '❌ Pixel není dostupný v Business Manageru.',
      { pixelIds: [...businessPixels] },
    );
    if (!pixelInBusiness) {
      const eventSource = this.buildEventSourceInfo({
        configuredPixelId,
        configuredDatasetId,
        catalogSources,
        catalogPixelIds,
        verifiedPixelId: null,
        canUseConversionOptimization: false,
      });
      return this.success(
        checks,
        assets,
        configuredPixelId,
        configuredDatasetId,
        null,
        false,
        eventSource,
        checks[checks.length - 1]!.message,
      );
    }

    const adAccountPixels = await this.collectPixelIds(token, [adAccountPath + '/adspixels']);
    const pixelInAdAccount = adAccountPixels.has(verifiedPixelId);
    pushCheck(
      'pixel_ad_account',
      'Pixel ↔ Ad Account',
      `${adAccountPath}/adspixels`,
      pixelInAdAccount,
      pixelInAdAccount
        ? '✔ Pixel je sdílen s tímto Ad Accountem.'
        : '❌ Pixel není sdílen s tímto Ad Accountem.',
      { pixelIds: [...adAccountPixels] },
    );
    if (!pixelInAdAccount) {
      const eventSource = this.buildEventSourceInfo({
        configuredPixelId,
        configuredDatasetId,
        catalogSources,
        catalogPixelIds,
        verifiedPixelId: null,
        canUseConversionOptimization: false,
      });
      return this.success(
        checks,
        assets,
        configuredPixelId,
        configuredDatasetId,
        null,
        false,
        eventSource,
        checks[checks.length - 1]!.message,
      );
    }

    let pixelLinkedToCatalog = catalogPixelIds.has(verifiedPixelId);
    if (!pixelLinkedToCatalog) {
      const reversePath = `/${verifiedPixelId}/product_catalogs`;
      const reverseRes = await this.graph.getWithResponseHeaders<GraphList<IdName>>(
        reversePath,
        token,
        { fields: 'id,name', limit: '50' },
      );
      if (reverseRes.ok) {
        pixelLinkedToCatalog = (reverseRes.data.data ?? []).some((c) => c.id === catalogId);
      }
    }

    pushCheck(
      'pixel_catalog',
      'Pixel ↔ Catalog',
      catalogSourcesPath,
      pixelLinkedToCatalog,
      pixelLinkedToCatalog
        ? '✔ Pixel je propojen s katalogem.'
        : '❌ Pixel není propojen s katalogem.',
      catalogSourcesRes.data,
      catalogSourcesRes.responseHeaders,
    );
    if (!pixelLinkedToCatalog) {
      const eventSource = this.buildEventSourceInfo({
        configuredPixelId,
        configuredDatasetId,
        catalogSources,
        catalogPixelIds,
        verifiedPixelId: null,
        canUseConversionOptimization: false,
      });
      return this.success(
        checks,
        assets,
        configuredPixelId,
        configuredDatasetId,
        null,
        false,
        eventSource,
        checks[checks.length - 1]!.message,
      );
    }

    const catalogUsesDataset = Boolean(configuredDatasetId);
    pushCheck(
      'catalog_dataset',
      'Catalog ↔ Dataset',
      catalogSourcesPath,
      !configuredDatasetId || catalogSources.some((s) => s.id === configuredDatasetId) || catalogUsesDataset,
      catalogUsesDataset
        ? catalogSources.some((s) => s.id === configuredDatasetId)
          ? '✔ Katalog používá nastavený Dataset.'
          : '✔ Dataset je nastaven (katalogové propojení přes Pixel).'
        : 'Dataset není v konfiguraci (volitelné pro CAPI).',
      { catalogId, datasetId: configuredDatasetId, catalogSources },
    );

    this.logger.log(
      `[meta-assets-verify] ok pixel=${verifiedPixelId} catalog=${catalogId} business=${businessId}`,
    );

    const eventSource = this.buildEventSourceInfo({
      configuredPixelId,
      configuredDatasetId,
      catalogSources,
      catalogPixelIds,
      verifiedPixelId,
      canUseConversionOptimization: true,
    });

    return this.success(
      checks,
      assets,
      configuredPixelId,
      configuredDatasetId,
      verifiedPixelId,
      true,
      eventSource,
      'Všechny Meta assety pro katalogový prodej jsou ověřené.',
    );
  }

  private buildEventSourceInfo(input: {
    configuredPixelId: string | null;
    configuredDatasetId: string | null;
    catalogSources: ExternalEventSource[];
    catalogPixelIds: Set<string>;
    verifiedPixelId: string | null;
    canUseConversionOptimization: boolean;
  }): MetaCatalogEventSourceInfo {
    const catalogEventSources = input.catalogSources.map((s) => ({
      id: s.id ?? null,
      type: s.type ?? null,
      pixelId: s.pixel?.id ?? null,
    }));
    return {
      configuredDatasetId: input.configuredDatasetId,
      configuredPixelId: input.configuredPixelId,
      catalogEventSources,
      catalogPixelIds: [...input.catalogPixelIds],
      resolvedPixelId: input.verifiedPixelId,
      resolvedEventSourceType: input.verifiedPixelId ? 'PIXEL' : input.configuredDatasetId ? 'DATASET' : 'NONE',
      promotedObjectPixelId: input.canUseConversionOptimization ? input.verifiedPixelId : null,
      promotedObjectCustomEventType: input.canUseConversionOptimization ? 'PURCHASE' : null,
      canUseConversionOptimization: input.canUseConversionOptimization,
    };
  }

  private success(
    checks: MetaCatalogSalesAssetCheck[],
    assets: MetaCatalogSalesAssetsVerification['assets'],
    configuredPixelId: string | null,
    configuredDatasetId: string | null,
    promotedObjectPixelId: string | null,
    canUseConversionOptimization: boolean,
    eventSource: MetaCatalogEventSourceInfo,
    message?: string,
  ): MetaCatalogSalesAssetsVerification {
    const catalogLaunchMode = canUseConversionOptimization ? 'sales' : 'traffic';
    const finalMessage =
      message ??
      (canUseConversionOptimization
        ? 'Všechny Meta assety pro katalogový prodej jsou ověřené.'
        : 'Katalog nemá dostupný podporovaný zdroj událostí pro optimalizaci nákupu. Použije se katalogová návštěvnost.');
    return {
      ok: true,
      message: finalMessage,
      canUseConversionOptimization,
      catalogLaunchMode,
      verifiedPixelId: promotedObjectPixelId,
      configuredPixelId,
      configuredDatasetId,
      promotedObjectPixelId,
      eventSource,
      checks,
      assets,
    };
  }

  private fail(
    checks: MetaCatalogSalesAssetCheck[],
    assets: MetaCatalogSalesAssetsVerification['assets'],
    configuredPixelId: string | null,
    configuredDatasetId: string | null,
    promotedObjectPixelId: string | null,
    message: string,
  ): MetaCatalogSalesAssetsVerification {
    this.logger.warn(`[meta-assets-verify] blocked: ${message}`);
    return {
      ok: false,
      message,
      canUseConversionOptimization: false,
      catalogLaunchMode: 'traffic',
      verifiedPixelId: null,
      configuredPixelId,
      configuredDatasetId,
      promotedObjectPixelId,
      eventSource: {
        configuredDatasetId,
        configuredPixelId,
        catalogEventSources: [],
        catalogPixelIds: [],
        resolvedPixelId: null,
        resolvedEventSourceType: 'NONE',
        promotedObjectPixelId: null,
        promotedObjectCustomEventType: null,
        canUseConversionOptimization: false,
      },
      checks,
      assets,
    };
  }

  private async collectPixelIds(token: string, paths: string[]): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const path of paths) {
      const res = await this.graph.get<GraphList<IdName>>(path, token, {
        fields: 'id,name',
        limit: '200',
      });
      if (!res.ok) continue;
      for (const row of res.data.data ?? []) {
        if (row.id) ids.add(row.id);
      }
    }
    return ids;
  }
}

function extractFbTraceId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const err = (response as { error?: { fbtrace_id?: string } }).error;
  return typeof err?.fbtrace_id === 'string' ? err.fbtrace_id : null;
}
