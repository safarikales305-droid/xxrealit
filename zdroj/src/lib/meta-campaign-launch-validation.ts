import type { MetaCampaignCreativePayload } from '@/lib/meta-campaign-creative';
import {
  buildCombinationDiagnostics,
  resolveMetaCampaignPayloadSpec,
  validateMetaCampaignCombination,
  type MetaCampaignCombinationDiagnostics,
  type MetaCampaignPayloadBlocker,
  type MetaCampaignPayloadSpec,
} from '@/lib/meta-campaign-payload-map';

export type MetaCampaignValidationItem = {
  key: string;
  label: string;
  ok: boolean;
  failMessage: string;
  group: 'integration' | 'campaign' | 'creative' | 'preview';
};

export type MetaCampaignLaunchValidationInput = {
  name: string;
  goal: string;
  creativeType: string;
  creativePayload: MetaCampaignCreativePayload | Record<string, unknown>;
  selectedProductIds: string[];
  selectedProductsCount: number;
  selectedProductsWithImage: number;
  cityName: string;
  locationLabel: string;
  metaGeoKey: string;
  latitude: string;
  longitude: string;
  targetingMode: string;
  locationTargetingMode: string;
  audienceId: string;
  budgetDaily: number;
  startDate: string;
  endDate: string;
  hasAdsApi: boolean;
  hasAdAccount: boolean;
  hasCatalog: boolean;
  hasDataset: boolean;
  hasPageId: boolean;
  hasCatalogId?: boolean;
  catalogId?: string | null;
  pixelId?: string | null;
  datasetId?: string | null;
  leadFormId?: string | null;
  campaignsLiveEnabled: boolean;
  fallbackLink?: string;
  fallbackHeadline?: string;
  fallbackPrimaryText?: string;
};

export type MetaCampaignValidationResult = {
  items: MetaCampaignValidationItem[];
  blockers: string[];
  readyToPublish: boolean;
  debug: Record<string, boolean | number | string | null>;
  metaPayloadBlockers: MetaCampaignPayloadBlocker[];
  metaSpec: MetaCampaignPayloadSpec | null;
  combinationDiagnostics: MetaCampaignCombinationDiagnostics | null;
};

function payloadOf(raw: MetaCampaignCreativePayload | Record<string, unknown>): MetaCampaignCreativePayload {
  return raw as MetaCampaignCreativePayload;
}

function needsProducts(creativeType: string): boolean {
  return creativeType === 'catalog_products' || creativeType === 'listing';
}

function needsCatalog(creativeType: string, goal: string): boolean {
  return creativeType === 'catalog_products' || goal === 'catalog';
}

function needsMedia(creativeType: string): boolean {
  return ['public_post', 'facebook_post', 'instagram_post', 'custom_image', 'custom_video'].includes(
    creativeType,
  );
}

function item(
  key: string,
  label: string,
  ok: boolean,
  failMessage: string,
  group: MetaCampaignValidationItem['group'],
): MetaCampaignValidationItem {
  return { key, label, ok, failMessage, group };
}

export function validateMetaCampaignLaunch(
  input: MetaCampaignLaunchValidationInput,
): MetaCampaignValidationResult {
  const cp = payloadOf(input.creativePayload);
  const primaryText = (cp.primaryText || cp.text || input.fallbackPrimaryText || '').trim();
  const headline = (cp.headline || input.fallbackHeadline || '').trim();
  const description = (cp.description || '').trim();
  const url = (cp.link || cp.detailUrl || input.fallbackLink || '').trim();
  const cta = (cp.ctaType || cp.cta || '').trim();
  const hasImage = Boolean(cp.image || cp.gallery?.[0]);
  const hasVideo = Boolean(cp.video || cp.videoId);
  const hasMedia = hasImage || hasVideo || Boolean(cp.objectStoryId);
  const city = input.cityName.trim() || input.locationLabel.trim();
  const locationRadiusMode = input.locationTargetingMode === 'radius';
  const hasGeoKey = Boolean(input.metaGeoKey.trim() && /^\d+$/.test(input.metaGeoKey.trim()));
  const hasCoords =
    Boolean(input.latitude.trim()) &&
    Boolean(input.longitude.trim()) &&
    Number.isFinite(Number.parseFloat(input.latitude)) &&
    Number.isFinite(Number.parseFloat(input.longitude));
  const productsOk =
    !needsProducts(input.creativeType) || input.selectedProductIds.length > 0;
  const catalogOk = !needsCatalog(input.creativeType, input.goal) || input.hasCatalog;
  const pixelRequired = input.goal === 'catalog' ||
    ['remarketing', 'map_remarketing'].includes(input.targetingMode);
  const datasetOk = !pixelRequired || input.hasDataset;
  const mediaOk =
    !needsMedia(input.creativeType) ||
    hasMedia ||
    (input.creativeType === 'listing' && input.selectedProductIds.length > 0);
  const imagesLoaded =
    input.creativeType === 'catalog_products'
      ? input.selectedProductsWithImage > 0 || hasImage
      : input.creativeType === 'listing'
        ? input.selectedProductsWithImage > 0 || hasImage
        : hasMedia;
  const previewReady =
    productsOk &&
    mediaOk &&
    Boolean(primaryText || input.creativeType === 'catalog_products') &&
    Boolean(headline || input.creativeType === 'catalog_products') &&
    imagesLoaded;
  const creativeReady =
    input.creativeType === 'catalog_products'
      ? productsOk && url.length > 0 && cta.length > 0
      : primaryText.length > 0 &&
        headline.length > 0 &&
        cta.length > 0 &&
        url.length > 0 &&
        mediaOk &&
        productsOk;

  const items: MetaCampaignValidationItem[] = [
    item(
      'campaignName',
      'Název kampaně',
      Boolean(input.name.trim()),
      'Chybí název kampaně',
      'campaign',
    ),
    item('goal', 'Cíl kampaně', Boolean(input.goal), 'Chybí cíl kampaně', 'campaign'),
    item(
      'creativeSource',
      'Zdroj kreativy',
      Boolean(input.creativeType),
      'Chybí zdroj kreativy',
      'creative',
    ),
    item(
      'products',
      'Produkty',
      productsOk,
      input.creativeType === 'listing'
        ? 'Vyberte alespoň jednu nemovitost.'
        : 'Vyberte alespoň jednu nemovitost.',
      'creative',
    ),
    item(
      'primaryText',
      'Primary text',
      primaryText.length > 0 || input.creativeType === 'catalog_products',
      'Chybí Primary text',
      'creative',
    ),
    item(
      'headline',
      'Headline',
      headline.length > 0 || input.creativeType === 'catalog_products',
      'Chybí Headline',
      'creative',
    ),
    item(
      'description',
      'Description',
      description.length > 0 || ['catalog_products', 'custom_video', 'instagram_post'].includes(input.creativeType),
      'Chybí Description',
      'creative',
    ),
    item(
      'url',
      'URL',
      url.length > 0 ||
        (input.creativeType === 'catalog_products' && input.selectedProductIds.length > 0),
      'Chybí URL',
      'creative',
    ),
    item('cta', 'CTA', cta.length > 0, 'Chybí CTA', 'creative'),
    item('pageId', 'Facebook stránka', input.hasPageId, 'Chybí Facebook stránka', 'integration'),
    item('adAccount', 'Ad Account', input.hasAdAccount, 'Chybí Ad Account', 'integration'),
    item('catalog', 'Catalog', catalogOk, 'Chybí Catalog ID', 'integration'),
    item(
      'dataset',
      'Dataset / Pixel',
      datasetOk,
      'Chybí Pixel/Dataset',
      'integration',
    ),
    item('adsApi', 'Ads API', input.hasAdsApi, 'Ads API není připojeno', 'integration'),
    item(
      'liveEnabled',
      'Ostré spuštění',
      input.campaignsLiveEnabled,
      'Ostré spuštění je vypnuté v Nastavení',
      'integration',
    ),
    item(
      'budget',
      'Rozpočet',
      input.budgetDaily > 0,
      'Chybí nebo je neplatný rozpočet',
      'campaign',
    ),
    item('location', 'Lokalita', city.length > 0, 'Chybí lokalita', 'campaign'),
    item(
      'geo',
      'Meta Geo / souřadnice',
      input.targetingMode === 'remarketing' ||
        (locationRadiusMode
          ? hasCoords || city.length > 0
          : hasGeoKey || city.length > 0),
      locationRadiusMode
        ? 'Pro okruh zadejte souřadnice nebo město s uloženými souřadnicemi'
        : 'Vyberte město z Meta Geo návrhů nebo zadejte Geo ID',
      'campaign',
    ),
    item(
      'audience',
      'Remarketing publikum',
      !['remarketing', 'map_remarketing'].includes(input.targetingMode) ||
        Boolean(input.audienceId.trim()),
      'Chybí remarketing publikum',
      'campaign',
    ),
    item('startDate', 'Datum spuštění', Boolean(input.startDate), 'Chybí datum spuštění', 'campaign'),
    item('endDate', 'Datum ukončení', Boolean(input.endDate), 'Chybí datum ukončení', 'campaign'),
    item(
      'dateRange',
      'Rozsah dat',
      !input.startDate ||
        !input.endDate ||
        input.endDate >= input.startDate,
      'Datum ukončení musí být po spuštění',
      'campaign',
    ),
    item('media', 'Obrázek / video', mediaOk, 'Chybí obrázek nebo video', 'creative'),
    item(
      'creativeReady',
      'Kreativa připravena',
      creativeReady || input.creativeType === 'catalog_products',
      'Kreativa není kompletní',
      'preview',
    ),
    item(
      'productsSelected',
      'Produkty vybrány',
      productsOk,
      'Produkty nejsou vybrány',
      'preview',
    ),
    item('imagesLoaded', 'Obrázky načteny', imagesLoaded, 'Obrázky nejsou načteny', 'preview'),
    item('previewReady', 'Náhled vytvořen', previewReady, 'Náhled nelze sestavit', 'preview'),
    item(
      'previewPrimaryText',
      'Primary text',
      primaryText.length > 0 || input.creativeType === 'catalog_products',
      'Primary text chybí',
      'preview',
    ),
    item('previewUrl', 'URL', url.length > 0, 'URL chybí', 'preview'),
  ];

  const catalogLaunchMode =
    input.goal === 'catalog' || input.creativeType === 'catalog_products'
      ? input.hasDataset && (input.pixelId || input.datasetId)
        ? ('sales' as const)
        : ('traffic' as const)
      : undefined;

  const payloadSpec = resolveMetaCampaignPayloadSpec({
    goal: input.goal,
    creativeType: input.creativeType,
    targetingMode: input.targetingMode,
    catalogId: input.catalogId ?? (input.hasCatalog ? 'configured' : null),
    pixelId: input.pixelId ?? null,
    datasetId: input.datasetId ?? null,
    pageId: input.hasPageId ? 'configured' : null,
    leadFormId: input.leadFormId ?? null,
    selectedProductIds: input.selectedProductIds,
    ...(catalogLaunchMode ? { catalogLaunchMode } : {}),
  });

  const comboBlockers =
    payloadSpec.spec != null
      ? validateMetaCampaignCombination({
          spec: payloadSpec.spec,
          ctx: {
            goal: input.goal,
            creativeType: input.creativeType,
            targetingMode: input.targetingMode,
            catalogId: input.catalogId ?? (input.hasCatalog ? 'configured' : null),
            pixelId: input.pixelId ?? null,
            datasetId: input.datasetId ?? null,
            pageId: input.hasPageId ? 'configured' : null,
            leadFormId: input.leadFormId ?? null,
            selectedProductIds: input.selectedProductIds,
          },
        })
      : [];

  const payloadBlockers = payloadSpec.ok ? [] : payloadSpec.blockers;

  const metaPayloadBlockers = payloadSpec.ok
    ? comboBlockers
    : [...payloadBlockers, ...comboBlockers];

  for (const b of comboBlockers) {
    if (!payloadBlockers.some((existing: MetaCampaignPayloadBlocker) => existing.key === b.key)) {
      items.push(item(`meta.${b.key}`, 'Meta kombinace', false, b.message, 'campaign'));
    }
  }

  for (const b of payloadBlockers) {
    items.push(
      item(
        `meta.${b.key}`,
        'Meta kombinace',
        false,
        b.message,
        'campaign',
      ),
    );
  }

  const blockers = items.filter((i) => !i.ok).map((i) => `❌ ${i.failMessage}`);
  const readyToPublish = items.every((i) => i.ok);

  const combinationDiagnostics =
    payloadSpec.spec != null
      ? buildCombinationDiagnostics({
          spec: payloadSpec.spec,
          ctx: {
            goal: input.goal,
            creativeType: input.creativeType,
            targetingMode: input.targetingMode,
            catalogId: input.catalogId ?? (input.hasCatalog ? 'configured' : null),
            pixelId: input.pixelId ?? null,
            datasetId: input.datasetId ?? null,
            pageId: input.hasPageId ? 'configured' : null,
            leadFormId: input.leadFormId ?? null,
            selectedProductIds: input.selectedProductIds,
          },
          blockers: metaPayloadBlockers,
        })
      : null;

  const debug: Record<string, boolean | number | string | null> = {
    campaignName: Boolean(input.name.trim()),
    goal: Boolean(input.goal),
    creativeSource: Boolean(input.creativeType),
    primaryText: primaryText.length > 0,
    headline: headline.length > 0,
    description: description.length > 0,
    url: url.length > 0,
    cta: cta.length > 0,
    catalog: catalogOk,
    selectedProducts: input.selectedProductIds.length,
    selectedProductsWithImage: input.selectedProductsWithImage,
    pageId: input.hasPageId,
    dataset: input.hasDataset,
    pixel: input.hasDataset,
    adAccount: input.hasAdAccount,
    adsApi: input.hasAdsApi,
    liveEnabled: input.campaignsLiveEnabled,
    budget: input.budgetDaily > 0,
    location: city.length > 0,
    geo: hasGeoKey || hasCoords,
    startDate: Boolean(input.startDate),
    endDate: Boolean(input.endDate),
    media: mediaOk,
    imagesLoaded,
    previewReady,
    creativeReady,
    readyToPublish,
    metaMode: payloadSpec.spec?.mode ?? null,
    metaObjective: payloadSpec.spec?.campaignObjective ?? null,
    metaOptimizationGoal: payloadSpec.spec?.optimizationGoal ?? null,
    metaDestinationType: payloadSpec.spec?.destinationType ?? null,
    metaCombinationValid: combinationDiagnostics?.validationOk ?? null,
  };

  return {
    items,
    blockers,
    readyToPublish,
    debug,
    metaPayloadBlockers,
    metaSpec: payloadSpec.spec,
    combinationDiagnostics,
  };
}

export function logMetaCampaignValidation(
  debug: Record<string, boolean | number | string | null>,
): void {
  console.group('[Meta Centrum] Validace kampaně');
  for (const [key, value] of Object.entries(debug)) {
    console.log(key, value);
  }
  console.groupEnd();
}
