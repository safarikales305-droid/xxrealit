import type { MetaCampaignLaunchBlocker } from './meta-campaign-api-payload.util';
import {
  buildSupportedCatalogAdSetPayload,
  buildSupportedCatalogTrafficAdSetPayload,
} from './meta-adset-probe.util';
import {
  buildPromotedObject,
  buildPromotedObjectFromSpec,
} from './meta-promoted-object.util';
import {
  buildPromotedObjectForSpec,
  CATALOG_TRAFFIC_FALLBACK_MESSAGE,
  formatInvalidCombinationMessage,
  getMetaCampaignPayloadSpec,
  normalizeAdSetPayloadForMetaV25,
  normalizeTargetingForMetaV25,
  type MetaCampaignModeKey,
  type MetaCampaignPayloadContext,
  type MetaCampaignPayloadSpec,
  validateAdSetPayloadCombination,
} from './meta-campaign-payload-map.util';

export const META_UNSUPPORTED_COMBINATION_MESSAGE =
  'Nepodporovaná kombinace parametrů Meta API.';

export type MetaCampaignCombinationViolation = {
  param: string;
  rule: string;
};

export type MetaCampaignCombinationDiagnostics = {
  goalLabel: string;
  mode: MetaCampaignModeKey | null;
  objective: string;
  optimizationGoal: string;
  creativeType: string;
  destinationType: string | null;
  promotedObjectKeys: string[];
  promotedObjectSummary: string;
  promotedObject: Record<string, unknown> | null;
  catalogLaunchMode?: 'sales' | 'traffic' | null;
  fallbackReason?: string | null;
  validationOk: boolean;
  violations: MetaCampaignCombinationViolation[];
};

export type MetaCampaignBuilderInput = {
  name: string;
  campaignId: string;
  publishStatus: 'ACTIVE' | 'PAUSED';
  dailyBudgetMinor: number;
  useCampaignBudgetOptimization: boolean;
  isAdsetBudgetSharingEnabled: boolean;
  targeting: Record<string, unknown>;
  dsaLabels: { beneficiary: string; payor: string } | null;
  startTime?: string;
  endTime?: string;
  spec: MetaCampaignPayloadSpec;
  payloadContext: MetaCampaignPayloadContext;
};

export type MetaCampaignBuilderResult =
  | {
      ok: true;
      campaignPayload: Record<string, unknown>;
      adSetPayload: Record<string, unknown>;
      promotedObject: Record<string, unknown> | null;
      diagnostics: MetaCampaignCombinationDiagnostics;
    }
  | {
      ok: false;
      blockers: MetaCampaignLaunchBlocker[];
      diagnostics: MetaCampaignCombinationDiagnostics;
      adSetPayload?: Record<string, unknown>;
      promotedObject?: Record<string, unknown> | null;
    };

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

function violationBlocker(
  key: string,
  param: string,
  rule: string,
  spec: MetaCampaignPayloadSpec,
  promotedObject?: Record<string, unknown> | null,
): MetaCampaignLaunchBlocker {
  const detail = formatInvalidCombinationMessage({
    campaignObjective: spec.campaignObjective,
    optimizationGoal: spec.optimizationGoal,
    promotedObject: promotedObject ?? null,
    creativeSource: spec.creativeSource,
  });
  return {
    key,
    message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (${param}: ${rule}). ${detail}`,
  };
}

/** Striktní validační tabulka podporovaných kombinací Meta Marketing API. */
export function validateMetaCampaignCombination(input: {
  spec: MetaCampaignPayloadSpec;
  ctx: MetaCampaignPayloadContext;
  adSetPayload?: Record<string, unknown>;
}): MetaCampaignLaunchBlocker[] {
  const { spec, ctx } = input;
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const objective = spec.campaignObjective;
  const optimizationGoal = spec.optimizationGoal;
  const creative = spec.creativeSource;
  const isCatalogCreative = creative === 'catalog_products';
  const pixelId = ctx.pixelId?.trim() || ctx.datasetId?.trim() || null;

  const adSetPayload = input.adSetPayload ?? {};
  const promoted =
    parsePromotedObject(adSetPayload.promoted_object) ??
    buildPromotedObjectForSpec(spec, ctx);

  if (objective === 'OUTCOME_TRAFFIC') {
    if (isCatalogCreative) {
      blockers.push(
        violationBlocker(
          'combo.traffic.catalog_creative',
          'creative',
          'OUTCOME_TRAFFIC nesmí používat catalog_products',
          spec,
          promoted,
        ),
      );
    }
    if (promoted?.product_catalog_id) {
      blockers.push(
        violationBlocker(
          'combo.traffic.product_catalog_id',
          'promoted_object.product_catalog_id',
          'OUTCOME_TRAFFIC nesmí obsahovat product_catalog_id',
          spec,
          promoted,
        ),
      );
    }
    if (optimizationGoal !== 'LINK_CLICKS') {
      blockers.push(
        violationBlocker(
          'combo.traffic.optimization_goal',
          'optimization_goal',
          `očekáváno LINK_CLICKS, máte ${optimizationGoal}`,
          spec,
          promoted,
        ),
      );
    }
  }

  if (objective === 'OUTCOME_SALES' && spec.mode === 'catalog_sales') {
    if (!isCatalogCreative) {
      blockers.push(
        violationBlocker(
          'combo.sales.creative_required',
          'creative',
          'OUTCOME_SALES (katalog) vyžaduje catalog_products',
          spec,
          promoted,
        ),
      );
    }
    if (optimizationGoal !== 'OFFSITE_CONVERSIONS') {
      blockers.push(
        violationBlocker(
          'combo.sales.optimization_goal',
          'optimization_goal',
          'OUTCOME_SALES vyžaduje OFFSITE_CONVERSIONS',
          spec,
          promoted,
        ),
      );
    }
    if (spec.destinationType !== 'SHOP_AUTOMATIC') {
      blockers.push(
        violationBlocker(
          'combo.sales.destination_type',
          'destination_type',
          'Katalogový prodej vyžaduje SHOP_AUTOMATIC',
          spec,
          promoted,
        ),
      );
    }
    if (!promoted?.product_catalog_id) {
      blockers.push(
        violationBlocker(
          'combo.sales.product_catalog_id',
          'promoted_object.product_catalog_id',
          'Katalogový prodej vyžaduje product_catalog_id',
          spec,
          promoted,
        ),
      );
    }
    if (!promoted?.pixel_id && !pixelId) {
      blockers.push(
        violationBlocker(
          'combo.sales.pixel_id',
          'promoted_object.pixel_id',
          'Katalogový prodej vyžaduje Pixel/Event Source',
          spec,
          promoted,
        ),
      );
    }
  }

  if (spec.mode === 'catalog_traffic') {
    if (!isCatalogCreative) {
      blockers.push(
        violationBlocker(
          'combo.catalog_traffic.creative_required',
          'creative',
          'Katalogová návštěvnost vyžaduje catalog_products',
          spec,
          promoted,
        ),
      );
    }
    if (optimizationGoal !== 'REACH') {
      blockers.push(
        violationBlocker(
          'combo.catalog_traffic.optimization_goal',
          'optimization_goal',
          'Katalogová návštěvnost vyžaduje REACH',
          spec,
          promoted,
        ),
      );
    }
    if (promoted?.product_catalog_id) {
      blockers.push(
        violationBlocker(
          'combo.catalog_traffic.product_catalog_id_forbidden',
          'promoted_object.product_catalog_id',
          'OUTCOME_AWARENESS + REACH nesmí obsahovat product_catalog_id',
          spec,
          promoted,
        ),
      );
    }
    if (promoted?.pixel_id || promoted?.custom_event_type) {
      blockers.push(
        violationBlocker(
          'combo.catalog_traffic.pixel_forbidden',
          'promoted_object.pixel_id',
          'Katalogová návštěvnost nesmí používat Pixel ani Purchase Event v promoted_object',
          spec,
          promoted,
        ),
      );
    }
  }

  if (objective === 'OUTCOME_AWARENESS' && promoted?.product_catalog_id) {
    blockers.push(
      violationBlocker(
        'combo.awareness.product_catalog_id',
        'promoted_object.product_catalog_id',
        'OUTCOME_AWARENESS nesmí obsahovat product_catalog_id',
        spec,
        promoted,
      ),
    );
  }

  if (optimizationGoal === 'REACH' && promoted?.product_catalog_id) {
    blockers.push(
      violationBlocker(
        'combo.reach.product_catalog_id',
        'promoted_object.product_catalog_id',
        'REACH nesmí obsahovat product_catalog_id',
        spec,
        promoted,
      ),
    );
  }

  if (objective === 'OUTCOME_LEADS' && isCatalogCreative) {
    blockers.push(
      violationBlocker(
        'combo.leads.catalog_creative',
        'creative',
        'OUTCOME_LEADS nesmí používat catalog_products',
        spec,
        promoted,
      ),
    );
  }

  if (objective === 'OUTCOME_ENGAGEMENT' && isCatalogCreative) {
    blockers.push(
      violationBlocker(
        'combo.engagement.catalog_creative',
        'creative',
        'OUTCOME_ENGAGEMENT nesmí používat catalog_products',
        spec,
        promoted,
      ),
    );
  }

  if (objective === 'OUTCOME_AWARENESS' && isCatalogCreative && spec.mode !== 'catalog_traffic') {
    blockers.push(
      violationBlocker(
        'combo.reach.catalog_creative',
        'creative',
        'OUTCOME_AWARENESS nesmí používat catalog_products',
        spec,
        promoted,
      ),
    );
  }

  if (adSetPayload && Object.keys(adSetPayload).length > 0) {
    blockers.push(...validateAdSetPayloadCombination(adSetPayload, spec));
  }

  return blockers;
}

export function buildCombinationDiagnostics(input: {
  spec: MetaCampaignPayloadSpec;
  ctx: MetaCampaignPayloadContext;
  adSetPayload?: Record<string, unknown>;
  blockers?: MetaCampaignLaunchBlocker[];
}): MetaCampaignCombinationDiagnostics {
  const promoted =
    parsePromotedObject(input.adSetPayload?.promoted_object) ??
    buildPromotedObjectForSpec(input.spec, input.ctx);
  const blockers =
    input.blockers ??
    validateMetaCampaignCombination({
      spec: input.spec,
      ctx: input.ctx,
      adSetPayload: input.adSetPayload,
    });

  return {
    goalLabel: input.spec.goalLabel,
    mode: input.spec.mode,
    objective: input.spec.campaignObjective,
    optimizationGoal: String(
      input.adSetPayload?.optimization_goal ?? input.spec.optimizationGoal,
    ),
    creativeType: input.spec.creativeSource,
    destinationType: String(
      input.adSetPayload?.destination_type ?? input.spec.destinationType ?? '',
    ) || input.spec.destinationType,
    promotedObjectKeys: promoted ? Object.keys(promoted) : [],
    promotedObjectSummary: promoted
      ? JSON.stringify(promoted)
      : input.spec.promotedObjectSummary,
    promotedObject: promoted,
    catalogLaunchMode:
      input.spec.mode === 'catalog_sales'
        ? 'sales'
        : input.spec.mode === 'catalog_traffic'
          ? 'traffic'
          : input.ctx.catalogLaunchMode ?? null,
    fallbackReason:
      input.spec.mode === 'catalog_traffic' ? CATALOG_TRAFFIC_FALLBACK_MESSAGE : null,
    validationOk: blockers.length === 0,
    violations: blockers.map((b) => ({
      param: b.key.replace(/^combo\.[^.]+\./, '').replace(/^combo\./, '') || b.key,
      rule: b.message.replace(`${META_UNSUPPORTED_COMBINATION_MESSAGE} `, ''),
    })),
  };
}

function buildCampaignPayloadBase(input: MetaCampaignBuilderInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    objective: input.spec.campaignObjective,
    status: input.publishStatus,
    special_ad_categories: JSON.stringify(['HOUSING']),
    is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
  };
  if (input.useCampaignBudgetOptimization) {
    payload.daily_budget = String(input.dailyBudgetMinor);
  }
  return payload;
}

function buildGenericAdSetPayload(input: MetaCampaignBuilderInput): {
  adSetPayload: Record<string, unknown>;
  promotedObject: Record<string, unknown> | null;
} {
  const normalizedTargeting = normalizeTargetingForMetaV25(
    input.targeting,
    input.spec.advantageAudience,
  );
  const adSetPayload: Record<string, unknown> = {
    name: `${input.name.trim()} — sada`,
    campaign_id: input.campaignId,
    billing_event: input.spec.billingEvent,
    optimization_goal: input.spec.optimizationGoal,
    bid_strategy: input.spec.bidStrategy,
    targeting: JSON.stringify(normalizedTargeting),
    start_time: input.startTime,
    end_time: input.endTime,
    status: input.publishStatus,
    is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
  };
  if (!input.useCampaignBudgetOptimization) {
    adSetPayload.daily_budget = String(input.dailyBudgetMinor);
  }
  const normalized = normalizeAdSetPayloadForMetaV25({
    payload: adSetPayload,
    spec: input.spec,
    payloadContext: input.payloadContext,
    targeting: normalizedTargeting,
    dsaLabels: input.dsaLabels,
  });
  return {
    adSetPayload: normalized.payload,
    promotedObject: normalized.promotedObject,
  };
}

function finalizeBuilderResult(
  input: MetaCampaignBuilderInput,
  adSetPayload: Record<string, unknown>,
  promotedObject: Record<string, unknown> | null,
): MetaCampaignBuilderResult {
  const blockers = validateMetaCampaignCombination({
    spec: input.spec,
    ctx: input.payloadContext,
    adSetPayload,
  });
  const diagnostics = buildCombinationDiagnostics({
    spec: input.spec,
    ctx: input.payloadContext,
    adSetPayload,
    blockers,
  });
  if (blockers.length) {
    return { ok: false, blockers, diagnostics, adSetPayload, promotedObject };
  }
  return {
    ok: true,
    campaignPayload: buildCampaignPayloadBase(input),
    adSetPayload,
    promotedObject,
    diagnostics,
  };
}

export function buildTrafficCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'traffic') {
    return {
      ok: false,
      blockers: [
        {
          key: 'builder.mode',
          message: 'buildTrafficCampaign vyžaduje režim traffic.',
        },
      ],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const { adSetPayload, promotedObject } = buildGenericAdSetPayload(input);
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildCatalogSalesCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'catalog_sales') {
    return {
      ok: false,
      blockers: [
        {
          key: 'builder.mode',
          message: 'buildCatalogSalesCampaign vyžaduje režim catalog_sales.',
        },
      ],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const catalogId = input.payloadContext.catalogId?.replace(/^catalog_/i, '') ?? '';
  const pixelId = input.payloadContext.pixelId?.trim() || '';
  if (!pixelId) {
    const blockers: MetaCampaignLaunchBlocker[] = [
      {
        key: 'combo.sales.pixel_id',
        message: `${META_UNSUPPORTED_COMBINATION_MESSAGE} (promoted_object.pixel_id: Katalogový prodej vyžaduje Pixel/Event Source)`,
      },
    ];
    return {
      ok: false,
      blockers,
      diagnostics: buildCombinationDiagnostics({
        spec: input.spec,
        ctx: input.payloadContext,
        blockers,
      }),
    };
  }
  if (!input.dsaLabels) {
    const blockers: MetaCampaignLaunchBlocker[] = [
      {
        key: 'adset.dsa',
        message: 'Ad set: chybí DSA beneficiary/payor.',
      },
    ];
    return {
      ok: false,
      blockers,
      diagnostics: buildCombinationDiagnostics({
        spec: input.spec,
        ctx: input.payloadContext,
        blockers,
      }),
    };
  }
  const adSetPayload = buildSupportedCatalogAdSetPayload({
    campaignId: input.campaignId,
    adSetName: `${input.name.trim()} — sada`,
    publishStatus: input.publishStatus,
    dailyBudgetMinor: input.dailyBudgetMinor,
    spec: input.spec,
    targeting: input.targeting,
    catalogId,
    pixelId,
    dsaLabels: input.dsaLabels,
    isAdsetBudgetSharingEnabled: input.isAdsetBudgetSharingEnabled,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  const promotedObject = buildPromotedObject({
    campaignObjective: input.spec.campaignObjective,
    optimizationGoal: input.spec.optimizationGoal,
    creativeSource: input.spec.creativeSource,
    catalogId,
    pixelId,
    customEventType: 'PURCHASE',
  });
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildCatalogTrafficCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'catalog_traffic') {
    return {
      ok: false,
      blockers: [
        {
          key: 'builder.mode',
          message: 'buildCatalogTrafficCampaign vyžaduje režim catalog_traffic.',
        },
      ],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const catalogId = input.payloadContext.catalogId?.replace(/^catalog_/i, '') ?? '';
  if (!catalogId) {
    const blockers: MetaCampaignLaunchBlocker[] = [
      {
        key: 'combo.catalog_traffic.product_catalog_id',
        message: 'Katalogová návštěvnost vyžaduje Catalog ID.',
      },
    ];
    return {
      ok: false,
      blockers,
      diagnostics: buildCombinationDiagnostics({
        spec: input.spec,
        ctx: input.payloadContext,
        blockers,
      }),
    };
  }
  if (!input.dsaLabels) {
    const blockers: MetaCampaignLaunchBlocker[] = [
      {
        key: 'adset.dsa',
        message: 'Ad set: chybí DSA beneficiary/payor.',
      },
    ];
    return {
      ok: false,
      blockers,
      diagnostics: buildCombinationDiagnostics({
        spec: input.spec,
        ctx: input.payloadContext,
        blockers,
      }),
    };
  }
  const adSetPayload = buildSupportedCatalogTrafficAdSetPayload({
    campaignId: input.campaignId,
    adSetName: `${input.name.trim()} — sada`,
    publishStatus: input.publishStatus,
    dailyBudgetMinor: input.dailyBudgetMinor,
    spec: input.spec,
    targeting: input.targeting,
    catalogId,
    dsaLabels: input.dsaLabels,
    isAdsetBudgetSharingEnabled: input.isAdsetBudgetSharingEnabled,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  const promotedObject = buildPromotedObject({
    campaignObjective: input.spec.campaignObjective,
    optimizationGoal: input.spec.optimizationGoal,
    creativeSource: input.spec.creativeSource,
    catalogId,
  });
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildLeadCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'leads') {
    return {
      ok: false,
      blockers: [{ key: 'builder.mode', message: 'buildLeadCampaign vyžaduje režim leads.' }],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const { adSetPayload, promotedObject } = buildGenericAdSetPayload(input);
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildReachCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'reach') {
    return {
      ok: false,
      blockers: [{ key: 'builder.mode', message: 'buildReachCampaign vyžaduje režim reach.' }],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const { adSetPayload, promotedObject } = buildGenericAdSetPayload(input);
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildEngagementCampaign(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  if (input.spec.mode !== 'video' && input.spec.mode !== 'messages') {
    return {
      ok: false,
      blockers: [
        {
          key: 'builder.mode',
          message: 'buildEngagementCampaign vyžaduje režim video nebo messages.',
        },
      ],
      diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
    };
  }
  const { adSetPayload, promotedObject } = buildGenericAdSetPayload(input);
  return finalizeBuilderResult(input, adSetPayload, promotedObject);
}

export function buildMetaCampaignByMode(input: MetaCampaignBuilderInput): MetaCampaignBuilderResult {
  switch (input.spec.mode) {
    case 'traffic':
      return buildTrafficCampaign(input);
    case 'catalog_sales':
      return buildCatalogSalesCampaign(input);
    case 'catalog_traffic':
      return buildCatalogTrafficCampaign(input);
    case 'leads':
      return buildLeadCampaign(input);
    case 'reach':
      return buildReachCampaign(input);
    case 'video':
    case 'messages':
      return buildEngagementCampaign(input);
    case 'remarketing': {
      const built = buildGenericAdSetPayload(input);
      return finalizeBuilderResult(input, built.adSetPayload, built.promotedObject);
    }
    default:
      return {
        ok: false,
        blockers: [
          {
            key: 'builder.mode',
            message: `Nepodporovaný režim kampaně: ${input.spec.mode}`,
          },
        ],
        diagnostics: buildCombinationDiagnostics({ spec: input.spec, ctx: input.payloadContext }),
      };
  }
}

export type MetaDraftMigrationResult = {
  migrated: boolean;
  warning: string | null;
  goal: string;
  creativeType: string;
};

/** Převod uložených konceptů s neplatnou kombinací OUTCOME_TRAFFIC + catalog_products. */
export function migrateInvalidDraftCombination(input: {
  goal: string;
  creativeType: string;
  storedObjective?: string | null;
}): MetaDraftMigrationResult {
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

export function assertModeSpec(mode: MetaCampaignModeKey, ctx: MetaCampaignPayloadContext) {
  return getMetaCampaignPayloadSpec(mode, ctx);
}
