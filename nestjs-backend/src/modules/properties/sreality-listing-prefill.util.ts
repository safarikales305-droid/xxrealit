import { isSrealityHost } from '../link-preview/sreality-scraper.util';
import { parseOgFromHtml } from '../link-preview/og-html-parser.util';

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
  sourceExternalId?: string | null;
  brokerAgentName?: string | null;
  brokerCompanyName?: string | null;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
  brokerPhotoUrl?: string | null;
  brokerLogoUrl?: string | null;
  brokerProfileUrl?: string | null;
  brokerSourceExternalId?: string | null;
};

export type SrealityParseDebug = {
  foundJsonLd: boolean;
  foundNextData: boolean;
  foundInitialState: boolean;
  foundOpenGraph: boolean;
  foundHtmlParser: boolean;
  parsersUsed: string[];
  fieldsFound: string[];
  fieldsFoundCount: number;
};

type PartialPrefill = Partial<SrealityListingPrefill>;

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
  const t = decodeHtmlEntities(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
    const n = Number(v.replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toInt(v: unknown): number | null {
  const n = toNumber(v);
  return n == null ? null : Math.round(n);
}

export function mapOfferType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('pronájem') || s.includes('pronajem') || s.includes('rent')) return 'pronájem';
  if (s.includes('prodej') || s.includes('sale') || s.includes('dražba')) return 'prodej';
  return null;
}

export function mapPropertyType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('byt') || s.includes('flat')) return 'byt';
  if (s.includes('dům') || s.includes('dum') || s.includes('house') || s.includes('chalupa') || s.includes('chata')) {
    return 'dům';
  }
  if (s.includes('pozemek') || s.includes('land') || s.includes('parcel') || s.includes('louka') || s.includes('pole')) {
    return 'pozemek';
  }
  if (s.includes('komer') || s.includes('commercial') || s.includes('office') || s.includes('sklad')) {
    return 'komerční';
  }
  if (s.includes('garáž') || s.includes('garaz') || s.includes('garage')) return 'ostatní';
  return 'ostatní';
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as unknown);
    } catch {
      /* skip */
    }
  }
  return out;
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

function extractInitialStateJson(html: string): unknown | null {
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
    /"__INITIAL_STATE__"\s*:\s*(\{[\s\S]*?\})\s*[,}]/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    try {
      return JSON.parse(m[1]) as unknown;
    } catch {
      /* try next */
    }
  }
  return null;
}

function findEstateNode(root: unknown): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];

  const visit = (node: unknown, depth = 0) => {
    if (depth > 22 || !node || typeof node !== 'object') return;
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

function extractEstateFromNextData(nextData: unknown): Record<string, unknown> | null {
  if (!nextData || typeof nextData !== 'object') return null;
  const pp = (nextData as { props?: { pageProps?: Record<string, unknown> } }).props?.pageProps;
  if (!pp) return findEstateNode(nextData);

  for (const key of ['estate', 'estateDetail', 'advert', 'detail', 'data']) {
    const candidate = pp[key];
    if (candidate && typeof candidate === 'object') {
      const o = candidate as Record<string, unknown>;
      if (typeof o.name === 'string' || o.locality || o.usableArea != null) return o;
    }
  }

  const queries = (pp.dehydratedState as { queries?: unknown[] } | undefined)?.queries;
  if (Array.isArray(queries)) {
    for (const q of queries) {
      const data = (q as { state?: { data?: Record<string, unknown> } })?.state?.data;
      if (data && (data.name || data.locality || data.usableArea != null)) return data;
    }
  }

  return findEstateNode(nextData);
}

function collectImageUrls(value: unknown, out: string[], depth = 0): void {
  if (depth > 18 || out.length >= 40) return;
  if (typeof value === 'string') {
    const s = value.trim().replace(/\\\//g, '/');
    if (
      /^(https?:)?\/\/[^"'\s]+\.(?:jpe?g|webp|png)(?:\?|$)/i.test(s) ||
      /^\/[^"'\s]+\.(?:jpe?g|webp|png)(?:\?|$)/i.test(s)
    ) {
      if (!/logo|icon|favicon|sprite|1x1/i.test(s)) {
        out.push(s.startsWith('/') && !s.startsWith('//') ? `https://img.sreality.cz${s}` : s.startsWith('//') ? `https:${s}` : s);
      }
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

function localityToFields(locality: unknown): PartialPrefill {
  if (!locality || typeof locality !== 'object') return {};
  const l = locality as Record<string, unknown>;
  const street = cleanText(l.street);
  const city = cleanText(l.city);
  const district = cleanText(l.district) ?? cleanText(l.cityPart);
  const region = cleanText(l.region) ?? cleanText(l.county);
  const locationParts = [street, district, city, region].filter(Boolean);
  return {
    address: street,
    city,
    district,
    region,
    location: locationParts.length ? locationParts.join(', ') : city,
  };
}

function estateToPartial(estate: Record<string, unknown>): PartialPrefill {
  const loc = localityToFields(estate.locality);
  const price =
    toInt(estate.price) ?? toInt(estate.priceCzk) ?? toInt(estate.totalPrice) ?? toInt(estate.priceSummary);

  const images: string[] = [];
  collectImageUrls(estate.images ?? estate.imageList ?? estate.photos ?? estate._images, images);
  collectImageUrls(estate, images);

  return {
    ...loc,
    title: cleanText(estate.name) ?? cleanText(estate.title),
    description: cleanText(estate.description) ?? cleanText(estate.text),
    offerType:
      mapOfferType(pickName(estate.categoryTypeCb)) ?? mapOfferType(pickName(estate.transaction)),
    propertyType:
      mapPropertyType(pickName(estate.categoryMainCb)) ??
      mapPropertyType(pickName(estate.mainCategory)),
    subType:
      pickName(estate.categorySubCb) ?? pickName(estate.subCategory) ?? pickName(estate.disposition),
    area: toNumber(estate.usableArea) ?? toNumber(estate.area) ?? toNumber(estate.flatArea),
    landArea: toNumber(estate.landArea) ?? toNumber(estate.parcelArea),
    floor: toInt(estate.floorNumber) ?? toInt(estate.floor),
    totalFloors: toInt(estate.buildingFloors) ?? toInt(estate.totalFloors),
    condition:
      pickName(estate.buildingConditionCb) ??
      pickName(estate.condition) ??
      cleanText(estate.state),
    construction:
      pickName(estate.buildingTypeCb) ??
      pickName(estate.construction) ??
      pickName(estate.structure),
    ownership: pickName(estate.ownershipCb) ?? pickName(estate.ownership),
    energyClass:
      cleanText(estate.energyPerformanceCertificate) ??
      pickName(estate.energyEfficiencyRatingCb) ??
      cleanText(estate.energyLabel),
    equipment:
      cleanText(estate.equipment) ??
      cleanText(estate.furnishing) ??
      cleanText(estate.furnished),
    price,
    currency: price != null ? 'CZK' : null,
    sourceImageUrls: [...new Set(images)].slice(0, 30),
    canUseSourceImages: images.length > 0,
  };
}

function parseJsonLd(html: string): PartialPrefill | null {
  const blocks = extractJsonLdBlocks(html);
  if (!blocks.length) return null;

  let title: string | null = null;
  let description: string | null = null;
  let price: number | null = null;
  const images: string[] = [];
  let address: string | null = null;
  let city: string | null = null;

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    const o = node as Record<string, unknown>;
    const type = String(o['@type'] ?? '').toLowerCase();
    const isListing =
      type.includes('realestate') ||
      type.includes('apartment') ||
      type.includes('house') ||
      type.includes('product') ||
      type.includes('offer');

    if (isListing || o.name) {
      title = title ?? cleanText(o.name) ?? cleanText(o.headline);
      description = description ?? cleanText(o.description);
    }

    const offers = o.offers;
    if (offers && typeof offers === 'object') {
      const off = Array.isArray(offers) ? offers[0] : offers;
      if (off && typeof off === 'object') {
        price = price ?? toInt((off as Record<string, unknown>).price);
      }
    }
    price = price ?? toInt(o.price);

    const img = o.image ?? o.photo;
    if (typeof img === 'string') images.push(img);
    if (Array.isArray(img)) {
      for (const i of img) {
        if (typeof i === 'string') images.push(i);
        if (i && typeof i === 'object' && typeof (i as { url?: string }).url === 'string') {
          images.push((i as { url: string }).url);
        }
      }
    }

    const addr = o.address;
    if (addr && typeof addr === 'object') {
      const a = addr as Record<string, unknown>;
      address = address ?? cleanText(a.streetAddress);
      city = city ?? cleanText(a.addressLocality);
    }

    for (const v of Object.values(o)) visit(v);
  };

  for (const b of blocks) visit(b);
  if (!title && !description && !price) return null;

  return {
    title,
    description,
    price,
    currency: price != null ? 'CZK' : null,
    address,
    city,
    location: [address, city].filter(Boolean).join(', ') || city,
    sourceImageUrls: [...new Set(images)].slice(0, 30),
    canUseSourceImages: images.length > 0,
  };
}

function parseOpenGraph(html: string, pageUrl: string): PartialPrefill | null {
  const og = parseOgFromHtml(html, pageUrl);
  if (!og.title && !og.description) return null;

  let price: number | null = null;
  const priceMeta =
    html.match(/property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i)?.[1];
  if (priceMeta) price = toInt(priceMeta);

  const images = og.image ? [og.image] : [];

  return {
    title: og.title || null,
    description: og.description || null,
    price,
    currency: price != null ? 'CZK' : null,
    sourceImageUrls: images,
    canUseSourceImages: images.length > 0,
  };
}

function parseHtmlDom(html: string): PartialPrefill | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = h1 ? cleanText(h1.replace(/<[^>]+>/g, '')) : null;

  const params: Record<string, string> = {};
  const dtdd = html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi);
  for (const m of dtdd) {
    const key = m[1]?.trim().toLowerCase() ?? '';
    const val = cleanText(m[2]?.replace(/<[^>]+>/g, ' ') ?? '');
    if (key && val) params[key] = val;
  }

  const labelPairs = html.matchAll(
    /(?:>Plocha<|>Užitná plocha<|>Pozemek<|>Dispozice<|>Stav<|>Patro<|>Energetická třída<)[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</gi,
  );
  for (const m of labelPairs) {
    /* fallback — params from dt/dd preferred */
  }

  const area = toNumber(params['plocha'] ?? params['užitná plocha'] ?? params['celková plocha']);
  const landArea = toNumber(params['pozemek'] ?? params['plocha pozemku']);
  const subType = params['dispozice'] ?? params['podkategorie'] ?? null;
  const condition = params['stav'] ?? params['stav objektu'] ?? null;
  const floorRaw = params['patro'] ?? params['podlaží'] ?? '';
  const floorMatch = floorRaw.match(/(\d+)/);
  const floor = floorMatch ? toInt(floorMatch[1]) : null;
  const energyClass = params['energetická třída'] ?? params['penb'] ?? null;

  const priceMatch =
    html.match(/data-price=["'](\d+)["']/i) ??
    html.match(/class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?([\d\s]{5,})/i);
  const price = priceMatch ? toInt(priceMatch[1]) : null;

  if (!title && !area && !subType && !price) return null;

  return {
    title,
    subType,
    area,
    landArea,
    floor,
    condition,
    energyClass,
    price,
    currency: price != null ? 'CZK' : null,
  };
}

function parseFromUrlPath(pageUrl: string): PartialPrefill {
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const detailIdx = parts.findIndex((p) => p === 'detail');
    if (detailIdx < 0) return {};
    const offerRaw = decodeURIComponent(parts[detailIdx + 1] ?? '');
    const typeRaw = decodeURIComponent(parts[detailIdx + 2] ?? '');
    const subRaw = decodeURIComponent(parts[detailIdx + 3] ?? '');
    const cityRaw = decodeURIComponent(parts[detailIdx + 4] ?? '');
    const city = cityRaw ? cityRaw.replace(/-/g, ' ') : null;
    const formattedCity = city
      ? city
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : null;
    const subType = subRaw ? subRaw.replace(/-/g, ' ').replace(/\+/g, '+') : null;
    return {
      offerType: mapOfferType(offerRaw),
      propertyType: mapPropertyType(typeRaw),
      subType,
      city: formattedCity,
      location: formattedCity,
      title: subType && formattedCity ? `${subType}, ${formattedCity}` : subType ?? formattedCity,
    };
  } catch {
    return {};
  }
}

function mergePartials(
  sources: Array<{ name: string; partial: PartialPrefill | null }>,
): { data: SrealityListingPrefill; debug: SrealityParseDebug } {
  const parsersUsed: string[] = [];
  const fieldSet = new Set<string>();

  const pick = <K extends keyof SrealityListingPrefill>(key: K): SrealityListingPrefill[K] => {
    for (const src of sources) {
      const v = src.partial?.[key];
      if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
        fieldSet.add(key);
        return v as SrealityListingPrefill[K];
      }
    }
    return (key === 'sourceImageUrls' ? [] : null) as SrealityListingPrefill[K];
  };

  for (const src of sources) {
    if (src.partial) parsersUsed.push(src.name);
  }

  const allImages: string[] = [];
  for (const src of sources) {
    for (const u of src.partial?.sourceImageUrls ?? []) {
      if (!allImages.includes(u)) allImages.push(u);
    }
  }

  const rawSource = sources.find((s) => s.partial)?.partial ?? null;

  const merged: SrealityListingPrefill = {
    title: pick('title'),
    description: pick('description'),
    location: pick('location'),
    address: pick('address'),
    city: pick('city'),
    region: pick('region'),
    district: pick('district'),
    propertyType: pick('propertyType'),
    offerType: pick('offerType'),
    subType: pick('subType'),
    area: pick('area'),
    landArea: pick('landArea'),
    floor: pick('floor'),
    totalFloors: pick('totalFloors'),
    condition: pick('condition'),
    construction: pick('construction'),
    ownership: pick('ownership'),
    energyClass: pick('energyClass'),
    equipment: pick('equipment'),
    price: pick('price'),
    currency: pick('currency'),
    sourceImageUrls: allImages.slice(0, 30),
    canUseSourceImages: allImages.length > 0,
    rawSourceData: (rawSource as Record<string, unknown> | null) ?? null,
  };

  if (merged.price != null && !merged.currency) merged.currency = 'CZK';

  return {
    data: merged,
    debug: {
      foundJsonLd: sources.some((s) => s.name === 'jsonLd' && s.partial),
      foundNextData: sources.some((s) => s.name === 'nextData' && s.partial),
      foundInitialState: sources.some((s) => s.name === 'initialState' && s.partial),
      foundOpenGraph: sources.some((s) => s.name === 'openGraph' && s.partial),
      foundHtmlParser: sources.some((s) => s.name === 'htmlDom' && s.partial),
      parsersUsed,
      fieldsFound: [...fieldSet],
      fieldsFoundCount: fieldSet.size,
    },
  };
}

export function extractListingIdFromUrl(raw: string): string | null {
  try {
    const href = raw.trim();
    const url = href.startsWith('http') ? new URL(href) : new URL(href, 'https://www.sreality.cz/');
    const parts = url.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const seg = decodeURIComponent(parts[i] ?? '');
      if (/^\d{6,15}$/.test(seg)) return seg;
    }
  } catch {
    /* fall through */
  }
  const m = raw.match(/\/(\d{6,15})(?:\/?$|[?#])/);
  return m?.[1] ?? null;
}

export function assertSrealityListingUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Neplatná URL — zkontrolujte formát odkazu.');
  }
  if (!isSrealityHost(parsed.href)) {
    throw new Error('Podporovány jsou pouze odkazy z domény sreality.cz');
  }
  if (!/\/detail\//i.test(parsed.pathname)) {
    throw new Error('URL musí vést na detail inzerátu (obsahovat /detail/)');
  }
  return parsed;
}

export function parseSrealityListingMulti(
  html: string,
  pageUrl: string,
): { data: SrealityListingPrefill; debug: SrealityParseDebug } {
  const nextData = extractNextDataJson(html);
  const estate = nextData ? extractEstateFromNextData(nextData) : null;
  const nextPartial = estate ? estateToPartial(estate) : null;
  if (nextPartial && estate) {
    nextPartial.rawSourceData = estate;
  }

  const initialState = extractInitialStateJson(html);
  const initialEstate = initialState ? findEstateNode(initialState) : null;
  const initialPartial = initialEstate ? estateToPartial(initialEstate) : null;

  const sources: Array<{ name: string; partial: PartialPrefill | null }> = [
    { name: 'nextData', partial: nextPartial },
    { name: 'jsonLd', partial: parseJsonLd(html) },
    { name: 'initialState', partial: initialPartial },
    { name: 'openGraph', partial: parseOpenGraph(html, pageUrl) },
    { name: 'htmlDom', partial: parseHtmlDom(html) },
    { name: 'urlPath', partial: parseFromUrlPath(pageUrl) },
  ];

  return mergePartials(sources);
}

/** @deprecated použijte parseSrealityListingMulti */
export function parseSrealityListingFromHtml(
  html: string,
  pageUrl: string,
): SrealityListingPrefill | null {
  const { data, debug } = parseSrealityListingMulti(html, pageUrl);
  if (!data.title && !data.description && !data.city) {
    if (debug.fieldsFoundCount === 0) return null;
  }
  return data;
}

export function hasMinimumPrefillData(data: SrealityListingPrefill): boolean {
  const hasTitle = Boolean(data.title?.trim());
  const hasDescription = Boolean(data.description?.trim());
  const hasCity = Boolean(data.city?.trim() || data.location?.trim());
  return (hasTitle || hasDescription) && hasCity;
}

/** Částečný úspěch po fetch fallbacku — název + popis bez města. */
export function hasPartialPrefillData(data: SrealityListingPrefill): boolean {
  return Boolean(data.title?.trim()) && Boolean(data.description?.trim());
}

/** Minimální užitečná data pro částečné předvyplnění formuláře. */
export function hasBasicPrefillData(data: SrealityListingPrefill): boolean {
  return Boolean(
    data.title?.trim() ||
      data.description?.trim() ||
      data.location?.trim() ||
      data.city?.trim() ||
      data.propertyType?.trim() ||
      data.offerType?.trim(),
  );
}

export function mergeSrealityListingPrefills(
  sources: Array<{ name: string; partial: Partial<SrealityListingPrefill> | null }>,
): { data: SrealityListingPrefill; debug: SrealityParseDebug } {
  return mergePartials(sources);
}
