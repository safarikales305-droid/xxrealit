import { Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft, RawImportedListing } from './import-types';

type ScraperFetchResult = {
  body: string;
  contentType: string;
  finalUrl: string;
};

@Injectable()
export class RealityCzScraperImporter {
  private readonly logger = new Logger(RealityCzScraperImporter.name);

  async fetch(limit: number, startUrl: string): Promise<ImportedListingDraft[]> {
    const fetched = await this.fetcher(startUrl);
    const rawItems = this.tryDataEndpointParser(fetched.body) ?? this.htmlParser(fetched.body);
    return this.normalizer(rawItems, limit);
  }

  private async fetcher(url: string): Promise<ScraperFetchResult> {
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let i = 0; i < maxAttempts; i += 1) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (compatible; XXrealitImportBot/1.0; +https://xxrealit.cz)',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`Scraper HTTP ${res.status}`);
        return {
          body: await res.text(),
          contentType: res.headers.get('content-type') ?? '',
          finalUrl: res.url,
        };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`Reality.cz scraper failed after retries: ${String(lastErr)}`);
  }

  private tryDataEndpointParser(body: string): Array<Record<string, unknown>> | null {
    const directJson = body.trim();
    if (directJson.startsWith('{') || directJson.startsWith('[')) {
      try {
        const parsed = JSON.parse(directJson) as unknown;
        if (Array.isArray(parsed)) return parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          const list = obj.items ?? obj.results ?? obj.listings ?? null;
          if (Array.isArray(list)) {
            return list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
          }
        }
      } catch {
        return null;
      }
    }
    const scriptMatch = body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch?.[1]) return null;
    try {
      const root = JSON.parse(scriptMatch[1]) as Record<string, unknown>;
      const props = (root.props ?? {}) as Record<string, unknown>;
      const pageProps = (props.pageProps ?? {}) as Record<string, unknown>;
      const candidates = [pageProps.items, pageProps.results, pageProps.listings];
      for (const c of candidates) {
        if (Array.isArray(c)) {
          return c.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private htmlParser(body: string): Array<Record<string, unknown>> {
    const cards = body.match(/<article[\s\S]*?<\/article>/gi) ?? [];
    return cards.map((html) => {
      const text = (re: RegExp) => (html.match(re)?.[1] ?? '').trim();
      const href = text(/href=["']([^"']+)["']/i);
      const image = text(/<img[^>]+src=["']([^"']+)["']/i);
      return {
        id: text(/data-id=["']([^"']+)["']/i) || href,
        title: text(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i),
        description: text(/<p[^>]*>([\s\S]*?)<\/p>/i),
        price: text(/(\d[\d\s]+)\s*Kč/i),
        city: text(/<span[^>]*class=["'][^"']*locality[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        address: text(/<span[^>]*class=["'][^"']*address[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
        image,
        url: href,
      } as Record<string, unknown>;
    });
  }

  private normalizer(rows: Array<Record<string, unknown>>, limit: number): ImportedListingDraft[] {
    const out: ImportedListingDraft[] = [];
    for (const row of rows) {
      const normalized = this.normalizeRawRow({
        externalId: row.externalId ?? row.id ?? row.listingId,
        title: row.title ?? row.name,
        description: row.description ?? row.text,
        price: row.price,
        city: row.city ?? row.locality,
        address: row.address,
        images: Array.isArray(row.images) ? row.images : [row.image ?? row.thumbnail],
        videoUrl: row.videoUrl,
        offerType: row.offerType,
        propertyType: row.propertyType,
        sourceUrl: row.url,
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
      if (out.length >= Math.max(1, Math.min(500, Math.trunc(limit || 100)))) break;
    }
    if (out.length === 0) {
      this.logger.warn('Reality.cz scraper returned zero normalized rows.');
    }
    return out;
  }

  private normalizeRawRow(raw: RawImportedListing): ImportedListingDraft | null {
    const externalId = String(raw.externalId ?? '').trim();
    const title = String(raw.title ?? '').trim();
    const description = String(raw.description ?? title).trim();
    const city = String(raw.city ?? '').trim();
    const priceRaw = String(raw.price ?? '').replace(/[^\d]/g, '');
    const parsedPrice = Number.parseInt(priceRaw || '0', 10);
    const price = Number.isFinite(parsedPrice) ? Math.max(1, parsedPrice) : 0;

    const missing: string[] = [];
    if (!externalId) missing.push('externalId');
    if (!title) missing.push('title');
    if (!city) missing.push('city');
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

