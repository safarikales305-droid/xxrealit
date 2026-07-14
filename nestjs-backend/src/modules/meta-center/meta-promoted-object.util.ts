import type { MetaCampaignPayloadContext, MetaCampaignPayloadSpec } from './meta-campaign-payload-map.util';

export type PromotedObjectBuildInput = {
  campaignObjective: string;
  optimizationGoal: string;
  creativeSource?: string;
  catalogId?: string | null;
  pixelId?: string | null;
  datasetId?: string | null;
  customEventType?: string | null;
  pageId?: string | null;
  leadFormId?: string | null;
};

export function resolvePromotedObjectPixelId(input: PromotedObjectBuildInput): string | null {
  return input.pixelId?.trim() || input.datasetId?.trim() || null;
}

function normalizeCatalogId(catalogId?: string | null): string | null {
  const id = catalogId?.replace(/^catalog_/i, '')?.trim();
  return id || null;
}

/** Meta error 1815229: product_catalog_id není podporován u WEBSITE_CONVERSIONS / REACH / TRAFFIC / AWARENESS. */
export function promotedObjectForbidsCatalogId(input: {
  campaignObjective: string;
  optimizationGoal: string;
}): boolean {
  const { campaignObjective, optimizationGoal } = input;
  if (optimizationGoal === 'WEBSITE_CONVERSIONS') return true;
  if (optimizationGoal === 'REACH') return true;
  if (campaignObjective === 'OUTCOME_TRAFFIC') return true;
  if (campaignObjective === 'OUTCOME_AWARENESS') return true;
  return false;
}

export function catalogSalesRequiresCatalogId(input: {
  campaignObjective: string;
  creativeSource?: string;
}): boolean {
  return (
    input.campaignObjective === 'OUTCOME_SALES' && input.creativeSource === 'catalog_products'
  );
}

/**
 * Centrální builder promoted_object podle objective a optimization goal.
 * Nikdy neskládej promoted_object ručně na více místech — vždy volej tuto funkci.
 */
export function buildPromotedObject(
  input: PromotedObjectBuildInput,
): Record<string, unknown> | null {
  const objective = input.campaignObjective;
  const optimizationGoal = input.optimizationGoal;
  const pixelId = resolvePromotedObjectPixelId(input);
  const catalogId = normalizeCatalogId(input.catalogId);
  const isCatalogCreative = input.creativeSource === 'catalog_products';
  const pageId = input.pageId?.trim() || null;
  const customEventType = input.customEventType ?? 'PURCHASE';

  if (optimizationGoal === 'WEBSITE_CONVERSIONS') {
    if (!pixelId) return null;
    return {
      pixel_id: pixelId,
      custom_event_type: customEventType,
    };
  }

  if (objective === 'OUTCOME_SALES' && isCatalogCreative) {
    if (!catalogId || !pixelId) return null;
    return {
      product_catalog_id: catalogId,
      pixel_id: pixelId,
      custom_event_type: customEventType,
    };
  }

  if (objective === 'OUTCOME_SALES' && optimizationGoal === 'OFFSITE_CONVERSIONS') {
    if (!pixelId) return null;
    return {
      pixel_id: pixelId,
      custom_event_type: input.customEventType ?? 'VIEW_CONTENT',
    };
  }

  if (objective === 'OUTCOME_LEADS') {
    if (!pageId) return null;
    const leadFormId = input.leadFormId?.trim();
    if (leadFormId) {
      return { page_id: pageId, lead_gen_form_id: leadFormId };
    }
    return { page_id: pageId };
  }

  if (objective === 'OUTCOME_ENGAGEMENT' && optimizationGoal === 'CONVERSATIONS') {
    if (!pageId) return null;
    return { page_id: pageId };
  }

  if (
    objective === 'OUTCOME_AWARENESS' ||
    objective === 'OUTCOME_TRAFFIC' ||
    optimizationGoal === 'REACH' ||
    optimizationGoal === 'LINK_CLICKS'
  ) {
    return null;
  }

  return null;
}

export function buildPromotedObjectFromSpec(
  spec: MetaCampaignPayloadSpec,
  ctx: MetaCampaignPayloadContext,
): Record<string, unknown> | null {
  return buildPromotedObject({
    campaignObjective: spec.campaignObjective,
    optimizationGoal: spec.optimizationGoal,
    creativeSource: spec.creativeSource,
    catalogId: ctx.catalogId,
    pixelId: ctx.pixelId,
    datasetId: ctx.datasetId,
    customEventType:
      spec.mode === 'remarketing'
        ? ctx.remarketingConversionEvent ?? 'VIEW_CONTENT'
        : spec.mode === 'catalog_sales'
          ? 'PURCHASE'
          : undefined,
    pageId: ctx.pageId,
    leadFormId: ctx.leadFormId,
  });
}

export function formatPromotedObjectForDebug(
  promoted: Record<string, unknown> | null | undefined,
): string {
  if (!promoted || Object.keys(promoted).length === 0) return '—';
  return JSON.stringify(promoted);
}

export function validatePromotedObjectRules(input: {
  campaignObjective: string;
  optimizationGoal: string;
  creativeSource?: string;
  promotedObject: Record<string, unknown> | null;
}): string[] {
  const errors: string[] = [];
  const promoted = input.promotedObject;
  const hasCatalogId = Boolean(promoted?.product_catalog_id);

  if (hasCatalogId && promotedObjectForbidsCatalogId(input)) {
    errors.push(
      `${input.campaignObjective} + ${input.optimizationGoal} nesmí obsahovat product_catalog_id`,
    );
  }

  if (catalogSalesRequiresCatalogId(input) && !hasCatalogId) {
    errors.push('CATALOG SALES musí obsahovat product_catalog_id');
  }

  if (input.optimizationGoal === 'WEBSITE_CONVERSIONS' && hasCatalogId) {
    errors.push('WEBSITE_CONVERSIONS nesmí obsahovat product_catalog_id');
  }

  return errors;
}
