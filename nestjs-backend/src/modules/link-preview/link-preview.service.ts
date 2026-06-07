import { Injectable, Logger } from '@nestjs/common';
import { assertSafeExternalUrl } from './link-preview-security.util';
import {
  buildLinkPreviewFallback,
  type LinkPreviewResult,
} from './link-preview-fallback.util';
import { parseOgFromHtml } from './og-html-parser.util';
import { LinkPreviewImageService } from './link-preview-image.service';
import { isSrealityHost, scrapeSrealityFromHtml } from './sreality-scraper.util';

const TOTAL_TIMEOUT_MS = 8_000;
const HTML_TIMEOUT_MS = 6_000;
const MIRROR_TIMEOUT_MS = 3_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

@Injectable()
export class LinkPreviewService {
  private readonly log = new Logger(LinkPreviewService.name);

  constructor(private readonly images: LinkPreviewImageService) {}

  async fetchPreview(rawUrl: string): Promise<LinkPreviewResult> {
    try {
      return await Promise.race([
        this.fetchPreviewInternal(rawUrl),
        new Promise<LinkPreviewResult>((resolve) => {
          setTimeout(() => {
            this.log.warn(`Link preview timeout (${rawUrl})`);
            resolve(buildLinkPreviewFallback(rawUrl));
          }, TOTAL_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      this.log.warn(
        `Link preview selhal (${rawUrl}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return buildLinkPreviewFallback(rawUrl);
    }
  }

  private async fetchPreviewInternal(rawUrl: string): Promise<LinkPreviewResult> {
    let requestUrl: string;
    try {
      requestUrl = assertSafeExternalUrl(rawUrl).href;
    } catch {
      return buildLinkPreviewFallback(rawUrl);
    }

    const html = await this.fetchHtml(requestUrl);
    if (!html.trim()) {
      return buildLinkPreviewFallback(requestUrl);
    }

    const meta = parseOgFromHtml(html, requestUrl);
    const sreality = isSrealityHost(requestUrl)
      ? scrapeSrealityFromHtml(html, requestUrl)
      : null;

    const title =
      meta.title ||
      sreality?.title ||
      (isSrealityHost(requestUrl) ? 'Inzerát na Sreality.cz' : 'Externí odkaz');
    const description =
      meta.description ||
      sreality?.description ||
      'Kliknutím otevřete původní inzerát.';
    const siteName = meta.siteName || (isSrealityHost(requestUrl) ? 'Sreality.cz' : meta.siteName);

    const remoteImage = meta.image || sreality?.image || null;
    let image: string | null = null;
    if (remoteImage) {
      image = await Promise.race([
        this.images.mirrorRemoteImage(remoteImage, requestUrl),
        new Promise<string | null>((resolve) => {
          setTimeout(() => resolve(null), MIRROR_TIMEOUT_MS);
        }),
      ]);
    }

    const hasRealData = Boolean(
      (title && !/^externí odkaz/i.test(title)) || image || description.length > 20,
    );

    if (!hasRealData) {
      return buildLinkPreviewFallback(requestUrl);
    }

    return {
      url: meta.url,
      title,
      description,
      image,
      siteName,
      failed: !image,
    };
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
        this.log.warn(`Link preview HTTP ${res.status} pro ${requestUrl}`);
        return '';
      }
      const reader = res.body?.getReader();
      if (!reader) {
        return await res.text();
      }
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
    } catch (e) {
      this.log.warn(
        `Fetch HTML selhal (${requestUrl}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return '';
    }
  }
}
