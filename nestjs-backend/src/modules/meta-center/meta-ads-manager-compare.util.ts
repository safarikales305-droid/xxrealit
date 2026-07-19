/**
 * Oficiální pole Meta Marketing API (v25) — Safe Mode povoluje pouze tato pole.
 * @see https://developers.facebook.com/docs/marketing-api/reference
 */
export const META_OFFICIAL_WRITE_FIELDS = {
  campaign: new Set([
    'name',
    'objective',
    'status',
    'special_ad_categories',
    'daily_budget',
    'lifetime_budget',
    'buying_type',
    'bid_strategy',
    'spend_cap',
    'promoted_object',
    'is_skadnetwork_attribution',
    'source_campaign_id',
    'start_time',
    'stop_time',
  ]),
  adSet: new Set([
    'name',
    'campaign_id',
    'status',
    'billing_event',
    'optimization_goal',
    'bid_amount',
    'bid_strategy',
    'daily_budget',
    'lifetime_budget',
    'targeting',
    'promoted_object',
    'start_time',
    'end_time',
    'destination_type',
    'dsa_beneficiary',
    'dsa_payor',
    'is_dynamic_creative',
    'attribution_spec',
    'pacing_type',
    'tune_for_category',
  ]),
  creative: new Set([
    'name',
    'object_story_spec',
    'object_story_id',
    'object_id',
    'product_set_id',
    'url_tags',
    'degrees_of_freedom_spec',
    'asset_feed_spec',
    'template_url',
    'link_url',
    'image_hash',
    'video_id',
    'body',
    'title',
    'call_to_action_type',
  ]),
  ad: new Set(['name', 'adset_id', 'creative', 'status', 'tracking_specs', 'conversion_specs']),
} as const;

/** Read-only / diagnostická pole z Graph GET — při porovnání payloadů ignorovat. */
export const META_GRAPH_READ_ONLY_FIELDS = new Set([
  'id',
  'account_id',
  'effective_status',
  'configured_status',
  'created_time',
  'updated_time',
  'campaign_id',
  'adset_id',
  'effective_object_story_id',
  'thumbnail_url',
  'issues_info',
  'recommendations',
]);

/** XXREALIT vlastní rozšíření mimo oficiální Meta API. */
export const XXREALIT_CUSTOM_PAYLOAD_KEYS = new Set([
  'combinationDiagnostics',
  'catalogLaunchMode',
  'fallbackReason',
  'launchPhase',
  'housingGeoDebug',
  'creativeDiagnostics',
  'placementDiagnostics',
  'metaVerificationStatus',
  'pendingVerificationSupport',
  'preflightChecks',
  'urlDiagnostics',
  'launchHistory',
  'placementSanitizeWarnings',
  'adMetaForm',
  'targeting',
  'productSetId',
]);

export type MetaAdsManagerDiffStatus = 'match' | 'different' | 'missing';

export type MetaAdsManagerDiffRow = {
  path: string;
  status: MetaAdsManagerDiffStatus;
  /** Hodnota z XXREALIT payloadu */
  xxrealit?: unknown;
  /** Hodnota z Ads Manager (live Graph API) */
  adsManager?: unknown;
  /** Kde chybí hodnota při status === 'missing' */
  missingSide?: 'xxrealit' | 'ads_manager' | 'both';
};

export type MetaAdsManagerLayerCompare = {
  layer: 'campaign' | 'adSet' | 'creative' | 'ad';
  xxrealit: Record<string, unknown> | null;
  adsManager: Record<string, unknown> | null;
  diff: MetaAdsManagerDiffRow[];
  matchCount: number;
  differentCount: number;
  missingCount: number;
};

export type MetaAdsManagerCompareResult = {
  ok: boolean;
  message: string;
  safeMode: boolean;
  adId: string | null;
  metaIds: {
    campaignId: string | null;
    adSetId: string | null;
    creativeId: string | null;
    adId: string | null;
  };
  xxrealit: {
    campaign: Record<string, unknown> | null;
    adSet: Record<string, unknown> | null;
    creative: Record<string, unknown> | null;
    ad: Record<string, unknown> | null;
    raw: Record<string, unknown> | null;
  };
  adsManager: {
    campaign: Record<string, unknown> | null;
    adSet: Record<string, unknown> | null;
    creative: Record<string, unknown> | null;
    ad: Record<string, unknown> | null;
  };
  layers: MetaAdsManagerLayerCompare[];
  summary: {
    total: number;
    match: number;
    different: number;
    missing: number;
  };
  clonedPayload?: Record<string, unknown> | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const na = tryParseJson(a);
  const nb = tryParseJson(b);
  return stableStringify(na) === stableStringify(nb);
}

export function pickOfficialFields(
  layer: keyof typeof META_OFFICIAL_WRITE_FIELDS,
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const allowed = META_OFFICIAL_WRITE_FIELDS[layer];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (META_GRAPH_READ_ONLY_FIELDS.has(k)) continue;
    if (allowed.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function stripXxrealitCustomKeys(
  snapshot: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (XXREALIT_CUSTOM_PAYLOAD_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function normalizeXxrealitLayerPayloads(
  launchPayloads: Record<string, unknown> | null | undefined,
  safeMode: boolean,
): {
  campaign: Record<string, unknown> | null;
  adSet: Record<string, unknown> | null;
  creative: Record<string, unknown> | null;
  ad: Record<string, unknown> | null;
} {
  if (!launchPayloads) {
    return { campaign: null, adSet: null, creative: null, ad: null };
  }

  const base = safeMode ? stripXxrealitCustomKeys(launchPayloads) : launchPayloads;
  if (!base) {
    return { campaign: null, adSet: null, creative: null, ad: null };
  }

  const campaign = (base.campaign as Record<string, unknown> | null) ?? null;
  let adSet = (base.adSet as Record<string, unknown> | null) ?? null;
  const creative = (base.creative as Record<string, unknown> | null) ?? null;
  const ad = (base.ad as Record<string, unknown> | null) ?? null;

  if (!safeMode && base.targeting && isPlainObject(base.targeting) && adSet) {
    adSet = { ...adSet, targeting: base.targeting };
  } else if (!safeMode && base.targeting && isPlainObject(base.targeting) && !adSet) {
    adSet = { targeting: base.targeting };
  }

  if (safeMode) {
    return {
      campaign: pickOfficialFields('campaign', campaign),
      adSet: pickOfficialFields('adSet', adSet),
      creative: pickOfficialFields('creative', creative),
      ad: pickOfficialFields('ad', ad),
    };
  }

  return { campaign, adSet, creative, ad };
}

export function normalizeAdsManagerLayerPayload(
  layer: keyof typeof META_OFFICIAL_WRITE_FIELDS,
  input: Record<string, unknown> | null | undefined,
  safeMode: boolean,
): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (META_GRAPH_READ_ONLY_FIELDS.has(k)) continue;
    stripped[k] = v;
  }
  if (safeMode) return pickOfficialFields(layer, stripped);
  return Object.keys(stripped).length ? stripped : null;
}

function collectPaths(
  left: unknown,
  right: unknown,
  prefix: string,
  paths: Set<string>,
): void {
  const lObj = isPlainObject(left);
  const rObj = isPlainObject(right);

  if (lObj || rObj) {
    const keys = new Set([
      ...(lObj ? Object.keys(left as Record<string, unknown>) : []),
      ...(rObj ? Object.keys(right as Record<string, unknown>) : []),
    ]);
    if (keys.size === 0) {
      paths.add(prefix || '.');
      return;
    }
    for (const key of keys) {
      const next = prefix ? `${prefix}.${key}` : key;
      collectPaths(
        lObj ? (left as Record<string, unknown>)[key] : undefined,
        rObj ? (right as Record<string, unknown>)[key] : undefined,
        next,
        paths,
      );
    }
    return;
  }

  paths.add(prefix || '.');
}

export function deepCompareMetaPayloads(
  xxrealit: Record<string, unknown> | null,
  adsManager: Record<string, unknown> | null,
): MetaAdsManagerDiffRow[] {
  const paths = new Set<string>();
  collectPaths(xxrealit, adsManager, '', paths);

  const rows: MetaAdsManagerDiffRow[] = [];

  for (const path of [...paths].sort()) {
    const getAt = (root: Record<string, unknown> | null, p: string): unknown => {
      if (!root) return undefined;
      if (!p || p === '.') return root;
      let cur: unknown = root;
      for (const part of p.split('.')) {
        if (!isPlainObject(cur) || !(part in cur)) return undefined;
        cur = (cur as Record<string, unknown>)[part];
      }
      return cur;
    };

    const lv = getAt(xxrealit, path);
    const rv = getAt(adsManager, path);
    const lMissing = lv === undefined;
    const rMissing = rv === undefined;

    if (lMissing && rMissing) continue;

    if (lMissing || rMissing) {
      rows.push({
        path,
        status: 'missing',
        xxrealit: lMissing ? undefined : lv,
        adsManager: rMissing ? undefined : rv,
        missingSide:
          lMissing && rMissing ? 'both' : lMissing ? 'xxrealit' : 'ads_manager',
      });
      continue;
    }

    rows.push({
      path,
      status: valuesEqual(lv, rv) ? 'match' : 'different',
      xxrealit: lv,
      adsManager: rv,
    });
  }

  return rows;
}

export function compareMetaAdsManagerLayers(input: {
  xxrealit: {
    campaign: Record<string, unknown> | null;
    adSet: Record<string, unknown> | null;
    creative: Record<string, unknown> | null;
    ad: Record<string, unknown> | null;
  };
  adsManager: {
    campaign: Record<string, unknown> | null;
    adSet: Record<string, unknown> | null;
    creative: Record<string, unknown> | null;
    ad: Record<string, unknown> | null;
  };
}): MetaAdsManagerLayerCompare[] {
  const layers: Array<{
    layer: MetaAdsManagerLayerCompare['layer'];
    xx: Record<string, unknown> | null;
    am: Record<string, unknown> | null;
  }> = [
    { layer: 'campaign', xx: input.xxrealit.campaign, am: input.adsManager.campaign },
    { layer: 'adSet', xx: input.xxrealit.adSet, am: input.adsManager.adSet },
    { layer: 'creative', xx: input.xxrealit.creative, am: input.adsManager.creative },
    { layer: 'ad', xx: input.xxrealit.ad, am: input.adsManager.ad },
  ];

  return layers.map(({ layer, xx, am }) => {
    const diff = deepCompareMetaPayloads(xx, am);
    return {
      layer,
      xxrealit: xx,
      adsManager: am,
      diff,
      matchCount: diff.filter((d) => d.status === 'match').length,
      differentCount: diff.filter((d) => d.status === 'different').length,
      missingCount: diff.filter((d) => d.status === 'missing').length,
    };
  });
}

export function buildClonedPayloadFromAdsManager(input: {
  campaign: Record<string, unknown> | null;
  adSet: Record<string, unknown> | null;
  creative: Record<string, unknown> | null;
  ad: Record<string, unknown> | null;
  safeMode: boolean;
}): Record<string, unknown> {
  const layers = {
    campaign: normalizeAdsManagerLayerPayload('campaign', input.campaign, input.safeMode),
    adSet: normalizeAdsManagerLayerPayload('adSet', input.adSet, input.safeMode),
    creative: normalizeAdsManagerLayerPayload('creative', input.creative, input.safeMode),
    ad: normalizeAdsManagerLayerPayload('ad', input.ad, input.safeMode),
  };

  const targeting =
    layers.adSet && isPlainObject(layers.adSet.targeting) ? layers.adSet.targeting : null;

  const adSet = layers.adSet ? { ...layers.adSet } : null;
  if (adSet && targeting) {
    const { targeting: _t, ...rest } = adSet;
    return {
      campaign: layers.campaign,
      adSet: rest,
      targeting,
      creative: layers.creative,
      ad: layers.ad,
      launchPhase: 'cloned_from_ads_manager',
      launchHistory: [`Clonováno z Ads Manager ${new Date().toISOString()}`],
    };
  }

  return {
    campaign: layers.campaign,
    adSet: layers.adSet,
    creative: layers.creative,
    ad: layers.ad,
    launchPhase: 'cloned_from_ads_manager',
    launchHistory: [`Clonováno z Ads Manager ${new Date().toISOString()}`],
  };
}

export function summarizeDiffLayers(layers: MetaAdsManagerLayerCompare[]): {
  total: number;
  match: number;
  different: number;
  missing: number;
} {
  return layers.reduce(
    (acc, l) => ({
      total: acc.total + l.diff.length,
      match: acc.match + l.matchCount,
      different: acc.different + l.differentCount,
      missing: acc.missing + l.missingCount,
    }),
    { total: 0, match: 0, different: 0, missing: 0 },
  );
}
