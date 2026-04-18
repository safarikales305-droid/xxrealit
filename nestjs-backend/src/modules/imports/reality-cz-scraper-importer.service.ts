import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft, RawImportedListing } from './import-types';
import {
  parseRealityCzScraperSettings,
  scraperSettingsForLog,
  type RealityCzScraperRequestLogEntry,
  type RealityCzScraperRuntimeSettings,
} from './reality-cz-scraper-settings';
import {
  extractListingCodeFromRealityUrl,
  REALITY_LISTING_CODE_RE,
  resolveRealityListingExternalId,
} from './reality-listing-code.util';
import { safeParsePrice } from './price-parse.util';
import { normalizeStoredImageUrl, normalizeStoredImageUrlList } from './import-image-urls';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const FETCH_TIMEOUT_MS = 30_000;
const MIN_REALITY_PRICE_CZK = 1_000;
const MAX_REALITY_PRICE_CZK = 500_000_000;

function toAbsoluteRealityAssetUrl(raw: string, baseOrigin = 'https://www.reality.cz'): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  try {
    return new URL(t.startsWith('/') ? t : `/${t}`, baseOrigin).href;
  } catch {
    return `${baseOrigin}${t.startsWith('/') ? '' : '/'}${t}`;
  }
}

/**
 * Nejkvalitnější URL ze srcset — preferuje největší deskriptor `NNNw` / `Nx`, jinak poslední kandidát.
 */
function pickBestImageFromSrcset(srcset?: string | null): string | null {
  if (!srcset?.trim()) return null;
  const parts = srcset
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  type Scored = { url: string; score: number; idx: number };
  const scored: Scored[] = [];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx]!;
    const url = part.split(/\s+/)[0]?.trim() ?? '';
    if (!url) continue;
    let score = 0;
    const tokens = part.split(/\s+/).slice(1);
    for (const tok of tokens) {
      const t = tok.toLowerCase();
      const wm = t.match(/^(\d+)w$/);
      if (wm) score = Math.max(score, parseInt(wm[1]!, 10));
      const xm = t.match(/^(\d*(?:\.\d+)?)x$/i);
      if (xm) score = Math.max(score, Math.round(parseFloat(xm[1]!) * 2000));
    }
    scored.push({ url, score, idx });
  }
  if (scored.length === 0) return null;
  const anyDescriptor = scored.some((s) => s.score > 0);
  if (!anyDescriptor) {
    return scored[scored.length - 1]!.url;
  }
  scored.sort((a, b) => b.score - a.score || b.idx - a.idx);
  return scored[0]!.url;
}

function normalizeRealityImageQualityUrl(rawUrl: string): string {
  const t = (rawUrl ?? '').trim();
  if (!t) return '';
  const replaced = t
    // URL variants often used for thumbnails; keep original path but drop explicit thumbnail markers.
    .replace(/([/_-])(thumb|thumbnail|small|mini)(?=[/_-]|\.|$)/gi, '$1large')
    .replace(/([?&](?:w|width|h|height|size|maxwidth|maxheight)=)\d+/gi, '$12048');
  try {
    const u = new URL(replaced);
    const keys = [
      'w',
      'width',
      'h',
      'height',
      'size',
      'maxwidth',
      'maxheight',
      'quality',
      'q',
      'fit',
      'crop',
    ];
    for (const k of keys) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return replaced;
  }
}

function isLikelyListingImageUrl(url: string): boolean {
  const t = (url ?? '').trim();
  if (!t || !/^https?:\/\//i.test(t) || t.toLowerCase().startsWith('data:')) return false;
  const low = t.toLowerCase();
  if (/\.(svg)(\?|#|$)/i.test(low)) return false;
  if (
    /(logo|favicon|icon|sprite|placeholder|blank|avatar|profile|cookie|consent|cmp)/i.test(low)
  ) {
    return false;
  }
  return true;
}

/** URL z inline scriptů — jen hostitelé, kde typicky leží galerie Reality. */
function isProbableRealityHostedImageUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes('reality.cz') ||
      h.includes('realhunter') ||
      /^img[0-9]*\./i.test(h) ||
      h.includes('cdn.')
    );
  } catch {
    return false;
  }
}

function normalizeRealityImportedPrice(raw: unknown): number | null {
  const parsed =
    typeof raw === 'number'
      ? Number.isFinite(raw) && raw > 0
        ? Math.trunc(raw)
        : null
      : safeParsePrice(typeof raw === 'string' ? raw : raw != null ? String(raw) : null);
  if (parsed == null) return null;
  if (parsed < MIN_REALITY_PRICE_CZK) return null;
  if (parsed > MAX_REALITY_PRICE_CZK) return null;
  return parsed;
}

function cleanText(value?: string | null): string | null {
  if (!value) return null;
  const text = String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function pickFirstCleanMatch(fragment: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = fragment.match(re);
    const v = cleanText(m?.[1] ?? null);
    if (v) return v;
  }
  return null;
}

/** První rozumný obrázek z úryvku HTML (img src/data-src, picture/source srcset, og:image, link image_src). */
function extractBestImageFromHtmlFragment(fragment: string): string | null {
  const candidates: string[] = [];
  const imgTags = fragment.matchAll(/<img[^>]+>/gi);
  for (const imgMatch of imgTags) {
    const tag = imgMatch[0];
    for (const attr of [
      'data-src',
      'data-lazy-src',
      'data-original',
      'data-zoom-src',
      'data-full',
      'src',
    ]) {
      const re = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
      const m = tag.match(re);
      if (m?.[1]) candidates.push(m[1]);
    }
  }
  for (const sm of fragment.matchAll(/<source[^>]+srcset=["']([^"']+)["']/gi)) {
    const u = pickBestImageFromSrcset(sm[1] ?? '');
    if (u) candidates.push(u);
  }
  const og =
    fragment.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    fragment.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    )?.[1];
  if (og) candidates.push(og);
  const linkImg = fragment.match(
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  )?.[1];
  if (linkImg) candidates.push(linkImg);
  for (const c of candidates) {
    const abs = normalizeRealityImageQualityUrl(
      toAbsoluteRealityAssetUrl(c, 'https://www.reality.cz'),
    );
    const stored = normalizeStoredImageUrl(abs);
    if (stored && isLikelyListingImageUrl(stored)) return stored;
  }
  return null;
}

function pickMetaDescriptionFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const v = cleanText(m?.[1] ?? null);
    if (v) return v;
  }
  return null;
}

function pickOgImageFromHtml(html: string): string | null {
  const raw =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    )?.[1];
  const t = (raw ?? '').trim();
  return t || null;
}

function isRealityListingDetailHref(rawHref: string, absHref: string): boolean {
  const low = rawHref.toLowerCase();
  if (low.includes('/detail/') || low.includes('%2fdetail%2f') || low.includes('/nemovitosti/')) {
    return true;
  }
  try {
    const u = new URL(absHref);
    const firstSeg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return REALITY_LISTING_CODE_RE.test(firstSeg);
  } catch {
    return false;
  }
}

function extractPriceFromNextData(html: string): string | null {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/im);
  if (!m?.[1]) return null;
  const body = m[1].slice(0, 4_000_000);
  const patterns = [
    /"price"\s*:\s*(\d{4,12})(?!\d)/,
    /"priceCzk"\s*:\s*(\d{4,12})/i,
    /"totalPrice"\s*:\s*(\d{4,12})/i,
    /"priceAmount"\s*:\s*(\d{4,12})/i,
    /"amount"\s*:\s*(\d{4,12})\s*(?:,|})/,
    /"lowPrice"\s*:\s*(\d{4,12})/i,
    /"highPrice"\s*:\s*(\d{4,12})/i,
  ];
  for (const re of patterns) {
    const hit = body.match(re);
    if (hit?.[1] && hit[1].length >= 4) return hit[1].replace(/[\s\u00a0]/g, '');
  }
  return null;
}

function unescapeJsonUrlFragment(raw: string): string {
  return raw.replace(/\\\//g, '/').replace(/\\u002f/gi, '/');
}

/**
 * Fotky z __NEXT_DATA__ (Next.js) — na detailu bývá kompletní galerie, která není jen v prvním <img>.
 */
function extractImageUrlsFromNextData(html: string, limit: number): string[] {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/im);
  if (!m?.[1]) return [];
  const body = m[1].slice(0, 4_000_000);
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /https?:\\?\/\\?\/[^"\\\s]+\.(?:jpe?g|png|webp)(?:\\?\?[^"\\\s]*)?/gi;
  let um: RegExpExecArray | null;
  while ((um = re.exec(body)) !== null && out.length < limit) {
    const u = unescapeJsonUrlFragment(um[0].replace(/\\/g, ''));
    if (!/^https?:\/\//i.test(u)) continue;
    if (!isProbableRealityHostedImageUrl(u) && !/reality\.cz/i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function extractPriceFromMicrodata(html: string): string | null {
  const band = html.length > 500_000 ? html.slice(0, 500_000) : html;
  const m =
    band.match(/itemprop=["']price["'][^>]*content=["']([\d\s]+)["']/i) ??
    band.match(/itemprop=["']price["'][^>]*>([\d\s\u00a0]+)</i) ??
    band.match(/data-endorsment-price["']?\s*=\s*["']([\d\s]+)["']/i);
  const raw = m?.[1]?.replace(/[\s\u00a0]/g, '');
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function extractContactFromDetailHtml(html: string): { phone?: string; email?: string } {
  const out: { phone?: string; email?: string } = {};
  const band = html.length > 600_000 ? html.slice(0, 600_000) : html;
  const mail = band.match(/href=["']mailto:([^"'>\s]+)["']/i)?.[1];
  if (mail) {
    const e = decodeURIComponent(mail.replace(/&amp;/g, '&')).split('?')[0].trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.email = e.slice(0, 120);
  }
  const tel = band.match(/href=["']tel:([^"'>\s]+)["']/i)?.[1];
  if (tel) {
    const decoded = decodeURIComponent(tel.replace(/&amp;/g, '&'));
    const digits = decoded.replace(/[^\d+]/g, '');
    if (digits.length >= 9) out.phone = digits.slice(0, 40);
  }
  if (!out.phone) {
    const m = band.match(/(\+420[\s\d]{9,18})/);
    if (m?.[1]) out.phone = m[1].replace(/\s+/g, '').slice(0, 40);
  }
  return out;
}

/** Ze srcset uloží jen jednu — nejkvalitnější — variantu. */
function pushBestFromSrcset(
  raw: string | undefined,
  pushRaw: (s: string | null | undefined) => void,
): void {
  const best = pickBestImageFromSrcset(raw);
  if (best) pushRaw(best);
}

/**
 * Galerie z detailu Reality — nejdřív nasbíráme kandidáty (bez předčasného zastavení),
 * pak normalizujeme, deduplikujeme a seřadíme podle výskytu v HTML.
 */
function extractGalleryUrlsFromDetailHtml(html: string, limit = 100): string[] {
  const rawCandidates: string[] = [];
  const sink = new Set<string>();
  const pushRaw = (s: string | null | undefined) => {
    const t = (s ?? '').trim();
    if (!t) return;
    if (!sink.has(t)) {
      sink.add(t);
      rawCandidates.push(t);
    }
  };

  const og = pickOgImageFromHtml(html);
  if (og) pushRaw(og);
  for (const u of extractImageUrlsFromNextData(html, limit)) {
    pushRaw(u);
  }
  for (const re of [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']image["']/gi,
  ]) {
    for (const m of html.matchAll(re)) pushRaw(m[1]);
  }

  for (const lm of html.matchAll(
    /<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]*href=["']([^"']+)["']/gi,
  )) {
    pushRaw(lm[1]);
  }
  for (const lm of html.matchAll(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']preload["'][^>]+as=["']image["']/gi,
  )) {
    pushRaw(lm[1]);
  }

  for (const imgMatch of html.matchAll(/<img[^>]+>/gi)) {
    const tag = imgMatch[0];
    for (const attr of [
      'data-src',
      'data-lazy-src',
      'data-lazy-srcset',
      'data-original',
      'data-zoom-src',
      'data-full',
      'data-large_image',
      'data-bg',
      'data-background',
      'src',
    ]) {
      const re = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
      const m = tag.match(re);
      if (m?.[1]) {
        if (attr.toLowerCase().includes('srcset')) pushBestFromSrcset(m[1], pushRaw);
        else pushRaw(m[1]);
      }
    }
    const srcsetM = tag.match(/\ssrcset=["']([^"']+)["']/i);
    if (srcsetM?.[1]) pushBestFromSrcset(srcsetM[1], pushRaw);
  }

  for (const sm of html.matchAll(/<source[^>]+>/gi)) {
    const tag = sm[0];
    const srcM = tag.match(/\ssrc=["']([^"']+)["']/i);
    if (srcM?.[1]) pushRaw(srcM[1]);
    const setM = tag.match(/\ssrcset=["']([^"']+)["']/i);
    if (setM?.[1]) pushBestFromSrcset(setM[1], pushRaw);
  }

  for (const wrap of html.matchAll(
    /<(?:div|section|ul)[^>]+class=["'][^"']*(?:gallery|carousel|slider|swiper|photo|image|nemovitost)[^"']*["'][^>]*>/gi,
  )) {
    const start = wrap.index ?? 0;
    const slice = html.slice(start, start + 120_000);
    for (const imgMatch of slice.matchAll(/<img[^>]+>/gi)) {
      const tag = imgMatch[0];
      for (const attr of [
        'data-zoom-src',
        'data-full',
        'data-src',
        'data-lazy-src',
        'data-lazy-srcset',
        'data-original',
        'data-large_image',
        'src',
      ]) {
        const re = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
        const m = tag.match(re);
        if (m?.[1]) {
          if (attr.toLowerCase().includes('srcset')) pushBestFromSrcset(m[1], pushRaw);
          else pushRaw(m[1]);
        }
      }
      const srcsetM = tag.match(/\ssrcset=["']([^"']+)["']/i);
      if (srcsetM?.[1]) pushBestFromSrcset(srcsetM[1], pushRaw);
    }
  }

  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const scriptBody = m[1] ?? '';
    try {
      const parsed = JSON.parse(scriptBody) as unknown;
      const stack: unknown[] = [parsed];
      let guard = 0;
      while (stack.length > 0 && guard < 4000) {
        guard += 1;
        const node = stack.pop();
        if (!node) continue;
        if (typeof node === 'string') {
          if (/^https?:\/\//i.test(node)) pushRaw(node);
          continue;
        }
        if (Array.isArray(node)) {
          for (const x of node) stack.push(x);
          continue;
        }
        if (typeof node === 'object') {
          const o = node as Record<string, unknown>;
          if (typeof o.image === 'string') pushRaw(o.image);
          if (Array.isArray(o.image)) {
            for (const x of o.image) {
              if (typeof x === 'string') pushRaw(x);
              else if (x && typeof x === 'object') {
                const imgObj = x as Record<string, unknown>;
                if (typeof imgObj.url === 'string') pushRaw(imgObj.url);
                if (typeof imgObj.contentUrl === 'string') pushRaw(imgObj.contentUrl);
              }
            }
          }
          for (const v of Object.values(o)) stack.push(v);
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }

  const scriptUrlRe =
    /https?:\/\/[^"'\\s<>{}]+?\.(?:jpe?g|png|webp|gif)(?:\?[^"'\\s<>{}]*)?/gi;
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1] ?? '';
    let um: RegExpExecArray | null;
    const r = new RegExp(scriptUrlRe.source, 'gi');
    while ((um = r.exec(body)) != null) {
      const cand = um[0].trim();
      if (!isProbableRealityHostedImageUrl(cand)) continue;
      pushRaw(cand);
    }
  }

  for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)) {
    pushRaw(m[1]);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawCandidates) {
    const abs = normalizeRealityImageQualityUrl(
      toAbsoluteRealityAssetUrl(raw.trim(), 'https://www.reality.cz'),
    );
    const stored = normalizeStoredImageUrl(abs);
    if (!stored || !isLikelyListingImageUrl(stored) || seen.has(stored)) continue;
    seen.add(stored);
    ordered.push(stored);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

function flattenImageUrls(val: unknown): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (val == null) return out;
  if (typeof val === 'string') {
    push(val);
    return out;
  }
  if (Array.isArray(val)) {
    for (const x of val) {
      if (typeof x === 'string') push(x);
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        for (const k of ['url', 'src', 'href', 'imageUrl', 'thumbnail', 'photo']) {
          const u = o[k];
          if (typeof u === 'string') push(u);
        }
      }
    }
    return out;
  }
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    for (const k of ['url', 'src']) {
      const u = o[k];
      if (typeof u === 'string') push(u);
    }
  }
  return out;
}

type ScraperFetchResult = {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
};

export type RealityCzScraperFetchOutcome = {
  rows: ImportedListingDraft[];
  meta: {
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
  };
};

@Injectable()
export class RealityCzScraperImporter {
  private readonly logger = new Logger(RealityCzScraperImporter.name);
  private static readonly LISTING_PATH_RE =
    /(prodej|pronajem|pronaj|hledani|vyhledavani|search|byty|domy|pozemk|garaz|chat|chalup|komerc)/i;

  async fetch(
    limit: number,
    startUrl: string,
    settingsJson: Record<string, unknown> | null | undefined,
    onProgress?: (e: { percent: number; message: string }) => void,
  ): Promise<RealityCzScraperFetchOutcome> {
    const settings = parseRealityCzScraperSettings(settingsJson);
    const requestLog: RealityCzScraperRequestLogEntry[] = [];
    let listPage429Count = 0;
    let detailPage429Count = 0;

    this.logger.log(
      `Reality.cz scraper start: url=${startUrl} delayMs=${settings.requestDelayMs} detailGapMs=${settings.detailRequestGapMs} retries=${settings.maxRetries} listOnly=${settings.listOnlyImport} maxDetails=${settings.maxDetailFetchesPerRun} detailConcurrency=${settings.detailConcurrency}`,
    );

    onProgress?.({ percent: 6, message: 'Stahuji výpis Reality.cz…' });
    let fetched = await this.fetchWithRetry(
      startUrl,
      'list_page',
      settings,
      requestLog,
      (is429) => {
        if (is429) listPage429Count += 1;
      },
    );
    if (!this.looksLikeRealityListingUrl(fetched.finalUrl)) {
      throw new BadRequestException(
        `Reality.cz scraper byl přesměrován mimo výpis inzerátů (${fetched.finalUrl}). Zadejte konkrétní URL výpisu, ne homepage.`,
      );
    }

    onProgress?.({ percent: 14, message: 'Parsuji HTML / JSON výpisu…' });
    let parsed = this.parseListings(fetched.body);
    if (parsed.items.length === 0) {
      const page2Url = this.withStranaPage(startUrl, 2);
      if (page2Url !== startUrl) {
        this.logger.log(`Reality.cz scraper: 0 inzerátů na první stránce, zkouším fallback ${page2Url}`);
        // eslint-disable-next-line no-console
        console.log('SCRAPING URL (fallback strana=2):', page2Url);
        onProgress?.({ percent: 16, message: 'Zkouším druhou stránku výpisu…' });
        fetched = await this.fetchWithRetry(
          page2Url,
          'list_page',
          settings,
          requestLog,
          (is429) => {
            if (is429) listPage429Count += 1;
          },
        );
        if (!this.looksLikeRealityListingUrl(fetched.finalUrl)) {
          throw new BadRequestException(
            `Reality.cz scraper fallback strana=2 skončil mimo výpis inzerátů (${fetched.finalUrl}).`,
          );
        }
        parsed = this.parseListings(fetched.body);
      }
    }

    if (parsed.items.length === 0) {
      this.logger.warn('0 listings found – pravděpodobně špatná URL nebo blokace');
    }

    onProgress?.({
      percent: 22,
      message: `Nalezeno ${parsed.items.length} kandidátů (${parsed.method})…`,
    });
    let rows = this.normalizer(parsed.items, limit);
    onProgress?.({
      percent: 28,
      message: `Po validaci: ${rows.length} inzerátů z výpisu…`,
    });

    const detailFetchesAttempted = 0;
    const detailFetchesCompleted = 0;

    onProgress?.({
      percent: 50,
      message: settings.listOnlyImport
        ? 'Režim „jen výpis“ — bez detailních HTTP dotazů.'
        : `Výpis zpracován (${rows.length} inzerátů). Každý detail se stáhne před zápisem do databáze (cena, popis, galerie, kontakt).`,
    });

    onProgress?.({ percent: 68, message: 'Výpis Reality.cz hotový, předávám data importu…' });

    const meta = {
      startUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      rawCandidates: parsed.items.length,
      normalizedValid: rows.length,
      parseMethod: parsed.method,
      contentType: fetched.contentType,
      settings: scraperSettingsForLog(settings),
      requestLog,
      listPage429Count,
      detailPage429Count,
      detailFetchesAttempted,
      detailFetchesCompleted,
    };

    this.logger.log(
      `Reality.cz scraper done: final=${fetched.finalUrl} method=${parsed.method} raw=${parsed.items.length} valid=${rows.length} details=${detailFetchesCompleted}/${detailFetchesAttempted} list429=${listPage429Count} detail429=${detailPage429Count}`,
    );

    return { rows, meta };
  }

  /**
   * Fáze B — paralelní doplnění detailů (dávky, retry jedné rundy pro selhání).
   * Volá se až po uložení „skořápek“ z výpisu.
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

    /** Každý řádek s platným odkazem na detail = vždy stáhnout detail (listing jen jako mezikrok). */
    const candidates: number[] = [];
    for (let i = 0; i < working.length; i += 1) {
      const r = working[i];
      const detailUrl = r.sourceUrl?.trim();
      if (!detailUrl || !/^https?:\/\/(www\.)?reality\.cz\//i.test(detailUrl)) continue;
      candidates.push(i);
    }

    const plannedDetailSlots = Math.min(settings.maxDetailFetchesPerRun, candidates.length);
    callbacks?.onPlanned?.(plannedDetailSlots);
    let pending = candidates.slice(0, plannedDetailSlots);
    const conc = Math.max(1, Math.min(8, settings.detailConcurrency));

    const emitTick = (message: string) => {
      callbacks?.onTick?.({
        detailFetchesAttempted,
        detailFetchesCompleted,
        detailPage429Count,
        message,
      });
    };

    const succeededDetailIndices = new Set<number>();
    for (let attemptRound = 0; attemptRound < 2 && pending.length > 0; attemptRound += 1) {
      if (attemptRound > 0) {
        await this.sleep(Math.min(60_000, settings.baseBackoffMsOn429));
        this.logger.log(`Reality.cz scraper: opakuji ${pending.length} neúspěšných detailů…`);
      }
      const failed: number[] = [];
      const gap = Math.max(0, settings.detailRequestGapMs);
      for (let b = 0; b < pending.length; b += conc) {
        if (gap > 0) {
          await this.sleep(gap);
        } else if (b > 0) {
          await this.sleep(settings.requestDelayMs);
        }
        const chunk = pending.slice(b, b + conc);
        await Promise.all(
          chunk.map(async (i, idxInChunk) => {
            if (idxInChunk > 0 && gap > 0) {
              await this.sleep(gap);
            } else if (idxInChunk > 0) {
              await this.sleep(Math.min(900, 120 * idxInChunk));
            }
            const row = working[i];
            const detailUrl = row.sourceUrl?.trim() ?? '';
            const extId = row.externalId?.trim() ?? '?';
            detailFetchesAttempted += 1;
            try {
              const detail = await this.fetchWithRetry(
                detailUrl,
                'detail_page',
                settings,
                requestLog,
                (is429) => {
                  if (is429) detailPage429Count += 1;
                },
                { skipInitialDelay: true },
              );
              working[i] = this.mergeDetailIntoDraft(row, detail.body);
              if (!succeededDetailIndices.has(i)) {
                succeededDetailIndices.add(i);
                detailFetchesCompleted += 1;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.logger.warn(
                `[Reality detail] inzerát=${extId} url=${detailUrl.slice(0, 160)}: ${msg}`,
              );
              requestLog.push({
                phase: 'detail_page',
                url: detailUrl,
                attempt: settings.maxRetries,
                note: `id=${extId} failed: ${msg.slice(0, 200)}`,
              });
              failed.push(i);
            }
          }),
        );
        emitTick(
          `Detaily ${detailFetchesCompleted}/${plannedDetailSlots} (HTTP pokusů ${detailFetchesAttempted})…`,
        );
      }
      pending = failed;
    }

    return {
      rows: working,
      detailFetchesAttempted,
      detailFetchesCompleted,
      detailPage429Count,
      requestLog,
      plannedDetailSlots,
    };
  }

  private buildHeaders(targetUrl: string, phase: 'list_page' | 'detail_page'): HeadersInit {
    let referer = 'https://www.reality.cz/';
    try {
      const u = new URL(targetUrl);
      if (phase === 'detail_page') {
        referer = `${u.origin}/`;
      }
    } catch {
      /* keep default */
    }
    return {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': DEFAULT_BROWSER_UA,
      Referer: referer,
      'Cache-Control': 'max-age=0',
      DNT: '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': phase === 'detail_page' ? 'same-origin' : 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua':
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    };
  }

  private parseRetryAfterMs(header: string | null): number {
    if (!header?.trim()) return 0;
    const t = header.trim();
    const asNum = Number.parseInt(t, 10);
    if (Number.isFinite(asNum) && asNum > 0) {
      return Math.min(asNum * 1000, 300_000);
    }
    const asDate = Date.parse(t);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      return delta > 0 ? Math.min(delta, 300_000) : 0;
    }
    return 0;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Mezi každým HTTP požadavkem čekáme requestDelayMs (žádné burst requesty).
   * Při 429 exponenciální backoff + optional Retry-After.
   */
  private async fetchWithRetry(
    url: string,
    phase: 'list_page' | 'detail_page',
    settings: RealityCzScraperRuntimeSettings,
    requestLog: RealityCzScraperRequestLogEntry[],
    on429: (hit: boolean) => void,
    opts?: { skipInitialDelay?: boolean },
  ): Promise<ScraperFetchResult> {
    if (!opts?.skipInitialDelay) {
      await this.sleep(settings.requestDelayMs);
    }

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= settings.maxRetries; attempt += 1) {
      try {
        // eslint-disable-next-line no-console
        console.log('SCRAPING URL:', url);
        const res = await fetch(url, {
          headers: this.buildHeaders(url, phase),
          redirect: 'follow',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (res.status === 429) {
          on429(true);
          const fromHeader = this.parseRetryAfterMs(res.headers.get('retry-after'));
          const exp =
            settings.baseBackoffMsOn429 *
            settings.backoffMultiplier ** (attempt - 1);
          const waitMs = Math.min(
            180_000,
            Math.max(fromHeader || 0, exp, settings.requestDelayMs * 2),
          );
          this.logger.warn(
            `HTTP 429 na ${phase} url=${url} pokus ${attempt}/${settings.maxRetries} čekám ${waitMs} ms (Retry-After: ${fromHeader || '—'})`,
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
            lastErr = new Error(
              `Scraper HTTP 429 na ${phase === 'list_page' ? 'výpisové stránce (list)' : 'detailu inzerátu'} po ${settings.maxRetries} pokusech: ${url}`,
            );
            break;
          }
          await this.sleep(waitMs);
          await this.sleep(settings.requestDelayMs);
          continue;
        }

        if (!res.ok) {
          const err = new Error(
            `Scraper HTTP ${res.status} ${res.statusText || ''}`.trim(),
          );
          if (res.status >= 500 && attempt < settings.maxRetries) {
            lastErr = err;
            const waitMs = Math.min(
              60_000,
              settings.requestDelayMs * 2 ** (attempt - 1),
            );
            requestLog.push({
              phase,
              url,
              attempt,
              status: res.status,
              waitBeforeRetryMs: waitMs,
              note: 'server error, retry',
            });
            await this.sleep(waitMs);
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
        if (attempt >= settings.maxRetries) {
          break;
        }
        const waitMs = Math.min(45_000, settings.requestDelayMs * attempt);
        requestLog.push({
          phase,
          url,
          attempt,
          waitBeforeRetryMs: waitMs,
          note: msg.slice(0, 160),
        });
        await this.sleep(waitMs);
        await this.sleep(settings.requestDelayMs);
      }
    }

    throw new Error(
      `Reality.cz scraper failed after retries (${phase}): ${String(lastErr)}`,
    );
  }

  private mergeDetailIntoDraft(draft: ImportedListingDraft, html: string): ImportedListingDraft {
    const baseImages = normalizeStoredImageUrlList(
      (draft.images ?? [])
        .map((u) => normalizeRealityImageQualityUrl(toAbsoluteRealityAssetUrl(u, 'https://www.reality.cz')))
        .filter((u) => isLikelyListingImageUrl(u)),
    );
    const detailTitle = extractDetailTitleFromHtml(html);
    const longDesc = extractLongDescriptionFromDetailHtml(html);
    const metaDesc = pickMetaDescriptionFromHtml(html);
    const fromPatterns = pickFirstCleanMatch(html, [
      /<p[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
      /<div[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<[^>]+class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      /<p[^>]*>([\s\S]*?)<\/p>/i,
    ]);
    const descCandidates = [longDesc, metaDesc, fromPatterns, draft.description].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    const desc =
      descCandidates.length > 0
        ? descCandidates.reduce((a, b) => (b.trim().length > a.trim().length ? b : a))
        : draft.description;
    const loc = extractLocationHintsFromDetailHtml(html);
    const area = extractFloatAreaSqmFromHtml(html);
    const floor = extractIntNearLabel(html, /\b(?:Patro|Podlaží)\b/i);
    const totalFloors = extractIntNearLabel(html, /\b(?:Celkem\s+podlaží|Počet\s+podlaží|Podlaží\s+celkem)\b/i);
    const condition = extractConditionSnippet(html);
    const gallery = extractGalleryUrlsFromDetailHtml(html, 100);
    const priceBand = html.length > 900_000 ? html.slice(0, 900_000) : html;
    const negotiable =
      /cena\s+na\s+dotaz|cena\s*:\s*na\s+dotaz|price\s+on\s+request/i.test(
        priceBand.toLowerCase(),
      ) && !/\d[\d\s\u00a0]{5,}\s*(?:kč|czk)/i.test(priceBand.slice(0, 120_000));
    const priceText = extractDetailPriceAggregated(priceBand);
    const priceFromDetail = normalizeRealityImportedPrice(priceText);
    /** Detail: cena na dotaz → null; jinak cena z detailu nebo záloha z výpisu. */
    let mergedPrice: number | null;
    if (negotiable) {
      mergedPrice = null;
    } else if (priceFromDetail != null) {
      mergedPrice = priceFromDetail;
    } else {
      mergedPrice = draft.price;
    }
    const ogRaw = pickOgImageFromHtml(html);
    const ogAbs = ogRaw
      ? normalizeRealityImageQualityUrl(toAbsoluteRealityAssetUrl(ogRaw, 'https://www.reality.cz'))
      : '';
    const mergedUrls: string[] = [];
    const seen = new Set<string>();
    const add = (u: string) => {
      const t = normalizeStoredImageUrl(normalizeRealityImageQualityUrl(u.trim()));
      if (!t || seen.has(t) || !isLikelyListingImageUrl(t)) return;
      seen.add(t);
      mergedUrls.push(t);
    };
    if (ogAbs) add(ogAbs);
    for (const u of gallery) add(u);
    for (const u of baseImages) add(u);
    const nextImagesRaw =
      mergedUrls.length > 0
        ? mergedUrls.slice(0, 100)
        : baseImages.length > 0
          ? baseImages
          : draft.images
              .map((u) => normalizeStoredImageUrl(toAbsoluteRealityAssetUrl(u, 'https://www.reality.cz')))
              .filter((u): u is string => !!u && isLikelyListingImageUrl(u));
    const nextImages = normalizeStoredImageUrlList(nextImagesRaw);
    const descClean = cleanText(desc ?? null) ?? draft.description;
    const bestTitle =
      detailTitle && detailTitle.trim().length >= (draft.title?.trim().length ?? 0)
        ? detailTitle.trim().slice(0, 400)
        : draft.title;
    const nextCity = (loc.city?.trim() || draft.city || '').slice(0, 120) || draft.city;
    const nextAddress = (
      loc.street?.trim() ||
      draft.address?.trim() ||
      loc.district?.trim() ||
      nextCity
    ).slice(0, 240);
    const contact = extractContactFromDetailHtml(html);
    const next: ImportedListingDraft = {
      ...draft,
      title: bestTitle,
      price: mergedPrice,
      images: nextImages,
      description: (descClean || draft.description).slice(0, 60_000),
      city: nextCity,
      address: nextAddress,
      region: loc.region?.trim() || draft.region,
      district: loc.district?.trim() || draft.district,
      area: area ?? draft.area ?? null,
      floor: floor ?? draft.floor ?? null,
      totalFloors: totalFloors ?? draft.totalFloors ?? null,
      condition: condition ?? draft.condition ?? null,
    };
    if (contact.phone?.trim()) {
      next.contactPhone = contact.phone.trim().slice(0, 40);
    }
    if (contact.email?.trim()) {
      next.contactEmail = contact.email.trim().toLowerCase().slice(0, 120);
    }
    return next;
  }

  /** Přidá nebo přepíše strana= pro druhou stránku výpisu (fallback). */
  private withStranaPage(startUrl: string, page: number): string {
    try {
      const u = new URL(startUrl);
      u.searchParams.set('strana', String(page));
      return u.toString();
    } catch {
      if (startUrl.includes('?')) {
        return `${startUrl}&strana=${page}`;
      }
      return `${startUrl}?strana=${page}`;
    }
  }

  private looksLikeRealityListingUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith('reality.cz')) return false;
      const path = (u.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      if (path === '/' || path === '') return false;
      if (u.searchParams.toString().length > 0) {
        return RealityCzScraperImporter.LISTING_PATH_RE.test(`${path}${u.search}`);
      }
      return RealityCzScraperImporter.LISTING_PATH_RE.test(path);
    } catch {
      return false;
    }
  }

  private parseListings(body: string): {
    items: Array<Record<string, unknown>>;
    method: string;
  } {
    const fromNext = this.tryNextDataParser(body);
    if (fromNext.length) {
      return { items: fromNext, method: '__NEXT_DATA__' };
    }
    const fromLinks = this.realityListingLinkParser(body);
    if (fromLinks.length) {
      return { items: fromLinks, method: 'listing-links' };
    }
    const fromDetailHrefs = this.detailListingLinkParser(body);
    if (fromDetailHrefs.length) {
      return { items: fromDetailHrefs, method: 'detail-href' };
    }
    const fromArticles = this.articleCardParser(body);
    return { items: fromArticles, method: 'article-fallback' };
  }

  /**
   * Odkazy na detail inzerátu (jako a[href*="/detail/"] v prohlížeči).
   */
  private detailListingLinkParser(html: string): Array<Record<string, unknown>> {
    const re = /href=["']([^"']+)["']/gi;
    const items: Array<Record<string, unknown>> = [];
    let m: RegExpExecArray | null;
    let rawLinkCount = 0;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1];
      const abs = raw.startsWith('http')
        ? raw
        : `https://www.reality.cz${raw.startsWith('/') ? '' : '/'}${raw}`;
      if (!isRealityListingDetailHref(raw, abs)) continue;
      rawLinkCount += 1;
      const id = extractListingCodeFromRealityUrl(abs);
      if (!id) continue;
      const tail = html.slice(m.index, Math.min(html.length, m.index + 4500));
      const priceText =
        extractFirstPriceKc(tail) ?? extractFirstPriceKc(html.slice(m.index, m.index + 9000));
      const near = html.slice(Math.max(0, m.index - 1200), Math.min(html.length, m.index + 1200));
      const title =
        pickFirstCleanMatch(near, [
          /<h1[^>]*>([\s\S]*?)<\/h1>/i,
          /<h2[^>]*>([\s\S]*?)<\/h2>/i,
          /<h3[^>]*>([\s\S]*?)<\/h3>/i,
          /data-testid=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)</i,
          /<a[^>]+title=["']([^"']+)["']/i,
        ]) ?? `Nabídka ${id}`;
      if (title.length < 3) continue;
      const description =
        pickFirstCleanMatch(tail, [
          /<p[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
          /<div[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
          /<[^>]+class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
          /<p[^>]*>([\s\S]*?)<\/p>/i,
        ]) ?? title;
      const locality = pickFirstCleanMatch(tail, [
        /<span[^>]*class=["'][^"']*(?:location|local|address|locality)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        /<div[^>]*class=["'][^"']*(?:location|local|address|locality)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<[^>]+class=["'][^"']*(?:location|local|address)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      ]);
      const imgFrag = html.slice(Math.max(0, m.index - 2200), Math.min(html.length, m.index + 4800));
      const imageUrl = extractBestImageFromHtmlFragment(imgFrag);
      items.push({
        id,
        title: title.slice(0, 250),
        description: description.slice(0, 500),
        price: priceText,
        city: locality ?? undefined,
        url: abs,
        ...(imageUrl ? { image: imageUrl } : {}),
      });
    }
    // eslint-disable-next-line no-console
    console.log('FOUND LINKS:', rawLinkCount);
    return dedupeByKey(items, (r) => String(r.id));
  }

  private tryNextDataParser(body: string): Array<Record<string, unknown>> {
    const scriptMatch = body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch?.[1]) return [];
    try {
      const root = JSON.parse(scriptMatch[1]) as unknown;
      const found = this.collectListingLikeObjects(root, 0);
      return dedupeByKey(found, (r) => {
        const o = r as Record<string, unknown>;
        return (
          resolveRealityListingExternalId({
            sourceUrl: o.url ?? o.href,
            externalId: o.externalId,
            id: o.id,
            listingId: o.listingId,
          }) ?? ''
        );
      });
    } catch {
      return [];
    }
  }

  private collectListingLikeObjects(
    node: unknown,
    depth: number,
  ): Array<Record<string, unknown>> {
    if (depth > 14 || node == null) return [];
    if (typeof node !== 'object') return [];
    if (Array.isArray(node)) {
      const out: Array<Record<string, unknown>> = [];
      for (const el of node) {
        out.push(...this.collectListingLikeObjects(el, depth + 1));
      }
      return out;
    }
    const obj = node as Record<string, unknown>;
    const asListing = this.coerceObjectToListingRow(obj);
    if (asListing) return [asListing];
    const out: Array<Record<string, unknown>> = [];
    for (const v of Object.values(obj)) {
      out.push(...this.collectListingLikeObjects(v, depth + 1));
    }
    return out;
  }

  private coerceObjectToListingRow(
    obj: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const urlRaw =
      (typeof obj.url === 'string' && obj.url) ||
      (typeof obj.href === 'string' && obj.href) ||
      (typeof obj.link === 'string' && obj.link) ||
      (typeof obj.canonicalUrl === 'string' && obj.canonicalUrl) ||
      '';
    const absUrl =
      urlRaw && urlRaw.startsWith('http')
        ? urlRaw
        : urlRaw
          ? `https://www.reality.cz${urlRaw.startsWith('/') ? '' : '/'}${urlRaw}`
          : '';
    const fromUrl = absUrl ? extractListingCodeFromRealityUrl(absUrl) : null;
    const idRawStr =
      (typeof obj.id === 'string' && obj.id.trim()) ||
      (typeof obj.listingId === 'string' && obj.listingId.trim()) ||
      (typeof obj.code === 'string' && obj.code.trim()) ||
      '';
    const idRaw =
      fromUrl ||
      (idRawStr && REALITY_LISTING_CODE_RE.test(idRawStr) ? idRawStr.toUpperCase() : '');
    if (!idRaw) return null;
    const title =
      (typeof obj.title === 'string' && obj.title) ||
      (typeof obj.name === 'string' && obj.name) ||
      '';
    if (!title.trim()) return null;
    const priceVal =
      obj.price ?? obj.priceCzk ?? obj.amount ?? obj.rent ?? obj.salePrice;
    const absUrlFinal =
      absUrl ||
      `https://www.reality.cz/${idRaw}/`;
    const imagesRaw =
      obj.images ??
      obj.gallery ??
      obj.photos ??
      obj.media ??
      obj.image ??
      obj.thumbnail ??
      obj.photo ??
      obj.coverImage;
    return {
      id: idRaw,
      title,
      description:
        (typeof obj.description === 'string' && obj.description) ||
        (typeof obj.perex === 'string' && obj.perex) ||
        (typeof obj.text === 'string' && obj.text) ||
        title,
      price: priceVal,
      city: obj.city ?? obj.locality ?? obj.municipality ?? obj.region,
      address: obj.address ?? obj.street,
      images: imagesRaw,
      videoUrl: obj.videoUrl ?? obj.video,
      offerType: obj.offerType ?? obj.transactionType,
      propertyType: obj.propertyType ?? obj.estateType,
      url: absUrlFinal,
    };
  }

  private realityListingLinkParser(html: string): Array<Record<string, unknown>> {
    const items: Array<Record<string, unknown>> = [];
    const re =
      /<a[^>]+href=["']((?:https?:\/\/www\.reality\.cz)?\/[A-Za-z0-9]+-[A-Za-z0-9]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1].startsWith('http')
        ? m[1]
        : `https://www.reality.cz${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      const id = extractListingCodeFromRealityUrl(href);
      if (!id) continue;
      const tail = html.slice(m.index, Math.min(html.length, m.index + 3500));
      const title =
        cleanText(stripTags(m[2]).replace(/\s+/g, ' ').trim()) ||
        cleanText(tail.match(/<a[^>]+title=["']([^"']+)["']/i)?.[1] ?? null) ||
        `Nabídka ${id}`;
      if (title.length < 8) continue;
      const priceText =
        extractFirstPriceKc(tail) ?? extractFirstPriceKc(html.slice(m.index, m.index + 8000));
      const description =
        pickFirstCleanMatch(tail, [
          /<p[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
          /<div[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
          /<[^>]+class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
          /<p[^>]*>([\s\S]*?)<\/p>/i,
        ]) ?? title;
      const locality = pickFirstCleanMatch(tail, [
        /<span[^>]*class=["'][^"']*(?:location|local|address|locality)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        /<div[^>]*class=["'][^"']*(?:location|local|address|locality)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<[^>]+class=["'][^"']*(?:location|local|address)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      ]);
      const imageUrl = extractBestImageFromHtmlFragment(tail);
      items.push({
        id,
        title,
        description,
        price: priceText,
        city: locality ?? undefined,
        url: href,
        ...(imageUrl ? { image: imageUrl } : {}),
      });
    }
    return dedupeByKey(items, (r) => String(r.id));
  }

  private articleCardParser(html: string): Array<Record<string, unknown>> {
    const cards = html.match(/<article[\s\S]*?<\/article>/gi) ?? [];
    return cards.map((cardHtml) => {
      const text = (re: RegExp) => (cardHtml.match(re)?.[1] ?? '').trim();
      const hrefRaw = text(/href=["']([^"']+)["']/i);
      const href = hrefRaw.startsWith('http')
        ? hrefRaw
        : hrefRaw
          ? `https://www.reality.cz${hrefRaw.startsWith('/') ? '' : '/'}${hrefRaw}`
          : '';
      const idFromHref = href ? extractListingCodeFromRealityUrl(href) : null;
      const idData = text(/data-id=["']([^"']+)["']/i);
      const id =
        idFromHref ||
        (idData && REALITY_LISTING_CODE_RE.test(idData) ? idData.toUpperCase() : undefined);
      return {
        id,
        title:
          cleanText(stripTags(text(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i))) ??
          cleanText(text(/<a[^>]+title=["']([^"']+)["']/i)) ??
          '',
        description:
          cleanText(
            text(/<p[^>]*class=["'][^"']*(?:perex|description|desc|summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i),
          ) ??
          cleanText(stripTags(text(/<p[^>]*>([\s\S]*?)<\/p>/i))) ??
          '',
        price:
          extractFirstPriceKc(cardHtml) ?? text(/(\d[\d\s\u00a0]*)\s*(?:Kč|CZK)/i),
        city: cleanText(stripTags(
          text(/<span[^>]*class=["'][^"']*locality[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        )) ?? cleanText(stripTags(
          text(/<span[^>]*class=["'][^"']*(?:location|local|address)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        )),
        address: cleanText(stripTags(
          text(/<span[^>]*class=["'][^"']*address[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        )) ?? undefined,
        image:
          extractBestImageFromHtmlFragment(cardHtml) ||
          text(/<img[^>]+data-src=["']([^"']+)["']/i) ||
          text(/<img[^>]+src=["']([^"']+)["']/i),
        url: href,
      } as Record<string, unknown>;
    });
  }

  private normalizer(
    rows: Array<Record<string, unknown>>,
    limit: number,
  ): ImportedListingDraft[] {
    const out: ImportedListingDraft[] = [];
    const maxRows = Math.max(1, Math.min(500, Math.trunc(limit || 100)));
    for (const row of rows) {
      const fromImages = flattenImageUrls(row.images);
      const imgList =
        fromImages.length > 0
          ? fromImages
          : flattenImageUrls([row.image, row.thumbnail, row.photo, row.coverImage]);
      const normalized = this.normalizeRawRow({
        externalId: row.externalId,
        id: row.id,
        listingId: row.listingId,
        title: row.title ?? row.name,
        description: row.description ?? row.text ?? row.title,
        price: row.price,
        city: row.city ?? row.locality,
        address: row.address,
        images: imgList,
        videoUrl: row.videoUrl,
        offerType: row.offerType,
        propertyType: row.propertyType,
        sourceUrl: row.url ?? row.href,
        attributes: {
          area: row.area ?? null,
          landArea: row.landArea ?? null,
          rooms: row.rooms ?? null,
        },
      });
      if (!normalized) {
        continue;
      }
      out.push(normalized);
      if (out.length >= maxRows) break;
    }
    if (out.length === 0) {
      this.logger.warn(
        'Reality.cz scraper: žádný validní řádek po normalizaci (zkontrolujte start URL a strukturu stránky).',
      );
    }
    return out;
  }

  private normalizeRawRow(raw: RawImportedListing): ImportedListingDraft | null {
    const externalId = resolveRealityListingExternalId({
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId,
      id: raw.id,
      listingId: raw.listingId,
    });
    if (!externalId) {
      this.logger.warn(
        'Skipping scraper row: neplatný nebo chybějící kód Reality.cz (zkontrolujte URL inzerátu).',
      );
      return null;
    }
    const title = cleanText(String(raw.title ?? '')) ?? '';
    const description = cleanText(String(raw.description ?? title)) ?? title;
    let city = cleanText(String(raw.city ?? '')) ?? '';
    const priceParsed = normalizeRealityImportedPrice(raw.price);

    if (!city && typeof raw.sourceUrl === 'string') {
      try {
        const fromUrl = cleanText(decodeURIComponent(raw.sourceUrl).replace(/[-_/]/g, ' '));
        city = guessCityFromCzechTitle(title, fromUrl ?? '');
      } catch {
        /* ignore malformed URL encoding */
      }
    }
    if (!city) {
      city = guessCityFromCzechTitle(title, description);
    }
    if (!city) {
      city = 'Lokalita neuvedena';
    }

    if (!title) {
      this.logger.warn(
        `Skipping scraper row due to missing/invalid fields: title (id=${externalId || 'n/a'})`,
      );
      return null;
    }

    const imagesRaw = Array.isArray(raw.images) ? raw.images : [];
    const images = normalizeStoredImageUrlList(
      imagesRaw
        .flat()
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .map((u) => normalizeRealityImageQualityUrl(toAbsoluteRealityAssetUrl(u.trim(), 'https://www.reality.cz')))
        .filter((u) => isLikelyListingImageUrl(u)),
    ).slice(0, 40);
    const videoUrl =
      typeof raw.videoUrl === 'string' && /^https?:\/\//i.test(raw.videoUrl)
        ? raw.videoUrl.trim()
        : null;
    const draft: ImportedListingDraft = {
      externalId: externalId,
      title: title.slice(0, 250),
      description: description.slice(0, 10_000),
      price: priceParsed,
      city: city.slice(0, 120),
      images,
      offerType:
        (typeof raw.offerType === 'string' ? raw.offerType : '').trim() || 'prodej',
      propertyType:
        (typeof raw.propertyType === 'string' ? raw.propertyType : '').trim() || 'byt',
      attributes:
        raw.attributes && typeof raw.attributes === 'object'
          ? (raw.attributes as Record<string, unknown>)
          : undefined,
    };

    const address = (cleanText(typeof raw.address === 'string' ? raw.address : '') ?? '').slice(0, 240);
    if (address) draft.address = address;
    if (videoUrl) draft.videoUrl = videoUrl;
    const sourceUrl =
      (typeof raw.sourceUrl === 'string' ? raw.sourceUrl : '').trim();
    if (/^https?:\/\//i.test(sourceUrl)) draft.sourceUrl = sourceUrl;

    // eslint-disable-next-line no-console
    console.log('SCRAPED LISTING:', {
      title: draft.title,
      priceRaw: raw.price,
      priceParsed: draft.price,
      imageUrl: draft.images[0] ?? null,
      detailUrl: draft.sourceUrl ?? null,
      locality: draft.city,
    });

    return draft;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirstPriceKc(fragment: string): string | null {
  const low = fragment.toLowerCase();
  if (
    /cena\s+na\s+dotaz|na\s+dotaz|price\s+on\s+request|dotaz/i.test(low) &&
    !/\d[\d\s\u00a0]{4,}\s*(?:kč|czk)/i.test(fragment)
  ) {
    return null;
  }
  const m =
    fragment.match(/(\d[\d\s\u00a0]{2,20})\s*(?:Kč|CZK)(?:\s*\/\s*měs)?/i) ??
    fragment.match(/(\d[\d\s\u00a0]{2,20})\s*(?:Kč|CZK)/i);
  return m?.[1] ?? null;
}

/** Cena z JSON-LD (schema.org) na detailu Reality. */
function extractPriceFromJsonLdScripts(html: string): string | null {
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const body = m[1] ?? '';
    const patterns = [
      /"(?:lowPrice|highPrice|totalPrice|priceCzk|priceAmount)"\s*:\s*"?(\d[\d\s\u00a0]{2,15})"?/i,
      /"price"\s*:\s*"?(\d[\d\s\u00a0]{2,15})"?/i,
      /"price"\s*:\s*(\d{4,12})(?!\d)/,
      /"offers"\s*:\s*\{[^}]*"price"\s*:\s*"?(\d[\d\s\u00a0]{2,15})"?/i,
    ];
    for (const re of patterns) {
      const hit = body.match(re);
      const raw = hit?.[1];
      if (typeof raw === 'string' && /\d/.test(raw)) {
        return raw.replace(/[\s\u00a0]/g, '');
      }
    }
  }
  return null;
}

function extractDetailPriceAggregated(html: string): string | null {
  const band = html.length > 900_000 ? html.slice(0, 900_000) : html;
  return (
    extractPriceFromJsonLdScripts(band) ??
    extractPriceFromNextData(band) ??
    extractPriceFromMicrodata(band) ??
    extractFirstPriceKc(band.slice(0, 280_000)) ??
    extractFirstPriceKc(band.slice(280_000, 560_000)) ??
    extractFirstPriceKc(band.slice(560_000, 840_000))
  );
}

function extractDetailTitleFromHtml(html: string): string | null {
  const h1Raw = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const h1 = cleanText(h1Raw ? stripTags(h1Raw) : null);
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const ogT = cleanText(og ?? null);
  if (h1 && h1.length >= 10) return h1.slice(0, 400);
  if (ogT && ogT.length >= 10) return ogT.slice(0, 400);
  return h1 || ogT || null;
}

function extractLongDescriptionFromDetailHtml(html: string): string | null {
  const patterns = [
    /<div[^>]+class=["'][^"']*\bproperty-description\b[^"']*["'][^>]*>([\s\S]{120,200000}?)<\/div>/i,
    /<div[^>]+class=["'][^"']*\bpropertyDescription\b[^"']*["'][^>]*>([\s\S]{120,200000}?)<\/div>/i,
    /<div[^>]+class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]{120,200000}?)<\/div>/i,
    /<div[^>]+data-component=["']Description["'][^>]*>([\s\S]{120,200000}?)<\/div>/i,
    /<section[^>]+class=["'][^"']*description[^"']*["'][^>]*>([\s\S]{120,200000}?)<\/section>/i,
    /<div[^>]+id=["'][^"']*description[^"']*["'][^>]*>([\s\S]{120,200000}?)<\/div>/i,
    /<article[^>]*>([\s\S]{400,200000}?)<\/article>/i,
  ];
  let best = '';
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const t = cleanText(stripTags(m[1])) ?? '';
    if (t.length > best.length) best = t;
  }
  return best.length >= 120 ? best.slice(0, 60_000) : null;
}

function extractLocationHintsFromDetailHtml(html: string): {
  city?: string;
  region?: string;
  district?: string;
  street?: string;
} {
  const out: { city?: string; region?: string; district?: string; street?: string } = {};
  const band = html.length > 600_000 ? html.slice(0, 600_000) : html;
  for (const m of band.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const body = m[1] ?? '';
    if (!body.includes('address')) continue;
    const al = body.match(/"addressLocality"\s*:\s*"([^"\\]+)"/)?.[1];
    const ar = body.match(/"addressRegion"\s*:\s*"([^"\\]+)"/)?.[1];
    const sl = body.match(/"streetAddress"\s*:\s*"([^"\\]+)"/)?.[1];
    if (al) out.city = (cleanText(al) ?? al).slice(0, 120);
    if (ar) out.region = (cleanText(ar) ?? ar).slice(0, 120);
    if (sl) out.street = (cleanText(sl) ?? sl).slice(0, 240);
  }
  if (!out.city) {
    const crumbs = band.match(/class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]{0,12000}?)<\/nav>/i)?.[1];
    if (crumbs) {
      const parts = [...crumbs.matchAll(/>([^<]{2,100})<\/a>/gi)]
        .map((x) => (x[1] ?? '').trim())
        .filter((x) => x && !/^reality\.cz$/i.test(x) && !/^domů$/i.test(x));
      if (parts.length > 0) {
        out.district = parts[parts.length - 1]!.slice(0, 120);
        if (parts.length >= 2 && !out.city) out.city = parts[parts.length - 2]!.slice(0, 120);
      }
    }
  }
  return out;
}

function extractFloatAreaSqmFromHtml(html: string): number | null {
  const labelRe =
    /(?:Užitná\s+plocha|Podlahová\s+plocha|Celková\s+plocha|Plocha)\b/i;
  const idx = html.search(labelRe);
  if (idx === -1) return null;
  const slice = html.slice(idx, idx + 1200);
  const m = slice.match(/(\d+(?:[\s\u00a0]\d{3})*(?:[.,]\d+)?)\s*m(?:²|2|\^2)/i);
  if (!m?.[1]) return null;
  const raw = m[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0.5 && n < 1_000_000 ? n : null;
}

function extractIntNearLabel(html: string, label: RegExp): number | null {
  const idx = html.search(label);
  if (idx === -1) return null;
  const slice = html.slice(idx, idx + 600);
  const m = slice.match(/>\s*(\d{1,3})\s*</);
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= -5 && n < 200 ? n : null;
}

function extractConditionSnippet(html: string): string | null {
  const idx = html.search(/(?:^|>)\s*Stav\b/i);
  if (idx === -1) return null;
  const slice = html.slice(idx, idx + 500);
  const m = slice.match(/Stav[^<]{0,40}<\/[^>]+>\s*<[^>]+>([^<]{2,80})/i);
  const t = cleanText(m?.[1] ?? null);
  return t ? t.slice(0, 120) : null;
}

function guessCityFromCzechTitle(title: string, description: string): string {
  const text = `${title} ${description}`;
  const patterns: RegExp[] = [
    /\b(Praha(?:\s+\d+)?(?:\s*-\s*[\w\s]+)?)\b/i,
    /\b(Brno(?:\s*-\s*[\w\s]+)?)\b/i,
    /\b(Ostrava(?:\s*-\s*[\w\s]+)?)\b/i,
    /\b(Plzeň|Plzen)(?:\s*-\s*[\w\s]+)?\b/i,
    /\b(Olomouc(?:\s*-\s*[\w\s]+)?)\b/i,
    /\b(Liberec(?:\s*-\s*[\w\s]+)?)\b/i,
    /\b(\d{3}\s?\d{2})\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽa-záčďéěíňóřšťúůýž][\w\s\-]+)\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const g = (m[2] ?? m[1]).trim();
      if (g.length > 1 && g.length < 120) return g;
    }
  }
  const commaParts = title.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const last = commaParts[commaParts.length - 1];
    if (last.length >= 3 && last.length < 120 && !/^ul\.?\s/i.test(last)) {
      return last;
    }
    const prev = commaParts[commaParts.length - 2];
    if (prev.length >= 3 && prev.length < 120) return prev;
  }
  return '';
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = keyFn(item);
    if (!k || k === 'undefined' || k === 'null' || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
