import type { MetaCampaignDraftBody, MetaCampaignDraft, MetaCampaignProductItem } from '@/lib/nest-client';

export type MetaCampaignFormInput = {
  name: string;
  goal: string;
  propertyType: string;
  cityName: string;
  locationLabel: string;
  metaGeoKey: string;
  metaGeoCountry: string;
  metaGeoRegion: string;
  latitude: string;
  longitude: string;
  radiusKm: number;
  budgetDaily: number;
  startDate: string;
  endDate: string;
  selectedProductIds: string[];
  creativeType: string;
  targetingMode: string;
  locationTargetingMode: 'city' | 'radius';
  audienceId: string;
  creativePayload: Record<string, unknown>;
};

function parseCoord(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function selectedProductsFromInput(
  input: MetaCampaignFormInput,
  products?: MetaCampaignProductItem[],
): MetaCampaignProductItem[] {
  const ids = new Set(
    (Array.isArray(input.selectedProductIds) ? input.selectedProductIds : []).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ),
  );
  return (products ?? []).filter((p) => ids.has(p.id));
}

export function buildMetaCampaignSubmitPayload(
  input: MetaCampaignFormInput,
  products?: MetaCampaignProductItem[],
): MetaCampaignDraftBody {
  const cp = input.creativePayload ?? {};
  const selectedProductIds = [
    ...(Array.isArray(input.selectedProductIds)
      ? input.selectedProductIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []),
  ];
  const selectedProducts = selectedProductsFromInput(input, products);
  const firstProduct = selectedProducts[0];

  const primaryText = String(cp.primaryText ?? cp.text ?? firstProduct?.title ?? '').trim();
  const headline = String(cp.headline ?? firstProduct?.title ?? '').trim();
  const description = String(cp.description ?? '').trim();
  const cta = String(cp.cta ?? cp.ctaType ?? 'Zjistit více').trim();
  const websiteUrl = String(cp.link ?? cp.detailUrl ?? firstProduct?.detailUrl ?? '').trim();
  const gallery = Array.isArray(cp.gallery) ? cp.gallery : [];
  const imageUrl = String(cp.image ?? gallery[0] ?? firstProduct?.imageUrl ?? '').trim();

  const lat = parseCoord(input.latitude);
  const lng = parseCoord(input.longitude);

  const creativePayload: Record<string, unknown> = {
    ...cp,
    primaryText,
    text: String(cp.text ?? primaryText),
    headline,
    description,
    cta,
    ctaType: String(cp.ctaType ?? 'LEARN_MORE'),
    link: websiteUrl,
    detailUrl: websiteUrl,
  };
  if (imageUrl) {
    creativePayload.image = imageUrl;
    if (!Array.isArray(creativePayload.gallery) || creativePayload.gallery.length === 0) {
      creativePayload.gallery = [imageUrl];
    }
  }

  const payload: MetaCampaignDraftBody = {
    name: String(input.name ?? '').trim(),
    objective: String(input.goal ?? 'traffic'),
    propertyType: String(input.propertyType ?? 'byt'),
    cityName: String(input.cityName ?? input.locationLabel ?? '').trim(),
    radiusKm: Number(input.radiusKm) > 0 ? Number(input.radiusKm) : 15,
    dailyBudgetCzk: Number(input.budgetDaily) > 0 ? Number(input.budgetDaily) : 1,
    startDate: String(input.startDate ?? ''),
    endDate: String(input.endDate ?? ''),
    selectedProductIds,
    creativeType: String(input.creativeType ?? 'catalog_products'),
    targetingMode: String(input.targetingMode ?? 'map'),
    locationTargetingMode: input.locationTargetingMode === 'radius' ? 'radius' : 'city',
    creativePayload,
  };

  const metaGeoKey = String(input.metaGeoKey ?? '').trim();
  if (metaGeoKey) payload.metaGeoKey = metaGeoKey;

  const metaGeoCountry = String(input.metaGeoCountry ?? '').trim();
  if (metaGeoCountry) payload.metaGeoCountry = metaGeoCountry;

  const metaGeoRegion = String(input.metaGeoRegion ?? '').trim();
  if (metaGeoRegion) payload.metaGeoRegion = metaGeoRegion;

  if (lat != null) payload.latitude = lat;
  if (lng != null) payload.longitude = lng;

  const audienceId = String(input.audienceId ?? '').trim();
  if (audienceId) payload.audienceId = audienceId;

  const leadFormId =
    typeof cp.leadFormId === 'string' && cp.leadFormId.trim() ? cp.leadFormId.trim() : '';
  if (leadFormId) payload.leadFormId = leadFormId;

  return payload;
}

export function metaCampaignFormInputFromDraft(c: MetaCampaignDraft): MetaCampaignFormInput {
  return {
    name: c.name ?? '',
    goal: c.objective ?? 'traffic',
    propertyType: c.propertyType ?? 'byt',
    cityName: c.cityName ?? '',
    locationLabel: c.cityName ?? '',
    metaGeoKey: c.metaGeoKey ?? '',
    metaGeoCountry: c.metaGeoCountry ?? '',
    metaGeoRegion: c.metaGeoRegion ?? '',
    latitude: c.latitude != null ? String(c.latitude) : '',
    longitude: c.longitude != null ? String(c.longitude) : '',
    radiusKm: c.radiusKm ?? 15,
    budgetDaily: c.dailyBudgetCzk ?? 200,
    startDate: c.startDate ?? '',
    endDate: c.endDate ?? '',
    selectedProductIds: Array.isArray(c.selectedProductIds)
      ? c.selectedProductIds.filter((id): id is string => typeof id === 'string')
      : [],
    creativeType: c.creativeType ?? 'catalog_products',
    targetingMode: c.targetingMode ?? 'map',
    locationTargetingMode: c.locationTargetingMode === 'radius' ? 'radius' : 'city',
    audienceId: c.audienceId ?? '',
    creativePayload: (c.creativePayload as Record<string, unknown>) ?? {},
  };
}

export function buildMetaCampaignSubmitPayloadFromDraft(
  draft: MetaCampaignDraft,
  products?: MetaCampaignProductItem[],
): MetaCampaignDraftBody {
  return buildMetaCampaignSubmitPayload(metaCampaignFormInputFromDraft(draft), products);
}

export function logMetaCampaignSubmitPayload(payload: MetaCampaignDraftBody): void {
  console.log('META PAYLOAD', payload);
}
