import {
  buildMetaLaunchGraphPaths,
  normalizeTargetingForMetaV25,
  resolveDsaDisclosureLabels,
  serializePayloadForMetaApi,
  type MetaCampaignPayloadSpec,
} from './meta-campaign-payload-map.util';
import { extractMetaGraphErrorFields } from './meta-graph-error.util';
import type { MetaGraphResult } from './meta-graph-client.service';

export type MetaAdSetProbeStepKey =
  | 'minimal'
  | 'targeting'
  | 'promoted_object'
  | 'custom_event_type'
  | 'pixel_id'
  | 'product_catalog_id'
  | 'destination_type'
  | 'targeting_automation';

export type MetaAdSetProbeStepDefinition = {
  step: number;
  key: MetaAdSetProbeStepKey;
  label: string;
  fieldAdded: string | null;
  buildPayload: () => Record<string, unknown>;
};

export type MetaAdSetProbeBuildInput = {
  campaignId: string;
  adSetName: string;
  publishStatus: 'ACTIVE' | 'PAUSED';
  dailyBudgetMinor: number;
  billingEvent: string;
  optimizationGoal: string;
  bidStrategy: string;
  destinationType: string | null;
  advantageAudience: 0 | 1;
  targeting: Record<string, unknown>;
  catalogId: string | null;
  pixelId: string | null;
  dsaLabels: { beneficiary: string; payor: string } | null;
  isAdsetBudgetSharingEnabled: boolean;
};

export type MetaAdSetProbeStepResult = {
  step: number;
  key: MetaAdSetProbeStepKey;
  label: string;
  fieldAdded: string | null;
  payload: Record<string, unknown>;
  metaForm: Record<string, string>;
  graphUrl: string;
  httpStatus: number;
  ok: boolean;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string | null;
  requestId: string | null;
  fbtraceId: string | null;
  traceId: string | null;
  response: unknown;
  createdAdSetId: string | null;
  isCode2: boolean;
};

export type MetaAdSetV25FieldValidation = {
  field: string;
  supported: boolean;
  value: string | null;
  note: string;
};

export type MetaAdSetProbeResult = {
  ok: boolean;
  message: string;
  campaignId: string;
  graphApiVersion: string;
  graphPath: string;
  steps: MetaAdSetProbeStepResult[];
  failureStep: MetaAdSetProbeStepResult | null;
  lastSuccessStep: MetaAdSetProbeStepResult | null;
  recommendedPayload: Record<string, unknown> | null;
  recommendedMetaForm: Record<string, string> | null;
  v25Validation: MetaAdSetV25FieldValidation[];
};

export function buildMetaAdSetProbeSteps(input: MetaAdSetProbeBuildInput): MetaAdSetProbeStepDefinition[] {
  const promoted: Record<string, unknown> = {};
  let targeting = { ...input.targeting };
  let destinationType: string | undefined;
  let targetingAutomation = false;

  const withBase = (extra: Record<string, unknown>): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      name: input.adSetName,
      campaign_id: input.campaignId,
      billing_event: input.billingEvent,
      optimization_goal: input.optimizationGoal,
      bid_strategy: input.bidStrategy,
      daily_budget: String(input.dailyBudgetMinor),
      status: input.publishStatus,
      is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
      ...extra,
    };
    if (input.dsaLabels) {
      payload.dsa_beneficiary = input.dsaLabels.beneficiary;
      payload.dsa_payor = input.dsaLabels.payor;
    }
    return payload;
  };

  return [
    {
      step: 1,
      key: 'minimal',
      label: 'Minimální Ad Set',
      fieldAdded: 'campaign_id, billing_event, optimization_goal, daily_budget, status',
      buildPayload: () => withBase({}),
    },
    {
      step: 2,
      key: 'targeting',
      label: 'Targeting',
      fieldAdded: 'targeting',
      buildPayload: () =>
        withBase({
          targeting: JSON.stringify(targeting),
        }),
    },
    {
      step: 3,
      key: 'promoted_object',
      label: 'Promoted object (prázdný objekt)',
      fieldAdded: 'promoted_object',
      buildPayload: () =>
        withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
        }),
    },
    {
      step: 4,
      key: 'custom_event_type',
      label: 'Promoted object — custom_event_type',
      fieldAdded: 'promoted_object.custom_event_type',
      buildPayload: () => {
        promoted.custom_event_type = 'PURCHASE';
        return withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
        });
      },
    },
    {
      step: 5,
      key: 'pixel_id',
      label: 'Promoted object — pixel_id',
      fieldAdded: 'promoted_object.pixel_id',
      buildPayload: () => {
        if (input.pixelId) promoted.pixel_id = input.pixelId;
        return withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
        });
      },
    },
    {
      step: 6,
      key: 'product_catalog_id',
      label: 'Promoted object — product_catalog_id',
      fieldAdded: 'promoted_object.product_catalog_id',
      buildPayload: () => {
        if (input.catalogId) promoted.product_catalog_id = input.catalogId;
        return withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
        });
      },
    },
    {
      step: 7,
      key: 'destination_type',
      label: 'Destination type',
      fieldAdded: 'destination_type',
      buildPayload: () => {
        if (input.destinationType) destinationType = input.destinationType;
        return withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
          ...(destinationType ? { destination_type: destinationType } : {}),
        });
      },
    },
    {
      step: 8,
      key: 'targeting_automation',
      label: 'Targeting automation',
      fieldAdded: 'targeting.targeting_automation.advantage_audience',
      buildPayload: () => {
        targetingAutomation = true;
        targeting = normalizeTargetingForMetaV25(targeting, input.advantageAudience);
        return withBase({
          targeting: JSON.stringify(targeting),
          promoted_object: JSON.stringify({ ...promoted }),
          ...(destinationType ? { destination_type: destinationType } : {}),
        });
      },
    },
  ];
}

/** Katalogová návštěvnost bez Purchase Event — OUTCOME_AWARENESS + REACH + catalog. */
export function buildSupportedCatalogTrafficAdSetPayload(input: {
  campaignId: string;
  adSetName: string;
  publishStatus: 'ACTIVE' | 'PAUSED';
  dailyBudgetMinor: number;
  spec: MetaCampaignPayloadSpec;
  targeting: Record<string, unknown>;
  catalogId: string;
  dsaLabels: { beneficiary: string; payor: string };
  isAdsetBudgetSharingEnabled: boolean;
  startTime?: string;
  endTime?: string;
}): Record<string, unknown> {
  const targeting = normalizeTargetingForMetaV25(
    input.targeting,
    input.spec.advantageAudience,
  );
  return {
    name: input.adSetName,
    campaign_id: input.campaignId,
    billing_event: input.spec.billingEvent,
    optimization_goal: input.spec.optimizationGoal,
    bid_strategy: input.spec.bidStrategy,
    daily_budget: String(input.dailyBudgetMinor),
    status: input.publishStatus,
    is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
    dsa_beneficiary: input.dsaLabels.beneficiary,
    dsa_payor: input.dsaLabels.payor,
    targeting: JSON.stringify(targeting),
    destination_type: input.spec.destinationType ?? 'SHOP_AUTOMATIC',
    promoted_object: JSON.stringify({
      product_catalog_id: input.catalogId,
    }),
    ...(input.startTime ? { start_time: input.startTime } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {}),
  };
}

export function buildSupportedCatalogAdSetPayload(input: {
  campaignId: string;
  adSetName: string;
  publishStatus: 'ACTIVE' | 'PAUSED';
  dailyBudgetMinor: number;
  spec: MetaCampaignPayloadSpec;
  targeting: Record<string, unknown>;
  catalogId: string;
  pixelId: string;
  dsaLabels: { beneficiary: string; payor: string };
  isAdsetBudgetSharingEnabled: boolean;
  startTime?: string;
  endTime?: string;
}): Record<string, unknown> {
  const targeting = normalizeTargetingForMetaV25(
    input.targeting,
    input.spec.advantageAudience,
  );
  return {
    name: input.adSetName,
    campaign_id: input.campaignId,
    billing_event: input.spec.billingEvent,
    optimization_goal: input.spec.optimizationGoal,
    bid_strategy: input.spec.bidStrategy,
    daily_budget: String(input.dailyBudgetMinor),
    status: input.publishStatus,
    is_adset_budget_sharing_enabled: input.isAdsetBudgetSharingEnabled,
    dsa_beneficiary: input.dsaLabels.beneficiary,
    dsa_payor: input.dsaLabels.payor,
    targeting: JSON.stringify(targeting),
    destination_type: input.spec.destinationType ?? 'SHOP_AUTOMATIC',
    promoted_object: JSON.stringify({
      product_catalog_id: input.catalogId,
      pixel_id: input.pixelId,
      custom_event_type: 'PURCHASE',
    }),
    ...(input.startTime ? { start_time: input.startTime } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {}),
  };
}

export function catalogSalesV25Validation(spec: MetaCampaignPayloadSpec): MetaAdSetV25FieldValidation[] {
  return [
    {
      field: 'optimization_goal',
      supported: true,
      value: spec.optimizationGoal,
      note: 'OUTCOME_SALES + Catalog Sales: OFFSITE_CONVERSIONS je podporovaný cíl optimalizace (v25 ODAX).',
    },
    {
      field: 'promoted_object',
      supported: true,
      value: 'product_catalog_id + pixel_id + custom_event_type',
      note: 'Pro katalogový prodej bez page_id v promoted_object — page_id patří do kreativy.',
    },
    {
      field: 'destination_type',
      supported: true,
      value: spec.destinationType,
      note: 'SHOP_AUTOMATIC je správný destination pro katalog; WEBSITE je pro čisté webové konverze.',
    },
    {
      field: 'targeting_automation',
      supported: true,
      value: `advantage_audience=${spec.advantageAudience}`,
      note: 'V25 vyžaduje explicitní advantage_audience; pro catalog sales doporučeno 1 (geo-only).',
    },
    {
      field: 'custom_event_type',
      supported: true,
      value: 'PURCHASE',
      note: 'PURCHASE je standardní event pro katalogové prodejní kampaně s pixelem.',
    },
  ];
}

export function mapProbeGraphResult<T extends { id?: string }>(
  step: MetaAdSetProbeStepDefinition,
  graphUrl: string,
  payload: Record<string, unknown>,
  result: MetaGraphResult<T> & { responseHeaders?: Record<string, string> },
): MetaAdSetProbeStepResult {
  const metaForm = serializePayloadForMetaApi(payload);
  const fields = result.ok ? null : extractMetaGraphErrorFields(result.data);
  const headers = result.responseHeaders ?? {};
  const errorBody = !result.ok ? result.data : null;
  const fbtraceId =
    fields?.trace_id ??
    (errorBody?.error &&
    typeof errorBody.error === 'object' &&
    typeof (errorBody.error as { fbtrace_id?: string }).fbtrace_id === 'string'
      ? (errorBody.error as { fbtrace_id: string }).fbtrace_id
      : null);
  const requestId =
    headers['x-fb-request-id'] ??
    headers['x-fb-trace-id'] ??
    headers['x-business-use-case-usage'] ??
    null;

  return {
    step: step.step,
    key: step.key,
    label: step.label,
    fieldAdded: step.fieldAdded,
    payload,
    metaForm,
    graphUrl,
    httpStatus: result.httpStatus,
    ok: result.ok,
    errorCode: result.ok ? null : result.errorCode,
    errorType: fields?.type ?? null,
    errorMessage: result.ok ? null : result.errorMessage,
    requestId,
    fbtraceId,
    traceId: fields?.trace_id ?? fbtraceId,
    response: result.ok ? result.data : result.data,
    createdAdSetId: result.ok ? result.data?.id ?? null : null,
    isCode2: !result.ok && result.httpStatus === 500 && result.errorCode === '2',
  };
}

export function buildProbeGraphUrl(graphBase: string, actId: string): string {
  const paths = buildMetaLaunchGraphPaths(actId);
  return `${graphBase.replace(/\/$/, '')}${paths.adSet}`;
}

export function summarizeProbeResult(
  campaignId: string,
  graphApiVersion: string,
  graphPath: string,
  steps: MetaAdSetProbeStepResult[],
  spec: MetaCampaignPayloadSpec,
  recommendedPayload: Record<string, unknown> | null,
): MetaAdSetProbeResult {
  const failureStep =
    steps.find((s) => !s.ok && s.isCode2) ??
    steps.find((s) => !s.ok) ??
    null;
  const lastSuccessStep = [...steps].reverse().find((s) => s.ok) ?? null;

  let message = 'Všechny probe kroky prošly.';
  if (failureStep) {
    message = failureStep.isCode2
      ? `Code=2 na kroku ${failureStep.step} po přidání: ${failureStep.fieldAdded}`
      : `Selhání na kroku ${failureStep.step} (${failureStep.fieldAdded}): ${failureStep.errorMessage ?? 'chyba'}`;
  }

  return {
    ok: !failureStep,
    message,
    campaignId,
    graphApiVersion,
    graphPath,
    steps,
    failureStep,
    lastSuccessStep,
    recommendedPayload,
    recommendedMetaForm: recommendedPayload
      ? serializePayloadForMetaApi(recommendedPayload)
      : null,
    v25Validation: catalogSalesV25Validation(spec),
  };
}
