import { Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft, RawImportedListing } from './import-types';

const REALITY_LISTING_PATH_RE =
  /\/([A-Za-z0-9]+-[A-Za-z0-9]+)\/?(?:\?|#|$)/i;
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
  };
};

@Injectable()
export class RealityCzScraperImporter {
  private readonly logger = new Logger(RealityCzScraperImporter.name);

  async fetch(limit: number, startUrl: string): Promise<RealityCzScraperFetchOutcome> {
    const fetched = await this.fetcher(startUrl);
    const parsed = this.parseListings(fetched.body);
    const rows = this.normalizer(parsed.items, limit);
    const meta = {
      startUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      rawCandidates: parsed.items.length,
      normalizedValid: rows.length,
      parseMethod: parsed.method,
      contentType: fetched.contentType,
    };
    this.logger.log(
      `Reality.cz scraper: url=${startUrl} final=${fetched.finalUrl} method=${parsed.method} raw=${parsed.items.length} valid=${rows.length}`,
    );
    return { rows, meta };
  }

  private async fetcher(url: string): Promise<ScraperFetchResult> {
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let i = 0; i < maxAttempts; i += 1) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
            'Accept-Language': 'cs,en-US;q=0.9,en;q=0.8',
            'User-Agent': DEFAULT_BROWSER_UA,
            Referer: 'https://www.reality.cz/',
            'Cache-Control': 'no-cache',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          throw new Error(`Scraper HTTP ${res.status} ${res.statusText || ''}`.trim());
        }
        return {
          body: await res.text(),
          contentType: res.headers.get('content-type') ?? '',
          finalUrl: res.url,
          status: res.status,
        };
      } catch (e) {
        lastErr = e;
        const wait = 400 * (i + 1);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw new Error(`Reality.cz scraper failed after retries: ${String(lastErr)}`);
  }

  private parseListings(body: string): {
    items: Array<Record<string, unknown>>;
    method: string;
  } {
    const fromLinks = this.realityListingLinkParser(body);
    if (fromLinks.length) {
      return { items: fromLinks, method: 'listing-links' };
    }
    const fromNext = this.tryNextDataParser(body);
    if (fromNext.length) {
      return { items: fromNext, method: '__NEXT_DATA__' };
    }
    const fromArticles = this.articleCardParser(body);
    return { items: fromArticles, method: 'article-fallback' };
  }

  /** Rekurzivně hledá v JSON pole záznamů vypadajících jako inzeráty Reality.cz. */
  private tryNextDataParser(body: string): Array<Record<string, unknown>> {
    const scriptMatch = body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch?.[1]) return [];
    try {
      const root = JSON.parse(scriptMatch[1]) as unknown;
      const found = this.collectListingLikeObjects(root, 0);
      return dedupeByKey(found, (r) => String(r.id ?? r.url ?? r.href ?? ''));
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
    const pathMatch = urlRaw ? REALITY_LISTING_PATH_RE.exec(urlRaw) : null;
    const idRaw =
      (typeof obj.id === 'string' && obj.id) ||
      (typeof obj.listingId === 'string' && obj.listingId) ||
      (typeof obj.code === 'string' && obj.code) ||
      pathMatch?.[1] ||
      '';
    if (!idRaw || !/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(idRaw)) return null;
    const title =
      (typeof obj.title === 'string' && obj.title) ||
      (typeof obj.name === 'string' && obj.name) ||
      '';
    if (!title.trim()) return null;
    const priceVal =
      obj.price ?? obj.priceCzk ?? obj.amount ?? obj.rent ?? obj.salePrice;
    const absUrl =
      urlRaw && urlRaw.startsWith('http')
        ? urlRaw
        : urlRaw
          ? `https://www.reality.cz${urlRaw.startsWith('/') ? '' : '/'}${urlRaw}`
          : `https://www.reality.cz/${idRaw}/`;
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
      images: obj.images ?? obj.image ?? obj.thumbnail ?? obj.photo,
      videoUrl: obj.videoUrl ?? obj.video,
      offerType: obj.offerType ?? obj.transactionType,
      propertyType: obj.propertyType ?? obj.estateType,
      url: absUrl,
    };
  }

  /**
   * Hlavní parser: odkazy na detail inzerátu (/CODE-ID/) + titulek z textu odkazu + cena z následujícího textu.
   */
  private realityListingLinkParser(html: string): Array<Record<string, unknown>> {
    const items: Array<Record<string, unknown>> = [];
    const re =
      /<a[^>]+href=["']((?:https?:\/\/www\.reality\.cz)?\/[A-Za-z0-9]+-[A-Za-z0-9]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1].startsWith('http')
        ? m[1]
        : `https://www.reality.cz${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      const idMatch = REALITY_LISTING_PATH_RE.exec(href);
      const id = idMatch?.[1];
      if (!id) continue;
      const title = stripTags(m[2]).replace(/\s+/g, ' ').trim();
      if (title.length < 8) continue;
      const tail = html.slice(m.index, Math.min(html.length, m.index + 3500));
      const priceText = extractFirstPriceKc(tail) ?? extractFirstPriceKc(html.slice(m.index, m.index + 8000));
      items.push({
        id,
        title,
        description: title,
        price: priceText,
        url: href,
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
      const idMatch = href ? REALITY_LISTING_PATH_RE.exec(href) : null;
      const id = idMatch?.[1] ?? text(/data-id=["']([^"']+)["']/i);
      return {
        id,
        title: stripTags(text(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)),
        description: stripTags(text(/<p[^>]*>([\s\S]*?)<\/p>/i)),
        price: extractFirstPriceKc(cardHtml) ?? text(/(\d[\d\s\u00a0]*)\s*(?:Kč|CZK)/i),
        city: stripTags(
          text(/<span[^>]*class=["'][^"']*locality[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        ),
        address: stripTags(
          text(/<span[^>]*class=["'][^"']*address[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        ),
        image: text(/<img[^>]+src=["']([^"']+)["']/i),
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
      const normalized = this.normalizeRawRow({
        externalId: row.externalId ?? row.id ?? row.listingId,
        title: row.title ?? row.name,
        description: row.description ?? row.text ?? row.title,
        price: row.price,
        city: row.city ?? row.locality,
        address: row.address,
        images: Array.isArray(row.images) ? row.images : [row.image ?? row.thumbnail],
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
    const externalId = String(raw.externalId ?? '').trim();
    const title = String(raw.title ?? '').trim();
    const description = String(raw.description ?? title).trim();
    let city = String(raw.city ?? '').trim();
    const priceRaw = String(raw.price ?? '').replace(/[^\d]/g, '');
    const parsedPrice = Number.parseInt(priceRaw || '0', 10);
    const price = Number.isFinite(parsedPrice) ? Math.max(1, parsedPrice) : 0;

    if (!city) {
      city = guessCityFromCzechTitle(title, description);
    }
    if (!city) {
      city = 'Lokalita neuvedena';
    }

    const missing: string[] = [];
    if (!externalId) missing.push('externalId');
    if (!title) missing.push('title');
    if (!Number.isFinite(price) || price <= 0) missing.push('price');
    if (missing.length > 0) {
      this.logger.warn(
        `Skipping scraper row due to missing/invalid fields: ${missing.join(', ')} (id=${externalId || 'n/a'})`,
      );
      return null;
    }

    const imagesRaw = Array.isArray(raw.images) ? raw.images : [];
    const images = imagesRaw
      .filter((x): x is string => typeof x === 'string' && /^https?:\/\//i.test(x))
      .slice(0, 40);
    const videoUrl =
      typeof raw.videoUrl === 'string' && /^https?:\/\//i.test(raw.videoUrl)
        ? raw.videoUrl.trim()
        : null;
    const draft: ImportedListingDraft = {
      externalId,
      title: title.slice(0, 250),
      description: description.slice(0, 10_000),
      price,
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

    const address =
      (typeof raw.address === 'string' ? raw.address : '').trim().slice(0, 240) || '';
    if (address) draft.address = address;
    if (videoUrl) draft.videoUrl = videoUrl;
    const sourceUrl =
      (typeof raw.sourceUrl === 'string' ? raw.sourceUrl : '').trim();
    if (/^https?:\/\//i.test(sourceUrl)) draft.sourceUrl = sourceUrl;

    return draft;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirstPriceKc(fragment: string): string | null {
  const m = fragment.match(
    /(\d[\d\s\u00a0]{2,20})\s*(?:Kč|CZK)(?:\s*\/\s*měs)?/i,
  );
  return m?.[1] ?? null;
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
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
