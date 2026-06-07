import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { assertSafeExternalUrl } from './link-preview-security.util';
import { parseOgFromHtml } from './og-html-parser.util';
import { LinkPreviewImageService } from './link-preview-image.service';

const HTML_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export type LinkPreviewResult = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

@Injectable()
export class LinkPreviewService {
  private readonly log = new Logger(LinkPreviewService.name);

  constructor(private readonly images: LinkPreviewImageService) {}

  async fetchPreview(rawUrl: string): Promise<LinkPreviewResult> {
    const parsed = assertSafeExternalUrl(rawUrl);
    const requestUrl = parsed.href;

    let html = '';
    try {
      const res = await fetch(requestUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (compatible; XXrealitLinkPreview/1.0; +https://www.xxrealit.cz)',
        },
      });
      if (!res.ok) {
        throw new BadRequestException(`Stránku se nepodařilo načíst (${res.status})`);
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
      if (e instanceof BadRequestException) throw e;
      this.log.warn(`Fetch HTML selhal: ${e instanceof Error ? e.message : String(e)}`);
      throw new BadRequestException('Náhled odkazu se nepodařilo načíst');
    }

    const meta = parseOgFromHtml(html, requestUrl);
    const image = meta.image
      ? await this.images.mirrorRemoteImage(meta.image, meta.url)
      : await this.images.getPlaceholderUrl();

    return {
      url: meta.url,
      title: meta.title || meta.siteName || 'Odkaz',
      description: meta.description,
      image,
      siteName: meta.siteName,
    };
  }
}
