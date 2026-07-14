import type { MetaCampaignLaunchBlocker } from './meta-campaign-api-payload.util';
import { normalizeCreativeType } from './meta-campaign-creative.util';

export type MetaCampaignModeKey =
  | 'traffic'
  | 'catalog_sales'
  | 'remarketing'
  | 'leads'
  | 'reach'
  | 'video'
  | 'messages';

export type MetaCampaignGoalKey =
  | 'traffic'
  | 'reach'
  | 'lead'
  | 'catalog'
  | 'messages';

export type MetaCreativeSourceKey = ReturnType<typeof normalizeCreativeType>;

export type MetaCampaignPayloadSpec = {
  mode: MetaCampaignModeKey;
  modeLabel: string;
  goalLabel: string;
  creativeSource: MetaCreativeSourceKey;
  campaignObjective: string;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  destinationType: string | null;
  requiresPromotedObject: boolean;
  allowedPromotedObjectKeys: string[];
  usesCatalog: boolean;
  usesPixel: boolean;
  requiresPageId: boolean;
  promotedObjectSummary: string;
};

export type MetaCampaignPayloadContext = {
  goal: string;
  creativeType: string;
  targetingMode: string;
  catalogId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  pageId: string | null;
  instagramActorId?: string | null;
  leadFormId?: string | null;
  remarketingConversionEvent?: 'PURCHASE' | 'VIEW_CONTENT';
  selectedProductIds?: string[];
};

const GOAL_ALIASES: Record<string, MetaCampaignGoalKey> = {
  traffic: 'traffic',
  reach: 'reach',
  lead: 'lead',
  leads: 'lead',
  catalog: 'catalog',
  catalog_sales: 'catalog',
  messages: 'messages',
};

const CATALOG_CREATIVES = new Set<MetaCreativeSourceKey>(['catalog_products']);
const VIDEO_CREATIVES = new Set<MetaCreativeSourceKey>(['custom_video', 'instagram_post']);

const MODE_SPECS: Record<
  MetaCampaignModeKey,
  Omit<MetaCampaignPayloadSpec, 'mode' | 'modeLabel' | 'goalLabel' | 'creativeSource' | 'promotedObjectSummary'>
> = {
  traffic: {
    campaignObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'WEBSITE',
    requiresPromotedObject: false,
    allowedPromotedObjectKeys: [],
    usesCatalog: false,
    usesPixel: false,
    requiresPageId: false,
  },
  catalog_sales: {
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'WEBSITE',
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['pixel_id', 'custom_event_type', 'product_catalog_id', 'page_id'],
    usesCatalog: true,
    usesPixel: true,
    requiresPageId: true,
  },
  remarketing: {
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'WEBSITE',
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['pixel_id', 'custom_event_type', 'page_id'],
    usesCatalog: false,
    usesPixel: true,
    requiresPageId: true,
  },
  leads: {
    campaignObjective: 'OUTCOME_LEADS',
    optimizationGoal: 'LEAD_GENERATION',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'ON_AD',
    requiresPromotedObject: false,
    allowedPromotedObjectKeys: ['page_id', 'lead_gen_form_id'],
    usesCatalog: false,
    usesPixel: false,
    requiresPageId: true,
  },
  reach: {
    campaignObjective: 'OUTCOME_AWARENESS',
    optimizationGoal: 'REACH',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: null,
    requiresPromotedObject: false,
    allowedPromotedObjectKeys: [],
    usesCatalog: false,
    usesPixel: false,
    requiresPageId: false,
  },
  video: {
    campaignObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'THRUPLAY',
    billingEvent: 'THRUPLAY',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: null,
    requiresPromotedObject: false,
    allowedPromotedObjectKeys: [],
    usesCatalog: false,
    usesPixel: false,
    requiresPageId: false,
  },
  messages: {
    campaignObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'CONVERSATIONS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'MESSENGER',
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['page_id'],
    usesCatalog: false,
    usesPixel: false,
    requiresPageId: true,
  },
};

const MODE_LABELS: Record<MetaCampaignModeKey, string> = {
  traffic: 'Návštěvnost',
  catalog_sales: 'Katalogový prodej',
  remarketing: 'Remarketing',
  leads: 'Leady',
  reach: 'Dosah',
  video: 'Video',
  messages: 'Zprávy',
};

const GOAL_LABELS: Record<MetaCampaignGoalKey, string> = {
  traffic: 'Návštěvnost',
  reach: 'Dosah',
  lead: 'Leady',
  catalog: 'Katalogový prodej',
  messages: 'Zprávy',
};

export function normalizeCampaignGoal(goal: string): MetaCampaignGoalKey {
  return GOAL_ALIASES[goal.trim().toLowerCase()] ?? 'traffic';
}

export function normalizeCreativeSource(creativeType: string | undefined): MetaCreativeSourceKey {
  return normalizeCreativeType(creativeType);
}

export function isCatalogCreativeSource(source: MetaCreativeSourceKey): boolean {
  return CATALOG_CREATIVES.has(source);
}

export function isVideoCreativeSource(source: MetaCreativeSourceKey): boolean {
  return VIDEO_CREATIVES.has(source);
}

export function isNonCatalogCreativeSource(source: MetaCreativeSourceKey): boolean {
  return !CATALOG_CREATIVES.has(source);
}

function promotedSummary(mode: MetaCampaignModeKey, leadFormId?: string | null): string {
  switch (mode) {
    case 'catalog_sales':
      return 'Page + Pixel/Dataset + Purchase + Catalog';
    case 'remarketing':
      return 'Page + Pixel/Dataset + ViewContent/Purchase';
    case 'leads':
      return leadFormId ? 'Page + Lead Form' : 'Page';
    case 'messages':
      return 'Page (Messenger)';
    default:
      return '—';
  }
}

export function resolveMetaCampaignMode(input: {
  goal: string;
  creativeType: string | undefined;
  targetingMode: string | undefined;
}): { mode: MetaCampaignModeKey | null; blockers: MetaCampaignLaunchBlocker[] } {
  const goal = normalizeCampaignGoal(input.goal);
  const creative = normalizeCreativeSource(input.creativeType);
  const targeting = input.targetingMode ?? 'map';
  const blockers: MetaCampaignLaunchBlocker[] = [];

  if (isCatalogCreativeSource(creative) && goal !== 'catalog') {
    blockers.push({
      key: 'invalid_combo_catalog_creative_goal',
      message: `Neplatná kombinace: Katalogové produkty + ${GOAL_LABELS[goal]} — zvolte cíl Katalogový prodej.`,
    });
  }

  if (goal === 'catalog' && !isCatalogCreativeSource(creative)) {
    blockers.push({
      key: 'invalid_combo_catalog_goal_creative',
      message:
        'Neplatná kombinace: cíl Katalogový prodej vyžaduje zdroj kreativy Katalogové produkty.',
    });
  }

  if (
    isNonCatalogCreativeSource(creative) &&
    !isVideoCreativeSource(creative) &&
    goal === 'catalog'
  ) {
    blockers.push({
      key: 'invalid_combo_non_catalog',
      message: `Neplatná kombinace: zdroj „${creative}" nelze použít s katalogovým prodejem.`,
    });
  }

  if (blockers.length) {
    return { mode: null, blockers };
  }

  if (isCatalogCreativeSource(creative) || goal === 'catalog') {
    return { mode: 'catalog_sales', blockers: [] };
  }

  if (isVideoCreativeSource(creative)) {
    return { mode: 'video', blockers: [] };
  }

  if (targeting === 'remarketing' || targeting === 'map_remarketing') {
    return { mode: 'remarketing', blockers: [] };
  }

  switch (goal) {
    case 'reach':
      return { mode: 'reach', blockers: [] };
    case 'lead':
      return { mode: 'leads', blockers: [] };
    case 'messages':
      return { mode: 'messages', blockers: [] };
    case 'traffic':
    default:
      return { mode: 'traffic', blockers: [] };
  }
}

export function getMetaCampaignPayloadSpec(
  mode: MetaCampaignModeKey,
  ctx: Pick<MetaCampaignPayloadContext, 'goal' | 'creativeType' | 'leadFormId'>,
): MetaCampaignPayloadSpec {
  const base = MODE_SPECS[mode];
  const goal = normalizeCampaignGoal(ctx.goal);
  const creative = normalizeCreativeSource(ctx.creativeType);
  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    goalLabel: GOAL_LABELS[goal],
    creativeSource: creative,
    promotedObjectSummary: promotedSummary(mode, ctx.leadFormId),
    ...base,
  };
}

export function resolveMetaCampaignPayloadSpec(
  ctx: MetaCampaignPayloadContext,
): { ok: true; spec: MetaCampaignPayloadSpec } | { ok: false; blockers: MetaCampaignLaunchBlocker[] } {
  const resolved = resolveMetaCampaignMode({
    goal: ctx.goal,
    creativeType: ctx.creativeType,
    targetingMode: ctx.targetingMode,
  });
  if (!resolved.mode) {
    return { ok: false, blockers: resolved.blockers };
  }
  const spec = getMetaCampaignPayloadSpec(resolved.mode, ctx);
  const blockers = validateMetaCampaignPayloadContext(ctx, spec);
  if (blockers.length) {
    return { ok: false, blockers };
  }
  return { ok: true, spec };
}

export function buildPromotedObjectForSpec(
  spec: MetaCampaignPayloadSpec,
  ctx: MetaCampaignPayloadContext,
): Record<string, unknown> | null {
  const pixelId = ctx.pixelId?.trim() || ctx.datasetId?.trim() || null;
  const catalogId = ctx.catalogId?.replace(/^catalog_/i, '') ?? null;

  const pageId = ctx.pageId?.trim() || null;

  if (spec.mode === 'catalog_sales') {
    if (!pixelId || !catalogId || !pageId) return null;
    return {
      page_id: pageId,
      pixel_id: pixelId,
      custom_event_type: 'PURCHASE',
      product_catalog_id: catalogId,
    };
  }

  if (spec.mode === 'remarketing') {
    if (!pixelId || !pageId) return null;
    return {
      page_id: pageId,
      pixel_id: pixelId,
      custom_event_type: ctx.remarketingConversionEvent ?? 'VIEW_CONTENT',
    };
  }

  if (spec.mode === 'leads') {
    const leadFormId = ctx.leadFormId?.trim();
    if (!pageId) return null;
    if (leadFormId) {
      return {
        page_id: pageId,
        lead_gen_form_id: leadFormId,
      };
    }
    return { page_id: pageId };
  }

  if (spec.mode === 'messages') {
    if (!pageId) return null;
    return { page_id: pageId };
  }

  if (!spec.requiresPromotedObject) {
    return null;
  }

  return null;
}

function parsePromotedObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function formatInvalidCombinationMessage(parts: {
  campaignObjective?: string;
  optimizationGoal?: string;
  promotedObject?: Record<string, unknown> | null;
  creativeSource?: string;
}): string {
  const promotedKeys = parts.promotedObject ? Object.keys(parts.promotedObject) : [];
  const promotedLabel =
    promotedKeys.length > 0
      ? promotedKeys.join(' + ')
      : parts.promotedObject
        ? JSON.stringify(parts.promotedObject)
        : '—';
  return `Neplatná kombinace: ${parts.campaignObjective ?? '?'} + ${parts.optimizationGoal ?? '?'} + ${promotedLabel}${parts.creativeSource ? ` (kreativa: ${parts.creativeSource})` : ''}.`;
}

export function validateMetaCampaignPayloadContext(
  ctx: MetaCampaignPayloadContext,
  spec: MetaCampaignPayloadSpec,
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const pixelId = ctx.pixelId?.trim() || ctx.datasetId?.trim() || null;

  if (spec.usesCatalog && !ctx.catalogId?.trim()) {
    blockers.push({ key: 'catalog_id', message: 'Chybí Catalog ID pro katalogovou kampaň.' });
  }

  if (spec.usesPixel && !pixelId) {
    blockers.push({ key: 'pixel_id', message: 'Chybí Pixel/Dataset ID.' });
  }

  if (
    spec.mode === 'catalog_sales' &&
    (!ctx.selectedProductIds?.length || ctx.selectedProductIds.length === 0)
  ) {
    blockers.push({
      key: 'selected_products',
      message: 'Katalogová kampaň vyžaduje vybrané produkty nebo Product Set.',
    });
  }

  if (spec.requiresPageId && !ctx.pageId?.trim()) {
    blockers.push({
      key: 'page_id',
      message: `Chybí Facebook Page ID pro režim ${spec.modeLabel}.`,
    });
  }

  if (spec.mode === 'leads' && ctx.leadFormId?.trim() && !ctx.pageId?.trim()) {
    blockers.push({
      key: 'lead_form_page',
      message: 'Pro Lead Form chybí Facebook Page ID.',
    });
  }

  if (
    (ctx.targetingMode === 'remarketing' || ctx.targetingMode === 'map_remarketing') &&
    spec.mode !== 'remarketing' &&
    isCatalogCreativeSource(normalizeCreativeSource(ctx.creativeType))
  ) {
    blockers.push({
      key: 'remarketing_catalog',
      message: 'Remarketing s katalogovou kreativou vyžaduje režim Katalogový prodej.',
    });
  }

  return blockers;
}

export function validateAdSetPayloadCombination(
  payload: Record<string, unknown>,
  spec: MetaCampaignPayloadSpec,
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const promoted = parsePromotedObject(payload.promoted_object);
  const objective = String(spec.campaignObjective);
  const optimizationGoal = String(payload.optimization_goal ?? '');
  const billingEvent = String(payload.billing_event ?? '');

  if (optimizationGoal !== spec.optimizationGoal) {
    blockers.push({
      key: 'adset.optimization_goal',
      message: `Neplatná kombinace: ${objective} + ${optimizationGoal} — očekáváno ${spec.optimizationGoal}.`,
    });
  }

  if (billingEvent && billingEvent !== spec.billingEvent) {
    blockers.push({
      key: 'adset.billing_event',
      message: `Neplatná kombinace: billing_event „${billingEvent}" — očekáváno „${spec.billingEvent}".`,
    });
  }

  if (
    objective === 'OUTCOME_SALES' &&
    optimizationGoal === 'LINK_CLICKS' &&
    promoted?.product_catalog_id
  ) {
    blockers.push({
      key: 'invalid_combo_sales_link_catalog',
      message: formatInvalidCombinationMessage({
        campaignObjective: 'OUTCOME_SALES',
        optimizationGoal: 'LINK_CLICKS',
        promotedObject: promoted,
        creativeSource: spec.creativeSource,
      }),
    });
  }

  if (!spec.requiresPromotedObject && promoted && Object.keys(promoted).length > 0) {
    blockers.push({
      key: 'adset.promoted_object_forbidden',
      message: formatInvalidCombinationMessage({
        campaignObjective: spec.campaignObjective,
        optimizationGoal: spec.optimizationGoal,
        promotedObject: promoted,
        creativeSource: spec.creativeSource,
      }),
    });
  }

  if (spec.requiresPromotedObject && !promoted) {
    blockers.push({
      key: 'adset.promoted_object_required',
      message: `Ad set: chybí promoted_object (${spec.promotedObjectSummary}).`,
    });
  }

  if (promoted) {
    for (const key of Object.keys(promoted)) {
      if (!spec.allowedPromotedObjectKeys.includes(key)) {
        blockers.push({
          key: `adset.promoted_object.${key}`,
          message: formatInvalidCombinationMessage({
            campaignObjective: spec.campaignObjective,
            optimizationGoal: spec.optimizationGoal,
            promotedObject: promoted,
            creativeSource: spec.creativeSource,
          }),
        });
      }
    }

    if (promoted.product_catalog_id && !spec.usesCatalog) {
      blockers.push({
        key: 'adset.product_catalog_forbidden',
        message: formatInvalidCombinationMessage({
          campaignObjective: spec.campaignObjective,
          optimizationGoal: spec.optimizationGoal,
          promotedObject: promoted,
          creativeSource: spec.creativeSource,
        }),
      });
    }
  }

  return blockers;
}

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

export type MetaAdSetPayloadNormalization = {
  payload: Record<string, unknown>;
  promotedObject: Record<string, unknown> | null;
  corrections: string[];
};

export function normalizeTargetingForMetaV25(
  targeting: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ...targeting };
  const automation =
    base.targeting_automation && typeof base.targeting_automation === 'object'
      ? { ...(base.targeting_automation as Record<string, unknown>) }
      : {};
  if (automation.advantage_audience === undefined) {
    automation.advantage_audience = 0;
  }
  return {
    ...base,
    targeting_automation: automation,
  };
}

export function isEuGeoTargeting(targeting: Record<string, unknown>): boolean {
  const geoLocations = targeting.geo_locations;
  if (!geoLocations || typeof geoLocations !== 'object') {
    return true;
  }
  const geo = geoLocations as Record<string, unknown>;
  const countries = geo.countries;
  if (Array.isArray(countries)) {
    return countries.some((c) => typeof c === 'string' && EU_COUNTRY_CODES.has(c.toUpperCase()));
  }
  if (Array.isArray(geo.cities) && geo.cities.length > 0) {
    return true;
  }
  if (Array.isArray(geo.custom_locations) && geo.custom_locations.length > 0) {
    return true;
  }
  if (Array.isArray(geo.regions) && geo.regions.length > 0) {
    return true;
  }
  return true;
}

export function resolveDsaDisclosureLabels(input: {
  pageName?: string | null;
  adAccountName?: string | null;
  campaignName?: string | null;
}): { beneficiary: string; payor: string } | null {
  const label =
    input.pageName?.trim() ||
    input.adAccountName?.trim() ||
    input.campaignName?.trim() ||
    null;
  if (!label) return null;
  const clipped = label.slice(0, 512);
  return { beneficiary: clipped, payor: clipped };
}

export function normalizeAdSetPayloadForMetaV25(input: {
  payload: Record<string, unknown>;
  spec: MetaCampaignPayloadSpec;
  payloadContext: MetaCampaignPayloadContext;
  targeting: Record<string, unknown>;
  dsaLabels?: { beneficiary: string; payor: string } | null;
}): MetaAdSetPayloadNormalization {
  const corrections: string[] = [];
  const payload = { ...input.payload };
  const targeting = normalizeTargetingForMetaV25(input.targeting);
  payload.targeting = JSON.stringify(targeting);

  if (payload.optimization_goal !== input.spec.optimizationGoal) {
    corrections.push(
      `optimization_goal ${String(payload.optimization_goal)} → ${input.spec.optimizationGoal}`,
    );
    payload.optimization_goal = input.spec.optimizationGoal;
  }

  if (payload.billing_event !== input.spec.billingEvent) {
    corrections.push(`billing_event ${String(payload.billing_event)} → ${input.spec.billingEvent}`);
    payload.billing_event = input.spec.billingEvent;
  }

  if (payload.bid_strategy !== input.spec.bidStrategy) {
    corrections.push(`bid_strategy ${String(payload.bid_strategy)} → ${input.spec.bidStrategy}`);
    payload.bid_strategy = input.spec.bidStrategy;
  }

  if (input.spec.destinationType) {
    if (payload.destination_type !== input.spec.destinationType) {
      corrections.push(
        `destination_type ${String(payload.destination_type ?? '—')} → ${input.spec.destinationType}`,
      );
      payload.destination_type = input.spec.destinationType;
    }
  } else if (payload.destination_type) {
    corrections.push(`destination_type odstraněno (režim ${input.spec.mode} ho nevyžaduje)`);
    delete payload.destination_type;
  }

  let promotedObject = buildPromotedObjectForSpec(input.spec, input.payloadContext);
  const parsedPromoted = parsePromotedObject(payload.promoted_object);
  if (parsedPromoted && promotedObject) {
    for (const [key, value] of Object.entries(promotedObject)) {
      if (parsedPromoted[key] !== value) {
        corrections.push(`promoted_object.${key} → ${JSON.stringify(value)}`);
      }
    }
  } else if (parsedPromoted && !promotedObject && input.spec.requiresPromotedObject) {
    corrections.push('promoted_object přepočítán podle režimu kampaně');
  }
  if (promotedObject) {
    payload.promoted_object = JSON.stringify(promotedObject);
  } else if (input.spec.requiresPromotedObject) {
    payload.promoted_object = undefined;
  } else {
    delete payload.promoted_object;
    promotedObject = null;
  }

  if (isEuGeoTargeting(targeting) && input.dsaLabels) {
    if (payload.dsa_beneficiary !== input.dsaLabels.beneficiary) {
      corrections.push(`dsa_beneficiary → ${input.dsaLabels.beneficiary}`);
      payload.dsa_beneficiary = input.dsaLabels.beneficiary;
    }
    if (payload.dsa_payor !== input.dsaLabels.payor) {
      corrections.push(`dsa_payor → ${input.dsaLabels.payor}`);
      payload.dsa_payor = input.dsaLabels.payor;
    }
  }

  if (!targeting.targeting_automation) {
    corrections.push('targeting_automation.advantage_audience → 0');
  }

  return { payload, promotedObject, corrections };
}

export function buildMetaLaunchGraphPaths(actId: string): Record<
  'campaign' | 'adSet' | 'creative' | 'ad',
  string
> {
  const account = actId.replace(/^act_/, '');
  return {
    campaign: `/act_${account}/campaigns`,
    adSet: `/act_${account}/adsets`,
    creative: `/act_${account}/adcreatives`,
    ad: `/act_${account}/ads`,
  };
}

export function serializePayloadForMetaApi(
  payload: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') {
      out[k] = v ? 'true' : 'false';
    } else if (typeof v === 'string') {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

export function extractLeadFormId(dto: {
  creativePayload?: Record<string, unknown>;
  leadFormId?: string;
}): string | null {
  if (dto.leadFormId?.trim()) return dto.leadFormId.trim();
  const cp = dto.creativePayload;
  if (!cp) return null;
  const raw = cp.leadFormId ?? cp.lead_gen_form_id;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** @deprecated použijte resolveMetaCampaignPayloadSpec */
export function mapCampaignObjectiveToMeta(goal: string): string {
  const resolved = resolveMetaCampaignMode({
    goal,
    creativeType: goal === 'catalog' ? 'catalog_products' : 'listing',
    targetingMode: 'map',
  });
  if (!resolved.mode) {
    return MODE_SPECS.traffic.campaignObjective;
  }
  return MODE_SPECS[resolved.mode].campaignObjective;
}
