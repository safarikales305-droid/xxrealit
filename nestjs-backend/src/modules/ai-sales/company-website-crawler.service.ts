import { Injectable, Logger } from '@nestjs/common';

export type CrawledPage = {
  url: string;
  title: string;
  html: string;
  status: number;
};

const MAX_PAGES = 8;
const TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;

@Injectable()
export class CompanyWebsiteCrawlerService {
  private readonly log = new Logger(CompanyWebsiteCrawlerService.name);

  normalizeWebsiteUrl(website: string): string {
    const trimmed = website.trim();
    if (!trimmed) throw new Error('Chybí webová adresa.');
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }

  getHost(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  }

  isSameDomain(url: string, baseHost: string): boolean {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      return host === baseHost || host.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${host}`);
    } catch {
      return false;
    }
  }

  async crawl(paths: string[], startUrl: string): Promise<{ pages: CrawledPage[]; error?: string }> {
    const base = this.normalizeWebsiteUrl(startUrl);
    const origin = new URL(base).origin;
    const baseHost = this.getHost(base);
    const uniquePaths = [...new Set(paths.map((p) => (p.startsWith('/') ? p : `/${p}`)))].slice(0, MAX_PAGES);
    const pages: CrawledPage[] = [];

    for (const path of uniquePaths) {
      if (pages.length >= MAX_PAGES) break;
      const url = path === '/' ? origin + '/' : `${origin}${path}`;
      try {
        const page = await this.fetchPage(url, baseHost);
        if (page) pages.push(page);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('BLOCKED_BY_WEBSITE')) {
          return { pages, error: 'BLOCKED_BY_WEBSITE' };
        }
        this.log.debug(`Crawl skip ${url}: ${msg}`);
      }
    }

    if (!pages.length) return { pages: [], error: 'WEBSITE_UNAVAILABLE' };
    return { pages };
  }

  private async fetchPage(url: string, baseHost: string): Promise<CrawledPage | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'XXREALIT-ContactEnrichment/1.0 (+https://www.xxrealit.cz)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error('BLOCKED_BY_WEBSITE');
      }
      if (!res.ok) return null;

      const finalUrl = res.url || url;
      if (!this.isSameDomain(finalUrl, baseHost)) return null;

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_HTML_BYTES) return null;
      const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : url;
      return { url: finalUrl, title, html, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }
}
