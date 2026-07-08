import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import {
  creativeTypeRequiresCatalogProducts,
  normalizeCreativePayload,
  normalizeCreativeType,
} from './meta-campaign-creative.util';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import type { MetaCampaignLaunchBlocker } from './meta-campaign-api-payload.util';
import type { MetaCenterSetting } from '@prisma/client';
import {
  extractLeadFormId,
  resolveMetaCampaignPayloadSpec,
} from './meta-campaign-payload-map.util';

function push(
  blockers: MetaCampaignLaunchBlocker[],
  key: string,
  message: string,
): void {
  blockers.push({ key, message });
}

export function computeMetaCampaignLaunchBlockers(
  dto: CreateMetaCampaignDto,
  row: MetaCenterSetting | null,
  options?: {
    campaignsLiveEnabled?: boolean;
    parseDate?: (value: string | undefined) => Date | null;
    resolveTargetingMode?: (value: string | undefined) => string;
  },
): MetaCampaignLaunchBlocker[] {
  const ids = resolveMetaCenterIds(row ?? ({} as never));
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const parseDate =
    options?.parseDate ??
    ((value: string | undefined) => {
      if (!value?.trim()) return null;
      const d = new Date(value.trim());
      return Number.isNaN(d.getTime()) ? null : d;
    });

  const pageId = row?.pageId?.trim() ?? process.env.FACEBOOK_PAGE_ID?.trim() ?? null;
  const creativeType = normalizeCreativeType(dto.creativeType);
  const payload = normalizeCreativePayload(
    (dto.creativePayload ?? undefined) as Record<string, unknown> | undefined,
  );
  const primaryText = (payload.primaryText || payload.text || '').trim();
  const headline = (payload.headline || '').trim();
  const description = (payload.description || '').trim();
  const url = (payload.link || payload.detailUrl || '').trim();
  const cta = (payload.ctaType || payload.cta || '').trim();
  const hasMedia = Boolean(payload.image || payload.video || payload.objectStoryId);

  if (options?.campaignsLiveEnabled === false) {
    push(blockers, 'live_enabled', 'Ostré spuštění je vypnuté v Nastavení Meta Centra.');
  }
  if (!isMarketingAdsTokenActive(row ?? {})) {
    push(blockers, 'ads_api', 'Ads API není připojeno.');
  }
  if (!ids.adAccountId) {
    push(blockers, 'ad_account', 'Chybí Ad Account.');
  }
  if (!pageId) {
    push(blockers, 'page_id', 'Chybí Facebook stránka (Page ID).');
  }
  const needsCatalog = creativeType === 'catalog_products' || dto.objective === 'catalog';
  if (needsCatalog && !ids.catalogId) {
    push(blockers, 'catalog', 'Chybí Catalog ID.');
  }
  if (!dto.name?.trim()) {
    push(blockers, 'name', 'Chybí název kampaně.');
  }
  if (!dto.objective?.trim()) {
    push(blockers, 'objective', 'Chybí cíl kampaně.');
  }
  if (!creativeType) {
    push(blockers, 'creative_type', 'Chybí zdroj kreativy.');
  }
  if (creativeTypeRequiresCatalogProducts(creativeType) && !dto.selectedProductIds?.length) {
    push(blockers, 'products', 'Není vybrán žádný produkt.');
  }
  if (creativeType === 'listing' && !dto.selectedProductIds?.length) {
    push(blockers, 'listing', 'Není vybrán žádný inzerát.');
  }
  if (
    creativeType !== 'catalog_products' &&
    !primaryText
  ) {
    push(blockers, 'primary_text', 'Chybí Primary text.');
  }
  if (creativeType !== 'catalog_products' && !headline) {
    push(blockers, 'headline', 'Chybí Headline.');
  }
  if (
    !description &&
    !['catalog_products', 'custom_video', 'instagram_post'].includes(creativeType)
  ) {
    push(blockers, 'description', 'Chybí Description.');
  }
  if (!url && !(creativeType === 'catalog_products' && dto.selectedProductIds?.length)) {
    push(blockers, 'url', 'Chybí URL.');
  }
  if (!cta) {
    push(blockers, 'cta', 'Chybí CTA.');
  }
  if (
    ['public_post', 'facebook_post', 'instagram_post', 'custom_image', 'custom_video'].includes(
      creativeType,
    ) &&
    !hasMedia &&
    !dto.selectedProductIds?.length
  ) {
    push(blockers, 'media', 'Chybí obrázek nebo video.');
  }
  if (!dto.cityName?.trim()) {
    push(blockers, 'city', 'Chybí lokalita.');
  }
  if (!dto.dailyBudgetCzk || dto.dailyBudgetCzk <= 0) {
    push(blockers, 'budget', 'Chybí nebo je neplatný rozpočet.');
  }
  const start = parseDate(dto.startDate);
  const end = parseDate(dto.endDate);
  if (!start) {
    push(blockers, 'start_date', 'Chybí datum spuštění.');
  }
  if (!end) {
    push(blockers, 'end_date', 'Chybí datum ukončení.');
  }
  if (start && end && end.getTime() < start.getTime()) {
    push(blockers, 'date_range', 'Datum ukončení musí být po datu spuštění.');
  }

  const mode = options?.resolveTargetingMode?.(dto.targetingMode) ?? dto.targetingMode ?? 'map';
  if (mode === 'remarketing' || mode === 'map_remarketing') {
    if (!dto.audienceId?.trim()) {
      push(blockers, 'audience', 'Chybí remarketing publikum.');
    }
  }
  if (mode === 'map' || mode === 'map_remarketing') {
    const locationMode = dto.locationTargetingMode === 'radius' ? 'radius' : 'city';
    const hasGeoKey = Boolean(dto.metaGeoKey?.trim() && /^\d+$/.test(dto.metaGeoKey.trim()));
    const hasCoords =
      dto.latitude != null &&
      dto.longitude != null &&
      Number.isFinite(dto.latitude) &&
      Number.isFinite(dto.longitude);
    if (locationMode === 'radius') {
      if (!hasCoords && !dto.cityName?.trim()) {
        push(blockers, 'geo_radius', 'Pro okruh podle souřadnic zadejte latitude a longitude.');
      }
    } else if (!hasGeoKey && !hasCoords && !dto.cityName?.trim()) {
      push(blockers, 'geo', 'Chybí Meta Geo ID nebo město pro cílení.');
    }
  }

  const payloadSpec = resolveMetaCampaignPayloadSpec({
    goal: dto.objective,
    creativeType: dto.creativeType ?? 'catalog_products',
    targetingMode: mode,
    catalogId: ids.catalogId,
    pixelId: ids.pixelId,
    datasetId: ids.datasetId,
    pageId,
    instagramActorId: row?.instagramBusinessId?.trim() ?? null,
    leadFormId: extractLeadFormId(dto),
    remarketingConversionEvent: 'VIEW_CONTENT',
    selectedProductIds: dto.selectedProductIds ?? [],
  });
  if (!payloadSpec.ok) {
    for (const b of payloadSpec.blockers) {
      push(blockers, b.key, b.message);
    }
  } else if (payloadSpec.spec.usesPixel && !ids.datasetId && !ids.pixelId) {
    push(blockers, 'dataset', 'Chybí Pixel/Dataset.');
  }

  return blockers;
}

export function buildMetaCampaignValidationDebug(
  dto: CreateMetaCampaignDto,
  row: MetaCenterSetting | null,
  blockers: MetaCampaignLaunchBlocker[],
): Record<string, boolean | number | string | null> {
  const ids = resolveMetaCenterIds(row ?? ({} as never));
  const payload = normalizeCreativePayload(
    (dto.creativePayload ?? undefined) as Record<string, unknown> | undefined,
  );
  const blockerKeys = new Set(blockers.map((b) => b.key));
  return {
    campaignName: Boolean(dto.name?.trim()),
    primaryText: Boolean((payload.primaryText || payload.text || '').trim()),
    headline: Boolean(payload.headline?.trim()),
    description: Boolean(payload.description?.trim()),
    url: Boolean((payload.link || payload.detailUrl || '').trim()),
    cta: Boolean((payload.ctaType || payload.cta || '').trim()),
    catalog: Boolean(ids.catalogId),
    selectedProducts: dto.selectedProductIds?.length ?? 0,
    pageId: Boolean(row?.pageId?.trim() || process.env.FACEBOOK_PAGE_ID?.trim()),
    dataset: Boolean(ids.datasetId || ids.pixelId),
    pixel: Boolean(ids.pixelId || ids.datasetId),
    adAccount: Boolean(ids.adAccountId),
    adsApi: isMarketingAdsTokenActive(row ?? {}),
    readyToPublish: blockers.length === 0,
    failedKeys: [...blockerKeys].join(',') || null,
  };
}
