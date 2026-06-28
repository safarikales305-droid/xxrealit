import { Injectable, Logger } from '@nestjs/common';
import {
  assertSrealityListingUrl,
  parseSrealityListingFromHtml,
  type SrealityListingPrefill,
} from './sreality-listing-prefill.util';
import { isSrealityHost } from '../link-preview/sreality-scraper.util';

const HTML_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class ListingsPrefillService {
  private readonly log = new Logger(ListingsPrefillService.name);

  async prefillFromUrl(sourceUrl: string): Promise<{ ok: true; data: SrealityListingPrefill } | { ok: false; error: string }> {
    let requestUrl: URL;
    try {
      requestUrl = assertSrealityListingUrl(sourceUrl);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Neplatná URL',
      };
    }

    const html = await this.fetchHtml(requestUrl.href);
    if (!html.trim()) {
      return { ok: false, error: 'Údaje se nepodařilo načíst. Vyplňte inzerát ručně.' };
    }

    const parsed = parseSrealityListingFromHtml(html, requestUrl.href);
    if (!parsed || (!parsed.title && !parsed.description && !parsed.city)) {
      return { ok: false, error: 'Údaje se nepodařilo načíst. Vyplňte inzerát ručně.' };
    }

    return { ok: true, data: parsed };
  }

  async fetchSourceImages(urls: string[]): Promise<
    | { ok: true; images: Array<{ fileName: string; mimeType: string; base64: string }> }
    | { ok: false; error: string }
  > {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 30);
    if (!unique.length) {
      return { ok: false, error: 'Chybí URL fotek.' };
    }

    for (const url of unique) {
      if (!isSrealityHost(url)) {
        return { ok: false, error: 'Fotky lze stáhnout pouze ze sreality.cz.' };
      }
    }

    const images: Array<{ fileName: string; mimeType: string; base64: string }> = [];
    for (let i = 0; i < unique.length; i += 1) {
      const url = unique[i]!;
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(12_000),
          headers: {
            Accept: 'image/*',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_IMAGE_BYTES) continue;
        const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
        if (!mimeType.startsWith('image/')) continue;
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        images.push({
          fileName: `sreality-${i + 1}.${ext}`,
          mimeType,
          base64: buf.toString('base64'),
        });
      } catch (err) {
        this.log.warn(`fetch source image failed ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (!images.length) {
      return { ok: false, error: 'Fotky prosím nahrajte vlastní.' };
    }

    return { ok: true, images };
  }

  private async fetchHtml(requestUrl: string): Promise<string> {
    try {
      const res = await fetch(requestUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) {
        this.log.warn(`Sreality prefill HTTP ${res.status} pro ${requestUrl}`);
        return '';
      }
      const reader = res.body?.getReader();
      if (!reader) return await res.text();

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > MAX_HTML_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      this.log.warn(
        `Sreality fetch selhal (${requestUrl}): ${err instanceof Error ? err.message : err}`,
      );
      return '';
    }
  }
}
