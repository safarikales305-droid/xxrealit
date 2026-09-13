import { Injectable, Logger } from '@nestjs/common';
import { assertSafeExternalUrl } from '../link-preview/link-preview-security.util';
import { parseOgFromHtml } from '../link-preview/og-html-parser.util';

const HTML_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;

export type ExtractedUrlContent = {
  url: string;
  canonicalUrl: string;
  title: string;
  description: string;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  mainText: string;
  ogImageUrl: string | null;
  images: Array<{
    sourceImageUrl: string;
    sourcePageUrl: string;
    usageStatus: 'REFERENCE_ONLY' | 'UNKNOWN';
    attribution: string | null;
  }>;
  accessedAt: string;
};

@Injectable()
export class AiInfluencerUrlExtractService {
  private readonly log = new Logger(AiInfluencerUrlExtractService.name);

  async extractFromUrl(rawUrl: string): Promise<ExtractedUrlContent> {
    const parsed = assertSafeExternalUrl(rawUrl);
    const html = await this.fetchHtml(parsed.href);
    const meta = parseOgFromHtml(html, parsed.href);
    const canonicalUrl = meta.url || parsed.href;
    const title = meta.title?.trim() || this.extractTitleTag(html) || 'Externí článek';
    const description = meta.description?.trim() || '';
    const mainText = this.extractMainText(html, title, description);
    const publishedAt = this.extractPublishedAt(html);
    const author = this.extractAuthor(html);
    const images = this.extractImages(html, parsed.href, meta.image);

    return {
      url: parsed.href,
      canonicalUrl,
      title,
      description,
      siteName: meta.siteName ?? parsed.hostname.replace(/^www\./, ''),
      author,
      publishedAt,
      mainText,
      ogImageUrl: meta.image ?? null,
      images,
      accessedAt: new Date().toISOString(),
    };
  }

  private async fetchHtml(startUrl: string): Promise<string> {
    let current = startUrl;
    for (let i = 0; i < MAX_REDIRECTS; i += 1) {
      assertSafeExternalUrl(current);
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (compatible; XXREALIT-TopicHunter/1.0; +https://xxrealit.cz)',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) break;
        current = new URL(location, current).href;
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await this.readLimitedText(res);
    }
    throw new Error('Příliš mnoho redirectů');
  }

  private async readLimitedText(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return (await res.text()).slice(0, MAX_HTML_BYTES);
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
  }

  private extractTitleTag(html: string): string | null {
    const match = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    return match?.[1]?.trim() ?? null;
  }

  private extractMainText(html: string, title: string, description: string): string {
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const lower = text.toLowerCase();
    for (const noise of [
      'cookie',
      'souhlas',
      'newsletter',
      'přihlásit',
      'related articles',
      'související',
    ]) {
      const idx = lower.indexOf(noise);
      if (idx > 500) text = text.slice(0, idx);
    }
    if (title) text = text.replace(title, '').trim();
    if (description) text = text.replace(description, '').trim();
    return text.slice(0, 8000);
  }

  private extractPublishedAt(html: string): string | null {
    const jsonLdMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
    if (jsonLdMatch?.[1]) return jsonLdMatch[1];
    const timeMatch = html.match(/<time[^>]+datetime="([^"]+)"/i);
    return timeMatch?.[1] ?? null;
  }

  private extractAuthor(html: string): string | null {
    const match =
      html.match(/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i) ??
      html.match(/<meta[^>]+name="author"[^>]+content="([^"]+)"/i);
    return match?.[1]?.trim() ?? null;
  }

  private extractImages(
    html: string,
    pageUrl: string,
    ogImage?: string | null,
  ): ExtractedUrlContent['images'] {
    const images: ExtractedUrlContent['images'] = [];
    const push = (src: string | null | undefined) => {
      if (!src) return;
      try {
        const absolute = new URL(src, pageUrl).href;
        if (images.some((i) => i.sourceImageUrl === absolute)) return;
        images.push({
          sourceImageUrl: absolute,
          sourcePageUrl: pageUrl,
          usageStatus: 'REFERENCE_ONLY',
          attribution: null,
        });
      } catch {
        // ignore invalid image urls
      }
    };
    push(ogImage);
    const imgMatches = html.matchAll(/<img[^>]+src="([^"]+)"/gi);
    let count = 0;
    for (const m of imgMatches) {
      push(m[1]);
      count += 1;
      if (count >= 8) break;
    }
    return images;
  }
}
