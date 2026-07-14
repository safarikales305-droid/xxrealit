import type { MetaCampaignLaunchBlocker } from './meta-campaign-api-payload.util';
import { normalizeTargetingForMetaV25 } from './meta-campaign-payload-map.util';

export const META_CATALOG_CONVERSION_LOCATION = 'WEBSITE';
export const META_UNSUPPORTED_DESTINATION_TYPE_MESSAGE = 'Unsupported Meta field: destination_type';

const DEPRECATED_DESTINATION_TYPES = new Set([
  'SHOP_AUTOMATIC',
  'SHOP',
  'WEBSITE_AND_SHOP',
  'COMMERCE',
]);

export type CatalogAdSetBuildInput = {
  campaignId: string;
  adSetName: string;
  publishStatus: 'ACTIVE' | 'PAUSED';
  dailyBudgetMinor: number;
  targeting: Record<string, unknown>;
  catalogId: string;
  pixelId: string;
  dsaLabels: { beneficiary: string; payor: string };
  isAdsetBudgetSharingEnabled: boolean;
  advantageAudience?: 0 | 1;
  startTime?: string;
  endTime?: string;
};

export type CatalogAdSetBuildResult = {
  payload: Record<string, unknown>;
  promotedObject: Record<string, unknown>;
  conversionLocation: typeof META_CATALOG_CONVERSION_LOCATION;
};

export function normalizeCatalogIdForMeta(catalogId: string): string {
  return catalogId.replace(/^catalog_/i, '').trim();
}

export function buildCatalogSalesPromotedObject(input: {
  catalogId: string;
  pixelId: string;
  customEventType?: string;
}): Record<string, unknown> {
  return {
    pixel_id: input.pixelId.trim(),
    custom_event_type: input.customEventType ?? 'PURCHASE',
    catalog_id: normalizeCatalogIdForMeta(input.catalogId),
  };
}

/**
 * Centrální builder Catalog Sales Ad Set podle Meta Marketing API v25.
 * Bez destination_type / SHOP_AUTOMATIC — conversion location je WEBSITE.
 */
export function buildCatalogAdSet(input: CatalogAdSetBuildInput): CatalogAdSetBuildResult {
  const targeting = normalizeTargetingForMetaV25(
    input.targeting,
    input.advantageAudience ?? 1,
  );
  const promotedObject = buildCatalogSalesPromotedObject({
    catalogId: input.catalogId,
    pixelId: input.pixelId,
    customEventType: 'PURCHASE',
  });

  const payload: Record<string, unknown> = {
    name: input.adSetName,
    campaign_id: input.campaignId,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(input.dailyBudgetMinor),
    status: input.publishStatus,
    is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
    dsa_beneficiary: input.dsaLabels.beneficiary,
    dsa_payor: input.dsaLabels.payor,
    targeting: JSON.stringify(targeting),
    promoted_object: JSON.stringify(promotedObject),
    ...(input.startTime ? { start_time: input.startTime } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {}),
  };

  return {
    payload,
    promotedObject,
    conversionLocation: META_CATALOG_CONVERSION_LOCATION,
  };
}

export function stripUnsupportedDestinationType(
  payload: Record<string, unknown>,
): { payload: Record<string, unknown>; removed: string | null } {
  if (!('destination_type' in payload)) {
    return { payload, removed: null };
  }
  const removed = String(payload.destination_type ?? '');
  const copy = { ...payload };
  delete copy.destination_type;
  return { payload: copy, removed: removed || '(empty)' };
}

export function validateUnsupportedDestinationType(
  payload: Record<string, unknown>,
): MetaCampaignLaunchBlocker[] {
  const destinationType = payload.destination_type;
  if (destinationType === undefined || destinationType === null || destinationType === '') {
    return [];
  }
  const value = String(destinationType);
  const deprecated = DEPRECATED_DESTINATION_TYPES.has(value) || value.includes('SHOP');
  return [
    {
      key: 'adset.destination_type.unsupported',
      message: deprecated
        ? `${META_UNSUPPORTED_DESTINATION_TYPE_MESSAGE} (${value}). Kampaně Web + Shop / Shop Automatic už Meta nepodporuje.`
        : `${META_UNSUPPORTED_DESTINATION_TYPE_MESSAGE} (${value}).`,
    },
  ];
}

export function promotedObjectHasDeprecatedCatalogField(
  promoted: Record<string, unknown> | null | undefined,
): boolean {
  if (!promoted) return false;
  return promoted.product_catalog_id != null && promoted.catalog_id == null;
}
