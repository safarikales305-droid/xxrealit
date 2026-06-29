import {
  type SrealityListingPrefill,
  mapOfferType,
  mapPropertyType,
} from './sreality-listing-prefill.util';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type SrealityApiFetchResult = {
  ok: boolean;
  strategy: 'api-v1' | 'api-v2' | null;
  httpStatus: number | null;
  data: SrealityListingPrefill | null;
  raw: unknown;
  errorDetail?: string;
};

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t || null;
}

function pickCbName(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const name = (v as { name?: unknown }).name;
  return cleanText(name);
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function toNumber(v: unknown): number | null {
  const n = toInt(v);
  return n;
}

function normalizeImageUrl(url: string): string {
  const s = url.trim();
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http')) return s;
  return `https://${s}`;
}

function localityFromV1(locality: unknown): Partial<
  Pick<SrealityListingPrefill, 'address' | 'city' | 'district' | 'region' | 'location'>
> {
  if (!locality || typeof locality !== 'object') return {};
  const l = locality as Record<string, unknown>;
  const street = cleanText(l.street);
  const city = cleanText(l.city) ?? cleanText(l.municipality);
  const district = cleanText(l.district) ?? cleanText(l.citypart);
  const region = cleanText(l.region);
  const parts = [street, district, city, region].filter(Boolean);
  return {
    address: street,
    city,
    district,
    region,
    location: parts.length ? parts.join(', ') : city,
  };
}

export function mapV1EstateToPrefill(
  estate: Record<string, unknown>,
  sourceUrl: string,
): SrealityListingPrefill {
  const loc = localityFromV1(estate.locality);
  const price =
    toInt(estate.price_czk) ??
    toInt(estate.price_summary_czk) ??
    toInt(estate.price) ??
    toInt(estate.price_summary);

  const images: string[] = [];
  const rawImages = estate.advert_images;
  if (Array.isArray(rawImages)) {
    for (const img of rawImages) {
      if (img && typeof img === 'object' && typeof (img as { url?: string }).url === 'string') {
        images.push(normalizeImageUrl((img as { url: string }).url));
      }
    }
  }

  const stateName = pickCbName(estate.state_cb);
  const condition = stateName && !/^-\s*vyber/i.test(stateName) ? stateName : null;

  return {
    title: cleanText(estate.advert_name) ?? cleanText(estate.name),
    description: cleanText(estate.advert_description) ?? cleanText(estate.description),
    location: loc.location ?? null,
    address: loc.address ?? null,
    city: loc.city ?? null,
    region: loc.region ?? null,
    district: loc.district ?? null,
    offerType:
      mapOfferType(pickCbName(estate.category_type_cb)) ??
      mapOfferType(cleanText(estate.object_type)),
    propertyType:
      mapPropertyType(pickCbName(estate.category_main_cb)) ??
      mapPropertyType(cleanText(estate.object_type)),
    subType: pickCbName(estate.category_sub_cb),
    area:
      toNumber(estate.usable_area) ??
      toNumber(estate.building_area) ??
      toNumber(estate.floor_area),
    landArea: toNumber(estate.garden_area),
    floor: toInt(estate.floor_number),
    totalFloors: toInt(estate.floors),
    condition,
    construction: pickCbName(estate.building_type),
    ownership: null,
    energyClass:
      cleanText(estate.energy_performance_certificate) ??
      pickCbName(estate.energy_efficiency_rating_cb),
    equipment: cleanText(estate.furnished),
    price,
    currency: price != null ? 'CZK' : null,
    sourceImageUrls: [...new Set(images)].slice(0, 30),
    canUseSourceImages: images.length > 0,
    rawSourceData: { ...estate, sourceUrl },
  };
}

export function mapV2EstateToPrefill(
  estate: Record<string, unknown>,
  sourceUrl: string,
): SrealityListingPrefill {
  const loc = localityFromV1(estate.locality);
  const price =
    toInt(estate.price) ??
    toInt(estate.priceCzk) ??
    toInt(estate.price_summary) ??
    toInt(estate.priceSummary);

  const images: string[] = [];
  if (Array.isArray(estate.images)) {
    for (const img of estate.images) {
      if (typeof img === 'string') images.push(normalizeImageUrl(img));
      if (img && typeof img === 'object' && typeof (img as { url?: string }).url === 'string') {
        images.push(normalizeImageUrl((img as { url: string }).url));
      }
    }
  }

  return {
    title: cleanText(estate.name) ?? cleanText(estate.title),
    description: cleanText(estate.description) ?? cleanText(estate.text),
    location: loc.location ?? null,
    address: loc.address ?? null,
    city: loc.city ?? null,
    region: loc.region ?? null,
    district: loc.district ?? null,
    offerType:
      mapOfferType(pickCbName(estate.categoryTypeCb)) ??
      mapOfferType(pickCbName(estate.transaction)),
    propertyType:
      mapPropertyType(pickCbName(estate.categoryMainCb)) ??
      mapPropertyType(pickCbName(estate.mainCategory)),
    subType: pickCbName(estate.categorySubCb) ?? pickCbName(estate.subCategory),
    area: toNumber(estate.usableArea) ?? toNumber(estate.area),
    landArea: toNumber(estate.landArea),
    floor: toInt(estate.floorNumber) ?? toInt(estate.floor),
    totalFloors: toInt(estate.buildingFloors) ?? toInt(estate.totalFloors),
    condition: pickCbName(estate.buildingConditionCb) ?? pickCbName(estate.condition),
    construction: pickCbName(estate.buildingTypeCb) ?? pickCbName(estate.construction),
    ownership: pickCbName(estate.ownershipCb) ?? pickCbName(estate.ownership),
    energyClass:
      cleanText(estate.energyPerformanceCertificate) ??
      pickCbName(estate.energyEfficiencyRatingCb),
    equipment: cleanText(estate.furnished) ?? cleanText(estate.equipment),
    price,
    currency: price != null ? 'CZK' : null,
    sourceImageUrls: [...new Set(images)].slice(0, 30),
    canUseSourceImages: images.length > 0,
    rawSourceData: { ...estate, sourceUrl },
  };
}

function parseApiJson(payload: unknown, sourceUrl: string): {
  strategy: 'api-v1' | 'api-v2';
  data: SrealityListingPrefill;
} | null {
  if (!payload || typeof payload !== 'object') return null;

  const root = payload as Record<string, unknown>;
  if (root.result && typeof root.result === 'object') {
    const data = mapV1EstateToPrefill(root.result as Record<string, unknown>, sourceUrl);
    if (data.title || data.description) return { strategy: 'api-v1', data };
  }

  if (root.name || root.advert_name || root.locality) {
    const data = mapV2EstateToPrefill(root, sourceUrl);
    if (data.title || data.description) return { strategy: 'api-v2', data };
  }

  return null;
}

export function buildSrealityApiUrls(listingId: string): Array<{ strategy: 'api-v1' | 'api-v2'; url: string }> {
  const tms = String(Date.now());
  return [
    {
      strategy: 'api-v1',
      url: `https://www.sreality.cz/api/v1/estates/${listingId}?tms=${tms}`,
    },
    {
      strategy: 'api-v2',
      url: `https://www.sreality.cz/api/cs/v2/estates/${listingId}?tms=${tms}`,
    },
  ];
}

export async function fetchSrealityEstateFromApi(
  listingId: string,
  sourceUrl: string,
  timeoutMs = 12_000,
): Promise<SrealityApiFetchResult> {
  const endpoints = buildSrealityApiUrls(listingId);
  let lastStatus: number | null = null;
  let lastError: string | undefined;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_USER_AGENT,
          Referer: sourceUrl,
        },
      });
      lastStatus = res.status;
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('json')) {
        lastError = `HTTP ${res.status} (${endpoint.strategy})`;
        continue;
      }
      const json = (await res.json()) as unknown;
      const parsed = parseApiJson(json, sourceUrl);
      if (parsed) {
        return {
          ok: true,
          strategy: parsed.strategy,
          httpStatus: res.status,
          data: parsed.data,
          raw: json,
        };
      }
      lastError = `${endpoint.strategy}: JSON bez rozpoznatelných dat`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    strategy: null,
    httpStatus: lastStatus,
    data: null,
    raw: null,
    errorDetail: lastError,
  };
}
