import { Injectable, Logger } from '@nestjs/common';
import { assertSafeExternalUrl } from './link-preview-security.util';
import {
  buildLinkPreviewFallback,
  type LinkPreviewResult,
} from './link-preview-fallback.util';
import { parseOgFromHtml } from './og-html-parser.util';
import { LinkPreviewImageService } from './link-preview-image.service';

const TOTAL_TIMEOUT_MS = 5_000;
const HTML_TIMEOUT_MS = 4_000;
const MIRROR_TIMEOUT_MS = 2_000;
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
          setTimeout(() => resolve(buildLinkPreviewFallback(rawUrl)), TOTAL_TIMEOUT_MS);
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

    let html = '';
    try {
      const res = await fetch(requestUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9',
        },
      });
      if (!res.ok) {
        this.log.warn(`Link preview HTTP ${res.status} pro ${requestUrl}`);
        return buildLinkPreviewFallback(requestUrl);
      }
      const reader = res.body?.getReader();
      if (!reader) {
        html = await res.text();
      } else {
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
        html = Buffer.concat(chunks).toString('utf-8');
      }
    } catch (e) {
      this.log.warn(
        `Fetch HTML selhal (${requestUrl}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return buildLinkPreviewFallback(requestUrl);
    }

    if (!html.trim()) {
      return buildLinkPreviewFallback(requestUrl);
    }

    const meta = parseOgFromHtml(html, requestUrl);
    let image: string | null = null;
    if (meta.image) {
      image = await Promise.race([
        this.images.mirrorRemoteImage(meta.image, meta.url),
        new Promise<string | null>((resolve) => {
          setTimeout(() => resolve(null), MIRROR_TIMEOUT_MS);
        }),
      ]);
    }

    return {
      url: meta.url,
      title: meta.title || meta.siteName || 'Odkaz',
      description: meta.description || 'Kliknutím otevřete původní inzerát.',
      image,
      siteName: meta.siteName,
      failed: false,
    };
  }
}
