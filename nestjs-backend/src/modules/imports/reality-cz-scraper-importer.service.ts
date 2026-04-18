import { Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';

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
      const ext = String(row.externalId ?? row.id ?? row.listingId ?? '').trim();
      if (!ext) continue;
      const priceRaw = String(row.price ?? '').replace(/[^\d]/g, '');
      const price = Math.max(1, Number.parseInt(priceRaw || '0', 10) || 1);
      const title = String(row.title ?? row.name ?? 'Importovaný inzerát').trim();
      const description = String(row.description ?? row.text ?? title).trim();
      const city = String(row.city ?? row.locality ?? 'Neznámé město').trim();
      const address = String(row.address ?? '').trim();
      const imagesRaw = Array.isArray(row.images) ? row.images : [row.image ?? row.thumbnail];
      const images = imagesRaw
        .filter((x): x is string => typeof x === 'string' && /^https?:\/\//i.test(x))
        .slice(0, 40);
      const videoUrl =
        typeof row.videoUrl === 'string' && /^https?:\/\//i.test(row.videoUrl) ? row.videoUrl : null;
      out.push({
        externalId: ext,
        title: title.slice(0, 250),
        description: description.slice(0, 10_000),
        price,
        city: city.slice(0, 120),
        address: address.slice(0, 240),
        images,
        videoUrl,
        offerType: String(row.offerType ?? 'prodej').trim() || 'prodej',
        propertyType: String(row.propertyType ?? 'byt').trim() || 'byt',
        sourceUrl: typeof row.url === 'string' ? row.url : undefined,
        attributes: {
          area: row.area ?? null,
          landArea: row.landArea ?? null,
          rooms: row.rooms ?? null,
        },
      });
      if (out.length >= Math.max(1, Math.min(500, Math.trunc(limit || 100)))) break;
    }
    if (out.length === 0) {
      this.logger.warn('Reality.cz scraper returned zero normalized rows.');
    }
    return out;
  }
}

