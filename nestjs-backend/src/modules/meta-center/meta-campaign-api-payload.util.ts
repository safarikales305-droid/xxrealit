import type { MetaGraphResult } from './meta-graph-client.service';
import {
  extractMetaGraphErrorFields,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';

export type MetaCampaignLaunchBlocker = {
  key: string;
  message: string;
};

export type MetaCampaignPayloadSection = {
  payload: Record<string, unknown> | null;
  metaForm?: Record<string, string> | null;
  objective?: string;
  optimizationGoal?: string;
  billingEvent?: string;
  promotedObject?: Record<string, unknown> | null;
  creativeSource?: string;
};

export type MetaCampaignPayloadPreviewSpec = {
  mode: string;
  modeLabel: string;
  goalLabel: string;
  creativeSource: string;
  campaignObjective: string;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  destinationType: string | null;
  advantageAudience: 0 | 1;
  promotedObjectSummary: string;
  requiresPromotedObject: boolean;
};

/** Sjednocený návratový typ pro náhled / validaci Meta payloadů kampaně. */
export type MetaCampaignLaunchResult = {
  ok: boolean;
  message: string;
  blockers: MetaCampaignLaunchBlocker[];
  payload: Record<string, unknown> | null;
  metaForm?: Record<string, string> | null;
  spec: MetaCampaignPayloadPreviewSpec | null;
  campaign: MetaCampaignPayloadSection | null;
  adSet: MetaCampaignPayloadSection | null;
  creative: MetaCampaignPayloadSection | null;
  ad: MetaCampaignPayloadSection | null;
  graphApiUrls?: Record<string, string> | null;
  adSetCorrections?: string[];
  housingGeoDebug?: import('./meta-housing-geo.util').MetaHousingGeoDebug | null;
};

export function emptyMetaCampaignLaunchResult(
  message: string,
  blockers: MetaCampaignLaunchBlocker[] = [],
): MetaCampaignLaunchResult {
  return {
    ok: false,
    message,
    blockers,
    payload: null,
    metaForm: null,
    spec: null,
    campaign: null,
    adSet: null,
    creative: null,
    ad: null,
  };
}

export type MetaCampaignAdSetPayloadPreviewResult = {
  ok: boolean;
  message: string;
  blockers: MetaCampaignLaunchBlocker[];
  payload: Record<string, unknown> | null;
  metaForm: Record<string, string> | null;
  spec: {
    objectiveKey: string;
    campaignObjective: string;
    optimizationGoal: string;
    requiresPromotedObject: boolean;
  } | null;
  previews: MetaCampaignLaunchResult;
};

export function emptyMetaCampaignAdSetPayloadPreviewResult(
  message: string,
): MetaCampaignAdSetPayloadPreviewResult {
  return {
    ok: false,
    message,
    blockers: [],
    payload: null,
    metaForm: null,
    spec: null,
    previews: emptyMetaCampaignLaunchResult(message),
  };
}

export function emptyMetaAdSetProbeResult(
  message: string,
): import('./meta-adset-probe.util').MetaAdSetProbeResult {
  return {
    ok: false,
    message,
    campaignId: '',
    graphApiVersion: '',
    graphPath: '',
    steps: [],
    failureStep: null,
    lastSuccessStep: null,
    recommendedPayload: null,
    recommendedMetaForm: null,
    v25Validation: [],
  };
}

export function toMetaCampaignPayloadPreviewSpec(spec: {
  mode: string;
  modeLabel: string;
  goalLabel: string;
  creativeSource: string;
  campaignObjective: string;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  destinationType: string | null;
  advantageAudience: 0 | 1;
  promotedObjectSummary: string;
  requiresPromotedObject: boolean;
}): MetaCampaignPayloadPreviewSpec {
  return {
    mode: spec.mode,
    modeLabel: spec.modeLabel,
    goalLabel: spec.goalLabel,
    creativeSource: spec.creativeSource,
    campaignObjective: spec.campaignObjective,
    optimizationGoal: spec.optimizationGoal,
    billingEvent: spec.billingEvent,
    bidStrategy: spec.bidStrategy,
    destinationType: spec.destinationType,
    advantageAudience: spec.advantageAudience,
    promotedObjectSummary: spec.promotedObjectSummary,
    requiresPromotedObject: spec.requiresPromotedObject,
  };
}

export type MetaCampaignBudgetConfig = {
  /** Advantage+ campaign budget (rozpočet na kampani, ne na ad setu). */
  useCampaignBudgetOptimization: boolean;
  isAdsetBudgetSharingEnabled: boolean;
};

export type MetaLaunchStep = 'campaign' | 'adset' | 'creative' | 'ad';

export type MetaLaunchStepState = {
  ok: boolean;
  id?: string | null;
  error?: string | null;
};

export type MetaLaunchSteps = {
  campaign: MetaLaunchStepState;
  adSet: MetaLaunchStepState;
  creative: MetaLaunchStepState;
  ad: MetaLaunchStepState;
};

export type MetaLaunchPayloadSnapshot = {
  campaign?: Record<string, unknown> | null;
  targeting?: Record<string, unknown> | null;
  adSet?: Record<string, unknown> | null;
  creative?: Record<string, unknown> | null;
  ad?: Record<string, unknown> | null;
  productSetId?: string | null;
  combinationDiagnostics?: import('./meta-campaign-builder.util').MetaCampaignCombinationDiagnostics | null;
  catalogLaunchMode?: 'sales' | 'traffic' | null;
  fallbackReason?: string | null;
  launchPhase?: string | null;
  housingGeoDebug?: import('./meta-housing-geo.util').MetaHousingGeoDebug | null;
};

export function emptyLaunchSteps(): MetaLaunchSteps {
  return {
    campaign: { ok: false },
    adSet: { ok: false },
    creative: { ok: false },
    ad: { ok: false },
  };
}

export type MetaApiErrorDetail = {
  step: string;
  launchStep?: MetaLaunchStep;
  field: string | null;
  fieldValue: unknown;
  requestPayload: Record<string, unknown>;
  metaForm?: Record<string, string> | null;
  requestUrl?: string | null;
  requestMethod?: string | null;
  httpStatus: number;
  response: unknown;
  traceId: string | null;
  errorCode: string | null;
  errorSubcode: string | null;
  errorUserTitle: string | null;
  errorUserMsg: string | null;
  attempts?: number;
  contextIds?: Record<string, string | null> | null;
  launchDebug?: import('./meta-launch-debug.util').MetaLaunchDebugTrace | null;
  adSetProbe?: import('./meta-adset-probe.util').MetaAdSetProbeResult | null;
};

export function validateGeoTargetingPayload(
  targeting: Record<string, unknown>,
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];
  let parsed: Record<string, unknown> = targeting;
  const raw = targeting.targeting;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return blockers;
    }
  }

  const geoLocations = parsed.geo_locations;
  if (!geoLocations || typeof geoLocations !== 'object') return blockers;
  const geo = geoLocations as Record<string, unknown>;
  const cities = geo.cities;
  if (Array.isArray(cities)) {
    for (const entry of cities) {
      if (entry && typeof entry === 'object' && 'radius' in (entry as Record<string, unknown>)) {
        blockers.push({
          key: 'adset.geo.cities_radius',
          message:
            'Neplatné cílení: Meta cities nesmí obsahovat radius. Zvolte „Cílit celé město“ nebo použijte okruh přes souřadnice.',
        });
        break;
      }
    }
  }

  const locationMode = geo.cities && Array.isArray(geo.cities) && geo.cities.length > 0
    ? 'city'
    : geo.custom_locations
      ? 'radius'
      : null;
  if (
    locationMode === 'radius' &&
    Array.isArray(geo.cities) &&
    geo.cities.length > 0 &&
    Array.isArray(geo.custom_locations) &&
    geo.custom_locations.length > 0
  ) {
    blockers.push({
      key: 'adset.geo.mixed',
      message:
        'Neplatné cílení: nelze kombinovat cities a custom_locations — zvolte buď celé město, nebo okruh.',
    });
  }

  return blockers;
}

export function summarizeMetaLaunchSteps(
  steps: MetaLaunchSteps | null | undefined,
): string[] {
  if (!steps) {
    return [
      'Campaign nevytvořena',
      'Ad Set nevytvořeno',
      'Creative nevytvořeno',
      'Ad nevytvořeno',
    ];
  }
  const line = (label: string, state: MetaLaunchStepState | undefined) => {
    if (!state || (!state.ok && !state.error)) return `${label} nevytvořeno`;
    if (state.ok) return `${label} vytvořeno`;
    return `${label} chyba`;
  };
  return [
    line('Campaign', steps.campaign),
    line('Ad Set', steps.adSet),
    line('Creative', steps.creative),
    line('Ad', steps.ad),
  ];
}

export function resolveBudgetConfig(
  useCampaignBudgetOptimization = false,
): MetaCampaignBudgetConfig {
  if (useCampaignBudgetOptimization) {
    return {
      useCampaignBudgetOptimization: true,
      isAdsetBudgetSharingEnabled: true,
    };
  }
  return {
    useCampaignBudgetOptimization: false,
    isAdsetBudgetSharingEnabled: false,
  };
}

export function validateCampaignPayload(
  payload: Record<string, unknown>,
  config: MetaCampaignBudgetConfig,
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const required = ['name', 'objective', 'status', 'special_ad_categories', 'is_adset_budget_sharing_enabled'];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      blockers.push({
        key: `campaign.${field}`,
        message: `Kampaň: chybí povinný parametr „${field}".`,
      });
    }
  }
  if (config.useCampaignBudgetOptimization) {
    if (!payload.daily_budget && !payload.lifetime_budget) {
      blockers.push({
        key: 'campaign.daily_budget',
        message: 'Kampaň (CBO): chybí daily_budget nebo lifetime_budget.',
      });
    }
  }
  return blockers;
}

export function validateAdSetPayload(
  payload: Record<string, unknown>,
  config: MetaCampaignBudgetConfig,
  options: { requiresPromotedObject: boolean },
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];
  const required = [
    'name',
    'campaign_id',
    'billing_event',
    'optimization_goal',
    'bid_strategy',
    'targeting',
    'status',
    'is_adset_budget_sharing_enabled',
  ];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      blockers.push({
        key: `adset.${field}`,
        message: `Ad set: chybí povinný parametr „${field}".`,
      });
    }
  }

  if (!config.useCampaignBudgetOptimization) {
    if (!payload.daily_budget && !payload.lifetime_budget) {
      blockers.push({
        key: 'adset.daily_budget',
        message: 'Ad set: chybí daily_budget nebo lifetime_budget.',
      });
    }
  } else if (payload.daily_budget || payload.lifetime_budget) {
    blockers.push({
      key: 'adset.daily_budget',
      message: 'Ad set: při CBO nesmí být nastaven rozpočet na ad setu.',
    });
  }

  if (options.requiresPromotedObject && !payload.promoted_object) {
    blockers.push({
      key: 'adset.promoted_object',
      message: 'Ad set: chybí promoted_object (pixel/dataset nebo katalog).',
    });
  }

  try {
    const targetingRaw = payload.targeting;
    const targeting =
      typeof targetingRaw === 'string' ? JSON.parse(targetingRaw) : targetingRaw;
    if (!targeting || typeof targeting !== 'object' || !Object.keys(targeting).length) {
      blockers.push({
        key: 'adset.targeting',
        message: 'Ad set: cílení (targeting) nesmí být prázdné.',
      });
    }
  } catch {
    blockers.push({
      key: 'adset.targeting',
      message: 'Ad set: targeting není platný JSON.',
    });
  }

  return blockers;
}

function extractBlameField(
  body: MetaGraphErrorBody | null | undefined,
  payload: Record<string, unknown>,
): { field: string | null; fieldValue: unknown } {
  const err = body?.error;
  if (!err) return { field: null, fieldValue: null };

  const errorData = err.error_data;
  if (errorData && typeof errorData === 'object') {
    const specs = (errorData as { blame_field_specs?: Array<{ field?: string }> })
      .blame_field_specs;
    const blamed = specs?.[0]?.field;
    if (blamed) {
      return { field: blamed, fieldValue: payload[blamed] ?? null };
    }
  }

  const message = typeof err.message === 'string' ? err.message : '';
  const paramMatch = message.match(/(?:param|parameter|field)\s+[`'"]?([\w.]+)[`'"]?/i);
  if (paramMatch?.[1]) {
    const field = paramMatch[1];
    return { field, fieldValue: payload[field] ?? null };
  }

  return { field: null, fieldValue: null };
}

export function formatMetaApiFailure(
  step: string,
  payload: Record<string, unknown>,
  result: MetaGraphResult<unknown>,
  launchStep?: MetaLaunchStep,
  extras?: {
    metaForm?: Record<string, string> | null;
    attempts?: number;
    contextIds?: Record<string, string | null> | null;
    launchDebug?: import('./meta-launch-debug.util').MetaLaunchDebugTrace | null;
    userMessage?: string | null;
  },
): { message: string; detail: MetaApiErrorDetail } {
  const body = result.ok ? null : result.data;
  const fields = extractMetaGraphErrorFields(body);
  const blame = extractBlameField(body, payload);
  const metaForm = extras?.metaForm ?? null;

  const detail: MetaApiErrorDetail = {
    step,
    launchStep,
    field: blame.field,
    fieldValue: blame.fieldValue,
    requestPayload: payload,
    metaForm,
    requestUrl: result.requestUrl ?? null,
    requestMethod: result.requestMethod ?? null,
    httpStatus: result.httpStatus,
    response: body ?? null,
    traceId: fields.trace_id,
    errorCode: fields.code,
    errorSubcode: fields.error_subcode,
    errorUserTitle: fields.error_user_title,
    errorUserMsg: fields.error_user_msg,
    attempts: extras?.attempts,
    contextIds: extras?.contextIds ?? null,
    launchDebug: extras?.launchDebug ?? null,
  };

  const lines = [
    extras?.userMessage ?? null,
    `Meta API — ${step}`,
    launchStep ? `Krok: ${launchStepLabel(launchStep)}` : null,
    result.requestMethod && result.requestUrl
      ? `${result.requestMethod} ${result.requestUrl}`
      : null,
    blame.field ? `Pole: ${blame.field}` : null,
    blame.field != null ? `Hodnota: ${safeStringify(blame.fieldValue)}` : null,
    `HTTP kód: ${result.httpStatus}`,
    extras?.attempts ? `Počet pokusů: ${extras.attempts}` : null,
    fields.code ? `Meta error_code: ${fields.code}` : null,
    fields.error_subcode ? `error_subcode: ${fields.error_subcode}` : null,
    fields.error_user_title ? `error_user_title: ${fields.error_user_title}` : null,
    fields.error_user_msg ? `error_user_msg: ${fields.error_user_msg}` : null,
    fields.message ? `Meta: ${fields.message}` : null,
    fields.trace_id ? `trace_id: ${fields.trace_id}` : null,
    extras?.contextIds
      ? `Context IDs: ${safeStringify(extras.contextIds)}`
      : null,
    metaForm ? `Meta form payload: ${safeStringify(metaForm)}` : null,
    `Request JSON: ${safeStringify(payload)}`,
    `Response JSON: ${fields.fullJson ?? safeStringify(body)}`,
  ].filter(Boolean);

  return { message: lines.join('\n'), detail };
}

function launchStepLabel(step: MetaLaunchStep): string {
  switch (step) {
    case 'campaign':
      return 'Campaign';
    case 'adset':
      return 'Ad Set';
    case 'creative':
      return 'Creative';
    case 'ad':
      return 'Ad';
    default:
      return step;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
