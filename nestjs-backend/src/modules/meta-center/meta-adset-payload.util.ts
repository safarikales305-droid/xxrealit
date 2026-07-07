import type { MetaCampaignLaunchBlocker } from './meta-campaign-api-payload.util';

/** Interní klíč cíle kampaně z administrace. */
export type MetaCampaignObjectiveKey =
  | 'traffic'
  | 'reach'
  | 'lead'
  | 'catalog'
  | 'messages';

export type AdSetPromotedObjectInput = {
  catalogId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  pageId: string | null;
  leadFormId?: string | null;
};

export type AdSetObjectiveSpec = {
  objectiveKey: MetaCampaignObjectiveKey;
  campaignObjective: string;
  optimizationGoal: string;
  requiresPromotedObject: boolean;
  allowedPromotedObjectKeys: string[];
};

const OBJECTIVE_ALIASES: Record<string, MetaCampaignObjectiveKey> = {
  traffic: 'traffic',
  reach: 'reach',
  lead: 'lead',
  leads: 'lead',
  catalog: 'catalog',
  catalog_sales: 'catalog',
  messages: 'messages',
};

export function normalizeCampaignObjectiveKey(objective: string): MetaCampaignObjectiveKey {
  const key = objective.trim().toLowerCase();
  return OBJECTIVE_ALIASES[key] ?? 'traffic';
}

export function mapCampaignObjectiveToMeta(objectiveKey: MetaCampaignObjectiveKey): string {
  switch (objectiveKey) {
    case 'catalog':
      return 'OUTCOME_SALES';
    case 'lead':
      return 'OUTCOME_LEADS';
    case 'reach':
      return 'OUTCOME_AWARENESS';
    case 'messages':
      return 'OUTCOME_ENGAGEMENT';
    case 'traffic':
    default:
      return 'OUTCOME_TRAFFIC';
  }
}

export function resolveAdSetObjectiveSpec(objective: string): AdSetObjectiveSpec {
  const objectiveKey = normalizeCampaignObjectiveKey(objective);

  switch (objectiveKey) {
    case 'reach':
      return {
        objectiveKey,
        campaignObjective: 'OUTCOME_AWARENESS',
        optimizationGoal: 'REACH',
        requiresPromotedObject: false,
        allowedPromotedObjectKeys: [],
      };
    case 'lead':
      return {
        objectiveKey,
        campaignObjective: 'OUTCOME_LEADS',
        optimizationGoal: 'LEAD_GENERATION',
        requiresPromotedObject: false,
        allowedPromotedObjectKeys: ['page_id', 'lead_gen_form_id'],
      };
    case 'catalog':
      return {
        objectiveKey,
        campaignObjective: 'OUTCOME_SALES',
        optimizationGoal: 'LINK_CLICKS',
        requiresPromotedObject: true,
        allowedPromotedObjectKeys: ['product_catalog_id'],
      };
    case 'messages':
      return {
        objectiveKey,
        campaignObjective: 'OUTCOME_ENGAGEMENT',
        optimizationGoal: 'LINK_CLICKS',
        requiresPromotedObject: false,
        allowedPromotedObjectKeys: [],
      };
    case 'traffic':
    default:
      return {
        objectiveKey,
        campaignObjective: 'OUTCOME_TRAFFIC',
        optimizationGoal: 'LINK_CLICKS',
        requiresPromotedObject: false,
        allowedPromotedObjectKeys: [],
      };
  }
}

export function buildAdSetPromotedObject(
  spec: AdSetObjectiveSpec,
  input: AdSetPromotedObjectInput,
): Record<string, unknown> | null {
  if (spec.objectiveKey === 'catalog') {
    const normalizedCatalogId = input.catalogId?.replace(/^catalog_/i, '') ?? null;
    if (!normalizedCatalogId) return null;
    return { product_catalog_id: normalizedCatalogId };
  }

  if (spec.objectiveKey === 'lead') {
    const leadFormId = input.leadFormId?.trim();
    const pageId = input.pageId?.trim();
    if (!leadFormId || !pageId) return null;
    return {
      page_id: pageId,
      lead_gen_form_id: leadFormId,
    };
  }

  if (!spec.requiresPromotedObject) {
    return null;
  }

  return null;
}

function parsePromotedObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
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

export function validateAdSetPayloadForObjective(
  payload: Record<string, unknown>,
  spec: AdSetObjectiveSpec,
): MetaCampaignLaunchBlocker[] {
  const blockers: MetaCampaignLaunchBlocker[] = [];

  if (payload.optimization_goal !== spec.optimizationGoal) {
    blockers.push({
      key: 'adset.optimization_goal_mismatch',
      message: `Ad set: optimization_goal „${String(payload.optimization_goal)}" není podporován pro cíl „${spec.objectiveKey}" (očekáváno „${spec.optimizationGoal}").`,
    });
  }

  const promoted = parsePromotedObject(payload.promoted_object);

  if (!spec.requiresPromotedObject && promoted && Object.keys(promoted).length > 0) {
    blockers.push({
      key: 'adset.promoted_object_forbidden',
      message: `Ad set: promoted_object není podporován pro cíl „${spec.objectiveKey}".`,
    });
  }

  if (spec.requiresPromotedObject && !promoted) {
    blockers.push({
      key: 'adset.promoted_object_required',
      message: `Ad set: chybí promoted_object pro cíl „${spec.objectiveKey}".`,
    });
  }

  if (promoted) {
    for (const key of Object.keys(promoted)) {
      if (!spec.allowedPromotedObjectKeys.includes(key)) {
        blockers.push({
          key: `adset.promoted_object.${key}`,
          message: `Ad set: promoted_object.${key} není podporován pro cíl „${spec.objectiveKey}".`,
        });
      }
    }

    if (promoted.custom_event_type != null) {
      blockers.push({
        key: 'adset.custom_event_type',
        message: `Ad set: custom_event_type není podporován pro cíl „${spec.objectiveKey}".`,
      });
    }

    if (promoted.pixel_id != null && spec.objectiveKey === 'catalog') {
      blockers.push({
        key: 'adset.pixel_id_catalog',
        message:
          'Ad set: pixel_id v promoted_object není pro katalogové kampaně v tomto režimu podporován.',
      });
    }
  }

  if (spec.objectiveKey !== 'catalog' && payload.optimization_goal === 'OFFSITE_CONVERSIONS') {
    blockers.push({
      key: 'adset.offsite_conversions',
      message: `Ad set: OFFSITE_CONVERSIONS není podporováno pro cíl „${spec.objectiveKey}".`,
    });
  }

  if (spec.objectiveKey === 'catalog' && payload.optimization_goal === 'OFFSITE_CONVERSIONS') {
    blockers.push({
      key: 'adset.catalog_offsite',
      message:
        'Ad set: OFFSITE_CONVERSIONS není pro katalogové kampaně v tomto režimu použito — použijte LINK_CLICKS a product_catalog_id.',
    });
  }

  return blockers;
}

export function serializeAdSetPayloadForMetaApi(
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
