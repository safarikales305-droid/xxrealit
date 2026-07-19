import {
  graphGetWithV25FieldFallback,
  META_GRAPH_V25_FIELDS,
  type MetaGraphFetcher,
} from './meta-graph-fields-v25.util';

export type MetaAdsManagerLiveSnapshot = {
  ok: boolean;
  message: string;
  adId: string;
  metaIds: {
    campaignId: string | null;
    adSetId: string | null;
    creativeId: string | null;
    adId: string;
  };
  campaign: Record<string, unknown> | null;
  adSet: Record<string, unknown> | null;
  creative: Record<string, unknown> | null;
  ad: Record<string, unknown> | null;
  fetchErrors: string[];
};

const AD_FIELDS =
  'id,name,status,effective_status,adset_id,creative{id,name,object_story_spec,product_set_id,effective_object_story_id,status}';

const CAMPAIGN_FIELDS =
  'id,name,objective,status,effective_status,special_ad_categories,daily_budget,lifetime_budget,buying_type,bid_strategy,spend_cap';

const ADSET_FIELDS =
  'id,name,account_id,campaign_id,status,effective_status,billing_event,optimization_goal,bid_amount,bid_strategy,daily_budget,lifetime_budget,targeting,promoted_object,destination_type,start_time,end_time,dsa_beneficiary,dsa_payor';

const CREATIVE_FIELDS = META_GRAPH_V25_FIELDS.creative;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function fetchMetaAdsManagerSnapshot(input: {
  graph: MetaGraphFetcher;
  token: string;
  adId: string;
}): Promise<MetaAdsManagerLiveSnapshot> {
  const adId = input.adId.trim();
  const fetchErrors: string[] = [];

  if (!adId) {
    return {
      ok: false,
      message: 'Zadejte ID reklamy z Ads Manager.',
      adId: '',
      metaIds: { campaignId: null, adSetId: null, creativeId: null, adId: '' },
      campaign: null,
      adSet: null,
      creative: null,
      ad: null,
      fetchErrors: ['Chybí adId'],
    };
  }

  const adFetch = await graphGetWithV25FieldFallback<Record<string, unknown>>(
    input.graph,
    `/${adId}`,
    input.token,
    AD_FIELDS,
    'id,name,status,adset_id,creative{id,name}',
  );

  if (!adFetch.result.ok) {
    return {
      ok: false,
      message: `Reklamu ${adId} nelze načíst: ${adFetch.result.errorMessage}`,
      adId,
      metaIds: { campaignId: null, adSetId: null, creativeId: null, adId },
      campaign: null,
      adSet: null,
      creative: null,
      ad: null,
      fetchErrors: [adFetch.result.errorMessage ?? 'Graph API chyba'],
    };
  }

  const ad = adFetch.result.data;
  const adSetId = typeof ad.adset_id === 'string' ? ad.adset_id : null;
  const embeddedCreative = asRecord(ad.creative);
  const creativeId =
    typeof embeddedCreative?.id === 'string'
      ? embeddedCreative.id
      : typeof ad.creative === 'string'
        ? ad.creative
        : null;

  let adSet: Record<string, unknown> | null = null;
  let campaign: Record<string, unknown> | null = null;
  let creative: Record<string, unknown> | null = embeddedCreative;
  let campaignId: string | null = null;

  if (adSetId) {
    const adSetFetch = await graphGetWithV25FieldFallback<Record<string, unknown>>(
      input.graph,
      `/${adSetId}`,
      input.token,
      ADSET_FIELDS,
      META_GRAPH_V25_FIELDS.adSet,
    );
    if (adSetFetch.result.ok) {
      adSet = adSetFetch.result.data;
      campaignId = typeof adSet.campaign_id === 'string' ? adSet.campaign_id : null;
    } else {
      fetchErrors.push(`Ad Set: ${adSetFetch.result.errorMessage}`);
    }
  } else {
    fetchErrors.push('Reklama nemá adset_id');
  }

  if (campaignId) {
    const campaignFetch = await graphGetWithV25FieldFallback<Record<string, unknown>>(
      input.graph,
      `/${campaignId}`,
      input.token,
      CAMPAIGN_FIELDS,
      'id,name,objective,status,special_ad_categories',
    );
    if (campaignFetch.result.ok) {
      campaign = campaignFetch.result.data;
    } else {
      fetchErrors.push(`Campaign: ${campaignFetch.result.errorMessage}`);
    }
  }

  if (creativeId && !creative) {
    const creativeFetch = await graphGetWithV25FieldFallback<Record<string, unknown>>(
      input.graph,
      `/${creativeId}`,
      input.token,
      CREATIVE_FIELDS,
      'id,name,object_story_spec,product_set_id',
    );
    if (creativeFetch.result.ok) {
      creative = creativeFetch.result.data;
    } else {
      fetchErrors.push(`Creative: ${creativeFetch.result.errorMessage}`);
    }
  }

  const adNormalized: Record<string, unknown> = { ...ad };
  if (embeddedCreative) {
    adNormalized.creative = { creative_id: embeddedCreative.id ?? creativeId };
  } else if (creativeId) {
    adNormalized.creative = { creative_id: creativeId };
  }

  return {
    ok: true,
    message: fetchErrors.length
      ? `Načteno s varováními: ${fetchErrors.join(' · ')}`
      : 'Live snapshot z Ads Manager načten.',
    adId,
    metaIds: {
      campaignId,
      adSetId,
      creativeId,
      adId,
    },
    campaign,
    adSet,
    creative,
    ad: adNormalized,
    fetchErrors,
  };
}
