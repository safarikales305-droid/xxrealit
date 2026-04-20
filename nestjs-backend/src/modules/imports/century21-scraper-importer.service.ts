import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';
import {
  parseRealityCzScraperSettings,
  scraperSettingsForLog,
  type RealityCzScraperRequestLogEntry,
  type RealityCzScraperRuntimeSettings,
} from './reality-cz-scraper-settings';
import { safeParsePrice, unwrapImportedPriceValue } from './price-parse.util';
import { normalizeStoredImageUrl } from './import-image-urls';

const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type FetchResult = {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
};

export type Century21ScraperFetchMeta = {
  startUrl: string;
  finalUrl: string;
  httpStatus: number;
  rawCandidates: number;
  normalizedValid: number;
  parseMethod: string;
  contentType: string;
  settings: Record<string, unknown>;
  requestLog: RealityCzScraperRequestLogEntry[];
  listPage429Count: number;
  detailPage429Count: number;
  detailFetchesAttempted: number;
  detailFetchesCompleted: number;
  listingPagesFetched: number;
  listingPaginationLog: Array<{
    page: number;
    rawOnPage: number;
    mergedTotal: number;
    newUniques: number;
  }>;
};

export type Century21ScraperFetchOutcome = {
  rows: ImportedListingDraft[];
  meta: Century21ScraperFetchMeta;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stripTags(html: string): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value?: string | null): string | null {
  if (!value) return null;
  const text = stripTags(value);
  return text || null;
}

/** Výpisová URL (HTML), ne detail jedné nemovitosti. */
export function isValidCentury21ListingStartUrl(url: string): boolean {
  const t = (url ?? '').trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!u.hostname.toLowerCase().endsWith('century21.cz')) return false;
    const path = (u.pathname || '/').toLowerCase();
    if (!path.includes('/nemovitosti')) return false;
    // Detail má typicky /nemovitosti/<slug>?id=uuid — výpis je /nemovitosti nebo jen query filter
    const seg = path.split('/').filter(Boolean);
    if (seg.length <= 1) return true;
    if (seg.length === 2 && seg[1] === 'nemovitosti') return true;
    // /nemovitosti/<slug> bez dalšího kontextu může být i výpis — povolíme jen pokud chybí id v query (výpis)
    const id = u.searchParams.get('id');
    if (id && UUID_RE.test(id)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeDetailUrl(raw: string): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  try {
    const u = new URL(t, 'https://www.century21.cz');
    if (!u.hostname.toLowerCase().endsWith('century21.cz')) return null;
    if (!u.pathname.toLowerCase().includes('/nemovitosti/')) return null;
    const id = u.searchParams.get('id');
    if (id && !UUID_RE.test(id)) return null;
    u.hash = '';
    if (id) {
      u.searchParams.set('id', id.toLowerCase());
    }
    return u.href;
  } catch {
    return null;
  }
}

function externalIdFromDetailUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get('id');
    if (id && UUID_RE.test(id)) return id.toUpperCase();
    const slug = parsed.pathname.split('/').filter(Boolean).pop()?.trim() ?? '';
    if (slug) {
      return `C21-${slug.replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase().slice(0, 56)}`;
    }
    return null;
  } catch {
    return null;
  }
}

function slugFallbackTitle(url: string): string {
  try {
    const seg =
      new URL(url).pathname
        .split('/')
        .filter(Boolean)
        .pop() ?? '';
    const slug = seg.split('?')[0] ?? '';
    if (!slug) return 'Nemovitost CENTURY 21';
    return decodeURIComponent(slug.replace(/-/g, ' ')).slice(0, 240);
  } catch {
    return 'Nemovitost CENTURY 21';
  }
}

function normalizeListPrice(raw: unknown): number | null {
  const unwrapped = unwrapImportedPriceValue(raw);
  const parsed =
    typeof unwrapped === 'number'
      ? Number.isFinite(unwrapped) && unwrapped > 0
        ? Math.trunc(unwrapped)
        : null
      : safeParsePrice(
          typeof unwrapped === 'string' ? unwrapped : unwrapped != null ? String(unwrapped) : null,
        );
  if (parsed == null) return null;
  if (parsed < 1) return null;
  if (parsed > 500_000_000) return null;
  return parsed;
}

function extractHrefDetailUrls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const h = m[1]?.trim();
    if (!h || h.startsWith('#') || /^javascript:/i.test(h)) continue;
    if (!/\/nemovitosti\//i.test(h)) continue;
    try {
      const abs = new URL(h, 'https://www.century21.cz').href;
      const n = normalizeDetailUrl(abs);
      if (n) out.push(n);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function extractAbsoluteDetailUrls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/https:\/\/www\.century21\.cz\/nemovitosti\/[^"'\\\s<>]+/gi)) {
    const n = normalizeDetailUrl(m[0]);
    if (n) out.push(n);
  }
  for (const m of html.matchAll(/https:\\\/\\\/www\.century21\.cz\\\/nemovitosti\\\/[^"'\\\s<>]+/gi)) {
    const unescaped = m[0].replace(/\\\//g, '/');
    const n = normalizeDetailUrl(unescaped);
    if (n) out.push(n);
  }
  for (const m of html.matchAll(/\/nemovitosti\/[^"'\\\s<>]+/gi)) {
    const n = normalizeDetailUrl(`https://www.century21.cz${m[0]}`);
    if (n) out.push(n);
  }
  return out;
}

function mergeUniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const u of urls) {
    const n = normalizeDetailUrl(u);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    ordered.push(n);
  }
  return ordered;
}

function cardFragmentForUrl(html: string, url: string): string {
  const needles = [url, url.replace(/&/g, '&amp;'), encodeURI(url)];
  let idx = -1;
  for (const n of needles) {
    const i = html.indexOf(n);
    if (i >= 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return '';
  return html.slice(Math.max(0, idx - 4500), Math.min(html.length, idx + 800));
}

function parseListCardFragment(frag: string): {
  title: string | null;
  priceText: string | null;
  address: string | null;
  offerType: string;
  propertyType: string;
} {
  const text = stripTags(frag);
  let title: string | null = null;
  const h = frag.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
  if (h?.[1]) title = cleanText(h[1]);
  if (!title && text.length > 12) {
    const lines = text
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 10 && x.length < 200);
    title = lines[0] ?? null;
  }
  const priceM = frag.match(/(\d[\d\s\u00a0.\u202f]{2,})\s*(?:Kč|CZK)/i);
  const priceText = priceM ? cleanText(priceM[0]) : null;
  const offerType = /pronájem|pronajem|nájem/i.test(frag) ? 'pronájem' : 'prodej';
  let propertyType = 'nemovitost';
  if (/dům|dum|rodinný|vila/i.test(frag)) propertyType = 'dům';
  else if (/byt/i.test(frag)) propertyType = 'byt';
  else if (/pozem/i.test(frag)) propertyType = 'pozemek';
  else if (/garáž|garaz/i.test(frag)) propertyType = 'garáž';
  else if (/komerční|kancelář|obchodní/i.test(frag)) propertyType = 'komerční';
  let address: string | null = null;
  const addrM = frag.match(
    /(?:ul\.|tř\.|nám\.|nábř\.|osada|obec)[^<]{0,120}/i,
  );
  if (addrM?.[0]) address = cleanText(addrM[0]);
  if (!address) {
    const tail = text.slice(Math.max(0, text.length - 220));
    const maybe = tail.match(/([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^.]{8,90})/);
    if (maybe?.[1]) address = cleanText(maybe[1]);
  }
  return { title, priceText, address, offerType, propertyType };
}

function extractNextListingPageUrl(html: string, currentAbs: string): string | null {
  const linkRel =
    html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i)?.[1];
  if (linkRel) {
    try {
      return new URL(linkRel, currentAbs).href;
    } catch {
      return null;
    }
  }
  const aRel =
    html.match(/<a[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<a[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i)?.[1];
  if (aRel) {
    try {
      const u = new URL(aRel, currentAbs);
      if (u.hostname.toLowerCase().endsWith('century21.cz') && u.pathname.includes('/nemovitosti')) {
        return u.href;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isLikelyGalleryImageUrl(url: string): boolean {
  const low = url.toLowerCase();
  if (!/^https?:\/\//i.test(url) || low.startsWith('data:')) return false;
  if (/\.(svg)(\?|#|$)/i.test(low)) return false;
  if (/(logo|favicon|icon|sprite|placeholder|avatar|cmp|cookie)/i.test(low)) return false;
  return true;
}

function extractGalleryImagesFromDetailHtml(html: string, limit = 80): string[] {
  const raw: string[] = [];
  const push = (u: string) => {
    const t = u.trim();
    if (t) raw.push(t);
  };

  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (og) push(og);

  for (const m of html.matchAll(/https:\/\/live-file-api\.igluu\.cz\/file\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?/g)) {
    push(m[0]);
  }
  for (const m of html.matchAll(/https:\/\/[^"'\\\s<>]+\.(?:jpe?g|png|webp)(?:\?[^"'\\\s<>]*)?/gi)) {
    const u = m[0];
    if (/igluu|century21|cloudinary/i.test(u)) push(u);
  }

  for (const imgMatch of html.matchAll(/<img[^>]+>/gi)) {
    const tag = imgMatch[0];
    for (const attr of ['data-src', 'data-lazy-src', 'data-zoom-src', 'data-full', 'src']) {
      const mm = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
      if (mm?.[1]) push(mm[1]);
    }
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const cand of raw) {
    try {
      const abs = /^https?:/i.test(cand) ? cand : new URL(cand, 'https://www.century21.cz').href;
      const n = normalizeStoredImageUrl(abs) ?? abs;
      if (!isLikelyGalleryImageUrl(n) || seen.has(n)) continue;
      seen.add(n);
      ordered.push(n);
      if (ordered.length >= limit) break;
    } catch {
      /* skip */
    }
  }
  return ordered;
}

function parseDetailParameters(html: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  try {
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const inner = row[1] ?? '';
      const cells = [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1] ?? ''),
      );
      if (cells.length >= 2) {
        const k = cells[0]!.trim().slice(0, 120);
        const v = cells[1]!.trim().slice(0, 800);
        if (k && v && k.length < 100) attrs[k] = v;
      }
    }
  } catch {
    /* safe */
  }
  return attrs;
}

function parseNumericArea(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
  if (typeof v !== 'string') return null;
  const m = v.replace(/\u00a0/g, ' ').match(/(\d{1,4}(?:[.,]\d{1,2})?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseDetailHtml(html: string): Partial<ImportedListingDraft> {
  const out: Partial<ImportedListingDraft> = {};
  try {
    const jsonBodies = [
      ...Array.from(
        html.matchAll(
          /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
        ),
      ).map((m) => m[1] ?? ''),
      ...Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi))
        .map((m) => m[1] ?? '')
        .filter((s) => /"@type"|"description"|"offers"|"price"|"telephone"|"email"/i.test(s)),
    ];
    const jsonPool: Array<Record<string, unknown>> = [];
    for (const body of jsonBodies) {
      const t = body.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          jsonPool.push(parsed as Record<string, unknown>);
        } else if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              jsonPool.push(item as Record<string, unknown>);
            }
          }
        }
      } catch {
        /* ignore bad script json */
      }
    }
    const pickJsonString = (
      key: string,
      nestedKey?: string,
    ): string | null => {
      for (const item of jsonPool) {
        const direct = item[key];
        if (typeof direct === 'string' && direct.trim()) return direct.trim();
        if (nestedKey && direct && typeof direct === 'object' && !Array.isArray(direct)) {
          const nested = (direct as Record<string, unknown>)[nestedKey];
          if (typeof nested === 'string' && nested.trim()) return nested.trim();
        }
      }
      return null;
    };
    const pickJsonPrice = (): string | null => {
      for (const item of jsonPool) {
        const direct = item.price;
        if (typeof direct === 'number' || typeof direct === 'string') return String(direct);
        const offers = item.offers;
        if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
          const p = (offers as Record<string, unknown>).price;
          if (typeof p === 'number' || typeof p === 'string') return String(p);
        }
      }
      return null;
    };
    const pickNestedString = (
      value: unknown,
      keys: string[],
    ): string | null => {
      if (!value || typeof value !== 'object') return null;
      const rec = value as Record<string, unknown>;
      for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return null;
    };
    const firstJsonValue = (keys: string[]): unknown => {
      for (const item of jsonPool) {
        for (const key of keys) {
          if (item[key] != null) return item[key];
        }
      }
      return null;
    };

    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const jsonTitle = pickJsonString('name');
    const title = cleanText(jsonTitle ?? ogTitle) ?? cleanText(h1);
    if (title) out.title = title.slice(0, 400);

    const descBlock =
      html.match(/(?:Popis|popis nemovitosti)[\s\S]{0,80}>([\s\S]{200,12000}?)(?:Kontakt|makléř|Zaujala)/i)?.[1] ??
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
    const desc = descBlock ? stripTags(descBlock).slice(0, 60_000) : null;
    if (desc && desc.length > 40) out.description = desc;

    const priceStr = pickJsonPrice() ?? html.match(/(\d[\d\s\u00a0.\u202f]{3,})\s*(?:Kč|CZK)/i)?.[1] ?? null;
    const priceParsed = priceStr ? normalizeListPrice(priceStr) : null;
    if (priceParsed != null) out.price = priceParsed;

    out.images = extractGalleryImagesFromDetailHtml(html);

    const jsonEmail = pickJsonString('email');
    const mail = jsonEmail ?? html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1];
    if (mail) out.contactEmail = mail.toLowerCase().slice(0, 120);

    const jsonTel = pickJsonString('telephone') ?? pickJsonString('seller', 'telephone');
    const tel =
      jsonTel ??
      html.match(/href=["']tel:([+0-9\s\u00a0()-]{9,40})["']/i)?.[1] ??
      html.match(/\+420[\s\u00a0]*[0-9]{3}[\s\u00a0]*[0-9]{3}[\s\u00a0]*[0-9]{3}/)?.[0];
    if (tel) out.contactPhone = tel.replace(/\s+/g, ' ').trim().slice(0, 40);

    const jsonBrokerName = pickJsonString('seller', 'name') ?? pickJsonString('agent', 'name');
    const brokerSection = html.match(
      /(?:makléř|makler|Makléř)[\s\S]{0,2000}?(\b[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+){1,3}\b)/i,
    )?.[1];
    const brokerNameResolved = jsonBrokerName ?? brokerSection ?? null;
    if (brokerNameResolved) {
      out.contactName = cleanText(brokerNameResolved)?.slice(0, 120) ?? undefined;
    }

    const office =
      html.match(
        /(CENTURY\s*21[^<\n]{0,120})/i,
      )?.[1] ??
      html.match(/(?:realitní kancelář|kancelář)[^<]{0,20}>([^<]{5,120})/i)?.[1];
    if (office) out.contactCompany = cleanText(office)?.slice(0, 200) ?? undefined;

    const params = parseDetailParameters(html);
    if (Object.keys(params).length) out.attributes = params as Record<string, unknown>;

    const jsonAddress = firstJsonValue(['address']);
    const addressFromJson = pickNestedString(jsonAddress, [
      'streetAddress',
      'addressLocality',
      'addressRegion',
      'name',
    ]);
    const addressDom =
      html.match(/(?:Adresa|Lokalita)[^<]{0,20}<\/[^>]+>\s*<[^>]*>([^<]{4,220})</i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:street-address["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      null;
    const resolvedAddress = cleanText(addressFromJson ?? addressDom);
    if (resolvedAddress) out.address = resolvedAddress.slice(0, 500);

    const cityFromJson = pickNestedString(jsonAddress, ['addressLocality']);
    const regionFromJson = pickNestedString(jsonAddress, ['addressRegion']);
    if (cityFromJson) out.city = cityFromJson.slice(0, 120);
    if (regionFromJson) out.region = regionFromJson.slice(0, 200);

    const listingTypeRaw =
      pickJsonString('availabilityStarts') ??
      pickJsonString('category') ??
      pickJsonString('listingType') ??
      '';
    if (/pron[aá]jem|rent/i.test(listingTypeRaw + ' ' + (out.title ?? ''))) {
      out.offerType = 'pronájem';
    } else {
      out.offerType = 'prodej';
    }

    const propertyTypeRaw =
      pickJsonString('@type') ??
      pickJsonString('category') ??
      pickJsonString('propertyType') ??
      '';
    if (/house|d[uů]m|villa|rodinn/i.test(propertyTypeRaw + ' ' + (out.title ?? ''))) {
      out.propertyType = 'dům';
    } else if (/apartment|flat|byt/i.test(propertyTypeRaw + ' ' + (out.title ?? ''))) {
      out.propertyType = 'byt';
    } else if (/land|pozem/i.test(propertyTypeRaw + ' ' + (out.title ?? ''))) {
      out.propertyType = 'pozemek';
    }

    const areaCandidate =
      params['Užitná plocha'] ??
      params['Uzitna plocha'] ??
      params['Podlahová plocha'] ??
      params['Plocha'] ??
      null;
    const landCandidate = params['Plocha pozemku'] ?? params['Pozemek'] ?? null;
    const areaParsed = parseNumericArea(areaCandidate);
    const landParsed = parseNumericArea(landCandidate);
    if (areaParsed != null) out.area = areaParsed;
    if (landParsed != null) {
      const attrs = (out.attributes ?? {}) as Record<string, unknown>;
      out.attributes = { ...attrs, landArea: landParsed };
    }

    const cityHint =
      params['Obec'] ??
      params['Lokalita'] ??
      params['Adresa'] ??
      params['Umístění'] ??
      null;
    if (cityHint) {
      const c = cleanText(String(cityHint))?.split(',')[0]?.trim();
      if (c && c.length < 120) out.city = c;
    }
  } catch {
    /* vrátíme částečný out */
  }
  return out;
}

@Injectable()
export class Century21ScraperImporter {
  private readonly logger = new Logger(Century21ScraperImporter.name);

  private buildHeaders(_url: string): Record<string, string> {
    return {
      'User-Agent': DEFAULT_BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs,en;q=0.8',
      Referer: 'https://www.century21.cz/',
    } as Record<string, string>;
  }

  private parseRetryAfterMs(v: string | null): number {
    if (!v?.trim()) return 0;
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, 600_000);
    const asDate = Date.parse(v);
    if (!Number.isNaN(asDate)) {
      const delta = asDate - Date.now();
      return delta > 0 ? Math.min(delta, 300_000) : 0;
    }
    return 0;
  }

  private async fetchWithRetry(
    url: string,
    phase: 'list_page' | 'detail_page',
    settings: RealityCzScraperRuntimeSettings,
    requestLog: RealityCzScraperRequestLogEntry[],
    on429: (hit: boolean) => void,
    opts?: { skipInitialDelay?: boolean },
  ): Promise<FetchResult> {
    if (!opts?.skipInitialDelay) {
      await sleep(settings.requestDelayMs);
    }
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= settings.maxRetries; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: this.buildHeaders(url),
          redirect: 'follow',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.status === 429) {
          on429(true);
          const fromHeader = this.parseRetryAfterMs(res.headers.get('retry-after'));
          const exp = settings.baseBackoffMsOn429 * settings.backoffMultiplier ** (attempt - 1);
          const waitMs = Math.min(180_000, Math.max(fromHeader || 0, exp, settings.requestDelayMs * 2));
          this.logger.warn(
            `CENTURY21 HTTP 429 ${phase} url=${url} pokus ${attempt}/${settings.maxRetries} čekám ${waitMs} ms`,
          );
          requestLog.push({
            phase,
            url,
            attempt,
            status: 429,
            waitBeforeRetryMs: waitMs,
            note: 'Too Many Requests',
          });
          if (attempt >= settings.maxRetries) {
            lastErr = new Error(`HTTP 429 na ${phase} po ${settings.maxRetries} pokusech: ${url}`);
            break;
          }
          await sleep(waitMs);
          await sleep(settings.requestDelayMs);
          continue;
        }
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
          if (res.status >= 500 && attempt < settings.maxRetries) {
            lastErr = err;
            const waitMs = Math.min(60_000, settings.requestDelayMs * 2 ** (attempt - 1));
            requestLog.push({
              phase,
              url,
              attempt,
              status: res.status,
              waitBeforeRetryMs: waitMs,
              note: 'server error, retry',
            });
            await sleep(waitMs);
            continue;
          }
          throw err;
        }
        requestLog.push({ phase, url, attempt, status: res.status });
        return {
          body: await res.text(),
          contentType: res.headers.get('content-type') ?? '',
          finalUrl: res.url,
          status: res.status,
        };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt >= settings.maxRetries) break;
        const waitMs = Math.min(45_000, settings.requestDelayMs * attempt);
        requestLog.push({
          phase,
          url,
          attempt,
          waitBeforeRetryMs: waitMs,
          note: msg.slice(0, 160),
        });
        await sleep(waitMs);
        await sleep(settings.requestDelayMs);
      }
    }
    throw new Error(
      lastErr instanceof Error ? lastErr.message : `Stažení selhalo: ${String(lastErr)}`,
    );
  }

  /**
   * Výpis HTML → karty (odkazy na detail s ?id=uuid).
   */
  async fetch(
    limit: number,
    startUrl: string,
    settingsJson: Record<string, unknown> | null | undefined,
    onProgress?: (e: { percent: number; message: string }) => void,
  ): Promise<Century21ScraperFetchOutcome> {
    const settings = parseRealityCzScraperSettings(settingsJson);
    const requestLog: RealityCzScraperRequestLogEntry[] = [];
    let listPage429Count = 0;
    let detailPage429Count = 0;

    if (!isValidCentury21ListingStartUrl(startUrl)) {
      throw new BadRequestException(
        'Neplatná start URL — použijte výpis nemovitostí na www.century21.cz (např. /nemovitosti?filter=…), ne URL detailu s ?id=.',
      );
    }

    this.logger.log(
      `CENTURY21 scraper: startUrl=${startUrl} maxListingPages=${settings.maxListingPages} maxDetails=${settings.maxDetailFetchesPerRun}`,
    );

    const listingPaginationLog: Century21ScraperFetchMeta['listingPaginationLog'] = [];
    const draftsByUrl = new Map<string, ImportedListingDraft>();
    let lastFetched: FetchResult = {
      body: '',
      contentType: 'text/html',
      finalUrl: startUrl,
      status: 0,
    };

    let pageUrl: string | null = startUrl;
    for (let pageIdx = 0; pageIdx < settings.maxListingPages && pageUrl; pageIdx += 1) {
      if (pageIdx > 0) {
        await sleep(settings.requestDelayMs);
      }
      onProgress?.({
        percent: Math.min(22, 6 + pageIdx * 2),
        message: `CENTURY 21 — výpis stránka ${pageIdx + 1}…`,
      });

      let fetched: FetchResult;
      try {
        fetched = await this.fetchWithRetry(
          pageUrl,
          'list_page',
          settings,
          requestLog,
          (is429) => {
            if (is429) listPage429Count += 1;
          },
        );
        lastFetched = fetched;
      } catch (e) {
        if (pageIdx === 0) throw e;
        this.logger.warn(`CENTURY21 výpis: stránka ${pageIdx + 1} selhala, konec paginace.`);
        break;
      }

      const hrefUrls = extractHrefDetailUrls(fetched.body);
      const absUrls = extractAbsoluteDetailUrls(fetched.body);
      const mergedOnPage = mergeUniqueUrls([...hrefUrls, ...absUrls]);
      const mergedBefore = draftsByUrl.size;

      for (const detailUrl of mergedOnPage) {
        if (draftsByUrl.size >= limit) break;
        const frag = cardFragmentForUrl(fetched.body, detailUrl);
        const card = parseListCardFragment(frag);
        const eid = externalIdFromDetailUrl(detailUrl);
        if (!eid) continue;
        const priceNum = card.priceText ? normalizeListPrice(card.priceText) : null;
        const row: ImportedListingDraft = {
          externalId: eid,
          title: (card.title ?? slugFallbackTitle(detailUrl)).slice(0, 400),
          description: '',
          price: priceNum,
          city: (card.address ?? 'Neuvedeno').slice(0, 120),
          address: card.address ?? undefined,
          images: [],
          offerType: card.offerType,
          propertyType: card.propertyType,
          sourceUrl: detailUrl,
        };
        draftsByUrl.set(detailUrl, row);
        if (draftsByUrl.size >= limit) break;
      }

      const newUniques = draftsByUrl.size - mergedBefore;
      listingPaginationLog.push({
        page: pageIdx + 1,
        rawOnPage: mergedOnPage.length,
        mergedTotal: draftsByUrl.size,
        newUniques,
      });

      if (draftsByUrl.size >= limit) break;
      if (pageIdx > 0 && newUniques === 0 && mergedOnPage.length === 0) break;

      const next = extractNextListingPageUrl(fetched.body, fetched.finalUrl);
      if (!next || next === pageUrl) {
        if (pageIdx === 0 && mergedOnPage.length === 0) {
          this.logger.warn('CENTURY21: první stránka bez odkazů na detail (?id=) — zkontrolujte HTML výpisu.');
        }
        break;
      }
      pageUrl = next;
    }

    const rows = [...draftsByUrl.values()];
    onProgress?.({
      percent: 28,
      message: `CENTURY 21 výpis: ${rows.length} inzerátů (limit ${limit})…`,
    });

    const meta: Century21ScraperFetchMeta = {
      startUrl,
      finalUrl: lastFetched.finalUrl,
      httpStatus: lastFetched.status,
      rawCandidates: rows.length,
      normalizedValid: rows.length,
      parseMethod: 'century21_html_list_cards',
      contentType: lastFetched.contentType,
      settings: scraperSettingsForLog(settings),
      requestLog,
      listPage429Count,
      detailPage429Count,
      detailFetchesAttempted: 0,
      detailFetchesCompleted: 0,
      listingPagesFetched: listingPaginationLog.length,
      listingPaginationLog,
    };

    this.logger.log(
      `CENTURY21 list done: pages=${listingPaginationLog.length} listings=${rows.length} list429=${listPage429Count}`,
    );

    return { rows, meta };
  }

  /**
   * Doplnění z HTML detailu — chyba jednoho řádku nesmí shodit dávku.
   */
  async enrichDraftsWithDetailsBatched(
    rows: ImportedListingDraft[],
    settings: RealityCzScraperRuntimeSettings,
    callbacks?: {
      onPlanned?: (plannedDetailSlots: number) => void;
      onTick?: (e: {
        detailFetchesAttempted: number;
        detailFetchesCompleted: number;
        detailPage429Count: number;
        message: string;
      }) => void;
    },
  ): Promise<{
    rows: ImportedListingDraft[];
    detailFetchesAttempted: number;
    detailFetchesCompleted: number;
    detailPage429Count: number;
    requestLog: RealityCzScraperRequestLogEntry[];
    plannedDetailSlots: number;
  }> {
    const requestLog: RealityCzScraperRequestLogEntry[] = [];
    let detailPage429Count = 0;
    let detailFetchesAttempted = 0;
    let detailFetchesCompleted = 0;
    const working = rows.map((r) => ({ ...r }));

    if (settings.listOnlyImport || settings.maxDetailFetchesPerRun <= 0 || working.length === 0) {
      callbacks?.onPlanned?.(0);
      return {
        rows: working,
        detailFetchesAttempted: 0,
        detailFetchesCompleted: 0,
        detailPage429Count: 0,
        requestLog,
        plannedDetailSlots: 0,
      };
    }

    const candidates: number[] = [];
    for (let i = 0; i < working.length; i += 1) {
      const u = working[i]?.sourceUrl?.trim();
      if (!u || !/^https?:\/\/(www\.)?century21\.cz\/nemovitosti\//i.test(u)) continue;
      candidates.push(i);
    }

    const plannedDetailSlots = Math.min(settings.maxDetailFetchesPerRun, candidates.length);
    callbacks?.onPlanned?.(plannedDetailSlots);
    let pending = candidates.slice(0, plannedDetailSlots);
    const conc = Math.max(1, Math.min(5, settings.detailConcurrency));
    const gap = Math.max(0, settings.detailRequestGapMs);

    const emitTick = (message: string) => {
      callbacks?.onTick?.({
        detailFetchesAttempted,
        detailFetchesCompleted,
        detailPage429Count,
        message,
      });
    };

    for (let attemptRound = 0; attemptRound < 2 && pending.length > 0; attemptRound += 1) {
      if (attemptRound > 0) {
        await sleep(Math.min(60_000, settings.baseBackoffMsOn429));
        this.logger.log(`CENTURY21: opakuji ${pending.length} neúspěšných detailů…`);
      }
      const failed: number[] = [];
      for (let b = 0; b < pending.length; b += conc) {
        if (gap > 0) await sleep(gap);
        else if (b > 0) await sleep(settings.requestDelayMs);

        const chunk = pending.slice(b, b + conc);
        await Promise.all(
          chunk.map(async (idx, idxInChunk) => {
            if (idxInChunk > 0 && gap > 0) await sleep(gap);
            else if (idxInChunk > 0) await sleep(settings.requestDelayMs);

            const row = working[idx];
            const url = row?.sourceUrl?.trim();
            if (!url) return;

            detailFetchesAttempted += 1;
            emitTick(`Detail CENTURY21 ${detailFetchesCompleted}/${plannedDetailSlots}…`);

            try {
              const fetched = await this.fetchWithRetry(
                url,
                'detail_page',
                settings,
                requestLog,
                (is429) => {
                  if (is429) detailPage429Count += 1;
                },
              );
              const parsed = parseDetailHtml(fetched.body);
              const cur = working[idx]!;
              working[idx] = {
                ...cur,
                title: parsed.title?.trim() ? parsed.title!.slice(0, 400) : cur.title,
                description:
                  parsed.description && parsed.description.trim().length > 0
                    ? parsed.description
                    : cur.description || 'Import CENTURY 21 — popis doplníme ručně.',
                price: parsed.price != null ? parsed.price : cur.price,
                images: parsed.images?.length ? parsed.images : cur.images,
                address: parsed.address?.trim() ? parsed.address : cur.address,
                contactPhone: parsed.contactPhone ?? cur.contactPhone,
                contactEmail: parsed.contactEmail ?? cur.contactEmail,
                contactName: parsed.contactName ?? cur.contactName,
                contactCompany: parsed.contactCompany ?? cur.contactCompany,
                city: parsed.city?.trim() ? parsed.city! : cur.city,
                region: parsed.region?.trim() ? parsed.region : cur.region,
                offerType: parsed.offerType?.trim() ? parsed.offerType : cur.offerType,
                propertyType: parsed.propertyType?.trim() ? parsed.propertyType : cur.propertyType,
                area: parsed.area ?? cur.area,
                attributes:
                  parsed.attributes && Object.keys(parsed.attributes).length
                    ? { ...(cur.attributes as object), ...(parsed.attributes as object) }
                    : cur.attributes,
              };
              detailFetchesCompleted += 1;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.logger.warn(`CENTURY21 detail selhání externalId=${row.externalId}: ${msg.slice(0, 200)}`);
              failed.push(idx);
            }
          }),
        );
      }
      pending = failed;
    }

    emitTick(`Detaily CENTURY21 dokončeny (${detailFetchesCompleted}/${plannedDetailSlots}).`);

    return {
      rows: working,
      detailFetchesAttempted,
      detailFetchesCompleted,
      detailPage429Count,
      requestLog,
      plannedDetailSlots,
    };
  }
}
