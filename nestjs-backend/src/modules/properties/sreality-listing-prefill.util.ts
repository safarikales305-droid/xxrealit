import { isSrealityHost } from '../link-preview/sreality-scraper.util';

export type SrealityListingPrefill = {
  title: string | null;
  description: string | null;
  location: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  district: string | null;
  propertyType: string | null;
  offerType: string | null;
  subType: string | null;
  area: number | null;
  landArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  condition: string | null;
  construction: string | null;
  ownership: string | null;
  energyClass: string | null;
  equipment: string | null;
  price: number | null;
  currency: string | null;
  sourceImageUrls: string[];
  canUseSourceImages: boolean;
  rawSourceData: Record<string, unknown> | null;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = decodeHtmlEntities(v).replace(/\s+/g, ' ').trim();
  return t || null;
}

function pickName(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  return cleanText(o.name) ?? cleanText(o.label) ?? cleanText(o.value);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toInt(v: unknown): number | null {
  const n = toNumber(v);
  return n == null ? null : Math.round(n);
}

function mapOfferType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('pronájem') || s.includes('pronajem') || s.includes('rent')) return 'pronájem';
  if (s.includes('prodej') || s.includes('sale')) return 'prodej';
  return null;
}

function mapPropertyType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('byt') || s.includes('flat')) return 'byt';
  if (s.includes('dům') || s.includes('dum') || s.includes('house')) return 'dům';
  if (s.includes('pozemek') || s.includes('land') || s.includes('parcel')) return 'pozemek';
  if (s.includes('komer') || s.includes('commercial') || s.includes('office')) return 'komerční';
  return 'ostatní';
}

function extractNextDataJson(html: string): unknown | null {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]?.trim()) return null;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return null;
  }
}

function findEstateNode(root: unknown): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];

  const visit = (node: unknown, depth = 0) => {
    if (depth > 18 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    const hasName = typeof o.name === 'string' && o.name.trim().length > 3;
    const hasLocality = o.locality && typeof o.locality === 'object';
    const hasCategory =
      o.categoryMainCb != null || o.categoryTypeCb != null || o.categorySubCb != null;
    const hasArea = o.usableArea != null || o.landArea != null || o.area != null;
    if (hasName && (hasLocality || hasCategory || hasArea)) {
      candidates.push(o);
    }
    for (const v of Object.values(o)) visit(v, depth + 1);
  };

  visit(root);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const score = (x: Record<string, unknown>) =>
      (x.locality ? 3 : 0) +
      (x.description ? 2 : 0) +
      (x.images || x.imageList ? 2 : 0) +
      (x.usableArea != null ? 1 : 0);
    return score(b) - score(a);
  });
  return candidates[0] ?? null;
}

function collectImageUrls(value: unknown, out: string[], depth = 0): void {
  if (depth > 16 || out.length >= 40) return;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^https:\/\/[^"'\s]+\.(?:jpe?g|webp|png)(?:\?|$)/i.test(s)) {
      if (!/logo|icon|favicon|sprite|1x1/i.test(s)) out.push(s);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.url === 'string') collectImageUrls(o.url, out, depth + 1);
    if (typeof o.href === 'string') collectImageUrls(o.href, out, depth + 1);
    for (const v of Object.values(o)) collectImageUrls(v, out, depth + 1);
  }
}

function parseFromUrlPath(pageUrl: string): Partial<SrealityListingPrefill> {
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const detailIdx = parts.findIndex((p) => p === 'detail');
    if (detailIdx < 0) return {};
    const offerRaw = parts[detailIdx + 1] ?? '';
    const typeRaw = parts[detailIdx + 2] ?? '';
    const subRaw = parts[detailIdx + 3] ?? '';
    const cityRaw = parts[detailIdx + 4] ?? '';
    const city = cityRaw ? decodeURIComponent(cityRaw.replace(/-/g, ' ')) : null;
    return {
      offerType: mapOfferType(decodeURIComponent(offerRaw)),
      propertyType: mapPropertyType(decodeURIComponent(typeRaw)),
      subType: subRaw ? decodeURIComponent(subRaw.replace(/-/g, ' ')) : null,
      city: city ? city.charAt(0).toUpperCase() + city.slice(1) : null,
    };
  } catch {
    return {};
  }
}

function localityToFields(locality: unknown): {
  address: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  location: string | null;
} {
  if (!locality || typeof locality !== 'object') {
    return { address: null, city: null, district: null, region: null, location: null };
  }
  const l = locality as Record<string, unknown>;
  const street = cleanText(l.street);
  const city = cleanText(l.city);
  const district = cleanText(l.district) ?? cleanText(l.cityPart);
  const region = cleanText(l.region) ?? cleanText(l.county);
  const address = street;
  const locationParts = [street, district, city, region].filter(Boolean);
  return {
    address,
    city,
    district,
    region,
    location: locationParts.length ? locationParts.join(', ') : null,
  };
}

export function assertSrealityListingUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Neplatná URL');
  }
  if (!isSrealityHost(parsed.href)) {
    throw new Error('Podporovány jsou pouze odkazy ze sreality.cz');
  }
  if (!/\/detail\//i.test(parsed.pathname)) {
    throw new Error('URL musí vést na detail inzerátu na Sreality');
  }
  return parsed;
}

export function parseSrealityListingFromHtml(
  html: string,
  pageUrl: string,
): SrealityListingPrefill | null {
  const fromPath = parseFromUrlPath(pageUrl);
  const nextData = extractNextDataJson(html);
  const estate = nextData ? findEstateNode(nextData) : null;

  if (!estate && !fromPath.city && !fromPath.subType) {
    return null;
  }

  const locality = estate?.locality;
  const locFields = localityToFields(locality);

  const title =
    cleanText(estate?.name) ??
    cleanText(estate?.title) ??
    (fromPath.subType && fromPath.city
      ? `${fromPath.subType}, ${fromPath.city}`
      : null);

  const description = cleanText(estate?.description) ?? cleanText(estate?.text);

  const offerType =
    mapOfferType(pickName(estate?.categoryTypeCb)) ??
    fromPath.offerType ??
    mapOfferType(pickName(estate?.transaction));

  const propertyType =
    mapPropertyType(pickName(estate?.categoryMainCb)) ??
    fromPath.propertyType ??
    mapPropertyType(pickName(estate?.mainCategory));

  const subType =
    pickName(estate?.categorySubCb) ??
    fromPath.subType ??
    pickName(estate?.subCategory);

  const area =
    toNumber(estate?.usableArea) ??
    toNumber(estate?.area) ??
    toNumber(estate?.flatArea);

  const landArea = toNumber(estate?.landArea) ?? toNumber(estate?.parcelArea);

  const floor = toInt(estate?.floorNumber) ?? toInt(estate?.floor);
  const totalFloors = toInt(estate?.buildingFloors) ?? toInt(estate?.totalFloors);

  const condition =
    pickName(estate?.buildingConditionCb) ?? pickName(estate?.condition) ?? cleanText(estate?.state);

  const construction =
    pickName(estate?.buildingTypeCb) ??
    pickName(estate?.construction) ??
    pickName(estate?.structure);

  const ownership = pickName(estate?.ownershipCb) ?? pickName(estate?.ownership);

  const energyClass =
    cleanText(estate?.energyPerformanceCertificate) ??
    pickName(estate?.energyEfficiencyRatingCb) ??
    cleanText(estate?.energyLabel);

  const equipment =
    cleanText(estate?.equipment) ??
    cleanText(estate?.furnishing) ??
    cleanText(estate?.furnished);

  const price =
    toInt(estate?.price) ??
    toInt(estate?.priceCzk) ??
    toInt(estate?.totalPrice);

  const imageCandidates: string[] = [];
  if (estate) {
    collectImageUrls(estate.images ?? estate.imageList ?? estate.photos, imageCandidates);
    collectImageUrls(estate, imageCandidates);
  }
  const sourceImageUrls = [...new Set(imageCandidates)].slice(0, 30);
  const canUseSourceImages = sourceImageUrls.length > 0;

  const city = locFields.city ?? fromPath.city ?? null;
  const location =
    locFields.location ??
    (city ? city : null);

  return {
    title,
    description,
    location,
    address: locFields.address,
    city,
    region: locFields.region,
    district: locFields.district,
    propertyType,
    offerType,
    subType,
    area,
    landArea,
    floor,
    totalFloors,
    condition,
    construction,
    ownership,
    energyClass,
    equipment,
    price,
    currency: price != null ? 'CZK' : null,
    sourceImageUrls,
    canUseSourceImages,
    rawSourceData: estate ?? { fromPath },
  };
}
