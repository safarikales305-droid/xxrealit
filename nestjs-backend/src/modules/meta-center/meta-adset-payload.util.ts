/** @deprecated Importujte z meta-campaign-payload-map.util */
export {
  type MetaCampaignModeKey,
  type MetaCampaignPayloadSpec,
  type MetaCampaignPayloadContext,
  type MetaCampaignGoalKey as MetaCampaignObjectiveKey,
  normalizeCampaignGoal as normalizeCampaignObjectiveKey,
  normalizeCreativeSource,
  resolveMetaCampaignMode,
  getMetaCampaignPayloadSpec,
  resolveMetaCampaignPayloadSpec,
  buildPromotedObjectForSpec as buildAdSetPromotedObject,
  validateAdSetPayloadCombination as validateAdSetPayloadForObjective,
  serializePayloadForMetaApi as serializeAdSetPayloadForMetaApi,
  extractLeadFormId,
  mapCampaignObjectiveToMeta,
} from './meta-campaign-payload-map.util';

import {
  getMetaCampaignPayloadSpec,
  resolveMetaCampaignMode,
  type MetaCampaignPayloadSpec,
} from './meta-campaign-payload-map.util';

/** @deprecated */
export type AdSetObjectiveSpec = MetaCampaignPayloadSpec;

export function resolveAdSetObjectiveSpec(
  goal: string,
  creativeType?: string,
  targetingMode?: string,
): MetaCampaignPayloadSpec {
  const resolved = resolveMetaCampaignMode({ goal, creativeType, targetingMode });
  const mode = resolved.mode ?? 'traffic';
  return getMetaCampaignPayloadSpec(mode, { goal, creativeType: creativeType ?? 'listing' });
}
