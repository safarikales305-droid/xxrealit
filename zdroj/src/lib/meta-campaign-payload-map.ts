export type MetaCampaignModeKey =
  | 'traffic'
  | 'catalog_sales'
  | 'catalog_traffic'
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

export type MetaCreativeSourceKey =
  | 'catalog_products'
  | 'listing'
  | 'public_post'
  | 'facebook_post'
  | 'instagram_post'
  | 'custom_image'
  | 'custom_video'
  | 'social_post'
  | 'custom_creative';

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
  advantageAudience: 0 | 1;
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
  catalogId?: string | null;
  pixelId?: string | null;
  datasetId?: string | null;
  pageId?: string | null;
  leadFormId?: string | null;
  remarketingConversionEvent?: 'PURCHASE' | 'VIEW_CONTENT';
  selectedProductIds?: string[];
  catalogLaunchMode?: 'sales' | 'traffic';
};

export const CATALOG_TRAFFIC_FALLBACK_MESSAGE =
  'Purchase Event nebyl nalezen. Automaticky použita katalogová návštěvnost.';

export type MetaCampaignPayloadBlocker = {
  key: string;
  message: string;
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
  Omit<
    MetaCampaignPayloadSpec,
    'mode' | 'modeLabel' | 'goalLabel' | 'creativeSource' | 'promotedObjectSummary'
  >
> = {
  traffic: {
    campaignObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'WEBSITE',
    advantageAudience: 0,
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
    destinationType: 'SHOP_AUTOMATIC',
    advantageAudience: 1,
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['product_catalog_id', 'pixel_id', 'custom_event_type'],
    usesCatalog: true,
    usesPixel: true,
    requiresPageId: true,
  },
  catalog_traffic: {
    campaignObjective: 'OUTCOME_AWARENESS',
    optimizationGoal: 'REACH',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'SHOP_AUTOMATIC',
    advantageAudience: 1,
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['product_catalog_id'],
    usesCatalog: true,
    usesPixel: false,
    requiresPageId: true,
  },
  remarketing: {
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    billingEvent: 'IMPRESSIONS',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    destinationType: 'WEBSITE',
    advantageAudience: 0,
    requiresPromotedObject: true,
    allowedPromotedObjectKeys: ['pixel_id', 'custom_event_type'],
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
    advantageAudience: 0,
    requiresPromotedObject: true,
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
    advantageAudience: 1,
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
    advantageAudience: 0,
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
    advantageAudience: 0,
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
  catalog_traffic: 'Katalogová návštěvnost',
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
  if (creativeType === 'social_post') return 'facebook_post';
  if (creativeType === 'custom_creative') return 'custom_image';
  const allowed: MetaCreativeSourceKey[] = [
    'catalog_products',
    'listing',
    'public_post',
    'facebook_post',
    'instagram_post',
    'custom_image',
    'custom_video',
    'social_post',
    'custom_creative',
  ];
  if (creativeType && (allowed as string[]).includes(creativeType)) {
    return creativeType as MetaCreativeSourceKey;
  }
  return 'catalog_products';
}

export function isCatalogCreativeSource(source: MetaCreativeSourceKey): boolean {
  return CATALOG_CREATIVES.has(source);
}

export function isVideoCreativeSource(source: MetaCreativeSourceKey): boolean {
  return VIDEO_CREATIVES.has(source);
}

export function isGoalCompatibleWithCreative(
  goal: string,
  creativeType: string,
): boolean {
  const g = normalizeCampaignGoal(goal);
  const creative = normalizeCreativeSource(creativeType);
  if (isCatalogCreativeSource(creative)) return g === 'catalog';
  if (g === 'catalog') return false;
  return true;
}

function promotedSummary(mode: MetaCampaignModeKey, leadFormId?: string | null): string {
  switch (mode) {
    case 'catalog_sales':
      return 'Pixel/Dataset + Purchase + Catalog';
    case 'catalog_traffic':
      return 'Catalog + REACH (bez Purchase Event)';
    case 'remarketing':
      return 'Pixel/Dataset + ViewContent/Purchase';
    case 'leads':
      return leadFormId ? 'Page + Lead Form' : '—';
    default:
      return '—';
  }
}

export function resolveMetaCampaignMode(input: {
  goal: string;
  creativeType: string | undefined;
  targetingMode: string | undefined;
}): { mode: MetaCampaignModeKey | null; blockers: MetaCampaignPayloadBlocker[] } {
  const goal = normalizeCampaignGoal(input.goal);
  const creative = normalizeCreativeSource(input.creativeType);
  const targeting = input.targetingMode ?? 'map';
  const blockers: MetaCampaignPayloadBlocker[] = [];

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

export function validateMetaCampaignPayloadContext(
  ctx: MetaCampaignPayloadContext,
  spec: MetaCampaignPayloadSpec,
): MetaCampaignPayloadBlocker[] {
  const blockers: MetaCampaignPayloadBlocker[] = [];
  const pixelId = ctx.pixelId?.trim() || ctx.datasetId?.trim() || null;

  if (spec.usesCatalog && !ctx.catalogId?.trim()) {
    blockers.push({ key: 'catalog_id', message: 'Chybí Catalog ID pro katalogovou kampaň.' });
  }

  if (spec.usesPixel && !pixelId) {
    blockers.push({ key: 'pixel_id', message: 'Chybí Pixel/Dataset ID.' });
  }

  if (
    (spec.mode === 'catalog_sales' || spec.mode === 'catalog_traffic') &&
    (!ctx.selectedProductIds?.length || ctx.selectedProductIds.length === 0)
  ) {
    blockers.push({
      key: 'selected_products',
      message: 'Katalogová kampaň vyžaduje vybrané produkty nebo Product Set.',
    });
  }

  return blockers;
}

export function resolveMetaCampaignPayloadSpec(
  ctx: MetaCampaignPayloadContext,
):
  | { ok: true; spec: MetaCampaignPayloadSpec }
  | { ok: false; blockers: MetaCampaignPayloadBlocker[]; spec: MetaCampaignPayloadSpec | null } {
  const resolved = resolveMetaCampaignMode({
    goal: ctx.goal,
    creativeType: ctx.creativeType,
    targetingMode: ctx.targetingMode,
  });
  if (!resolved.mode) {
    return { ok: false, blockers: resolved.blockers, spec: null };
  }
  const mode =
    resolved.mode === 'catalog_sales' && ctx.catalogLaunchMode === 'traffic'
      ? 'catalog_traffic'
      : resolved.mode;
  const spec = getMetaCampaignPayloadSpec(mode, ctx);
  const blockers = validateMetaCampaignPayloadContext(ctx, spec);
  if (blockers.length) {
    return { ok: false, blockers, spec };
  }
  return { ok: true, spec };
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

export const META_UNSUPPORTED_COMBINATION_MESSAGE =
  'Nepodporovaná kombinace parametrů Meta API.';

export type MetaCampaignCombinationDiagnostics = {
  goalLabel: string;
  mode: MetaCampaignModeKey | null;
  objective: string;
  optimizationGoal: string;
  creativeType: string;
  destinationType: string | null;
  promotedObjectSummary: string;
  validationOk: boolean;
  violations: Array<{ param: string; rule: string }>;
};

export function validateMetaCampaignCombination(input: {
  spec: MetaCampaignPayloadSpec;
  ctx: MetaCampaignPayloadContext;
}): MetaCampaignPayloadBlocker[] {
  const { spec, ctx } = input;
  const blockers: MetaCampaignPayloadBlocker[] = [];
  const objective = spec.campaignObjective;
  const creative = spec.creativeSource;
  const isCatalogCreative = creative === 'catalog_products';
  const pixelId = ctx.pixelId?.trim() || ctx.datasetId?.trim() || null;

  if (objective === 'OUTCOME_TRAFFIC') {
    if (isCatalogCreative) {
      blockers.push({
        key: 'combo.traffic.catalog_creative',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (creative: OUTCOME_TRAFFIC nesmí používat catalog_products)`,
      });
    }
    if (ctx.catalogId?.trim()) {
      blockers.push({
        key: 'combo.traffic.product_catalog_id',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (promoted_object.product_catalog_id: OUTCOME_TRAFFIC nesmí obsahovat product_catalog_id)`,
      });
    }
  }

  if (objective === 'OUTCOME_SALES' && spec.mode === 'catalog_sales') {
    if (!isCatalogCreative) {
      blockers.push({
        key: 'combo.sales.creative_required',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (creative: vyžadováno catalog_products)`,
      });
    }
    if (spec.optimizationGoal !== 'OFFSITE_CONVERSIONS') {
      blockers.push({
        key: 'combo.sales.optimization_goal',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (optimization_goal: vyžadováno OFFSITE_CONVERSIONS)`,
      });
    }
    if (!pixelId) {
      blockers.push({
        key: 'combo.sales.pixel_id',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (promoted_object.pixel_id: vyžadován Pixel/Event Source)`,
      });
    }
    if (!ctx.catalogId?.trim()) {
      blockers.push({
        key: 'combo.sales.product_catalog_id',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (promoted_object.product_catalog_id: vyžadován katalog)`,
      });
    }
  }

  if (
    (objective === 'OUTCOME_LEADS' ||
      objective === 'OUTCOME_ENGAGEMENT' ||
      (objective === 'OUTCOME_AWARENESS' && spec.mode !== 'catalog_traffic')) &&
    isCatalogCreative
  ) {
    blockers.push({
      key: `combo.${objective}.catalog_creative`,
      message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (creative: ${objective} nesmí používat catalog_products)`,
    });
  }

  return blockers;
}

export function buildCombinationDiagnostics(input: {
  spec: MetaCampaignPayloadSpec;
  ctx: MetaCampaignPayloadContext;
  blockers?: MetaCampaignPayloadBlocker[];
}): MetaCampaignCombinationDiagnostics {
  const blockers =
    input.blockers ?? validateMetaCampaignCombination({ spec: input.spec, ctx: input.ctx });
  return {
    goalLabel: input.spec.goalLabel,
    mode: input.spec.mode,
    objective: input.spec.campaignObjective,
    optimizationGoal: input.spec.optimizationGoal,
    creativeType: input.spec.creativeSource,
    destinationType: input.spec.destinationType,
    promotedObjectSummary: input.spec.promotedObjectSummary,
    validationOk: blockers.length === 0,
    violations: blockers.map((b) => ({
      param: b.key,
      rule: b.message,
    })),
  };
}

export function migrateInvalidDraftCombination(input: {
  goal: string;
  creativeType: string;
  storedObjective?: string | null;
}): {
  migrated: boolean;
  warning: string | null;
  goal: string;
  creativeType: string;
} {
  const creative = input.creativeType?.trim() || 'catalog_products';
  const goal = input.goal?.trim() || 'traffic';
  const isCatalogCreative = creative === 'catalog_products';
  const invalidTrafficCatalog =
    (goal === 'traffic' && isCatalogCreative) ||
    input.storedObjective === 'OUTCOME_TRAFFIC';

  if (!invalidTrafficCatalog || !isCatalogCreative) {
    return { migrated: false, warning: null, goal, creativeType: creative };
  }

  return {
    migrated: true,
    warning: 'Koncept byl automaticky upraven podle aktuálních pravidel Meta.',
    goal: 'catalog',
    creativeType: 'catalog_products',
  };
}
