import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  FacebookContentProvider,
  FacebookScrapedPost,
} from './facebook-content-provider.interface';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

@Injectable()
export class FacebookUrlScraperProvider implements FacebookContentProvider {
  private readonly logger = new Logger(FacebookUrlScraperProvider.name);

  async fetchPublicPosts(pageUrl: string, limit: number): Promise<FacebookScrapedPost[]> {
    const targets = this.buildFetchTargets(pageUrl);
    let lastError: Error | null = null;

    for (const target of targets) {
      try {
        const html = await this.fetchHtml(target);
        const posts = this.parseHtml(html, pageUrl, limit);
        if (posts.length > 0) {
          this.logger.log(`FACEBOOK_URL_SCRAPE_OK url=${pageUrl} count=${posts.length}`);
          return posts.slice(0, limit);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`FACEBOOK_URL_SCRAPE_TRY_FAIL target=${target} reason=${lastError.message}`);
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  private buildFetchTargets(pageUrl: string): string[] {
    const url = new URL(pageUrl);
    const path = url.pathname + url.search;
    const mUrl = `https://m.facebook.com${path}`;
    const mbasic = `https://mbasic.facebook.com${path}`;
    return [mUrl, mbasic, pageUrl];
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`Facebook HTTP ${res.status}`);
    }
    const html = await res.text();
    if (this.looksLikeLoginWall(html)) {
      throw new Error('Facebook vyžaduje přihlášení — stránka není veřejně dostupná pro import.');
    }
    return html;
  }

  private looksLikeLoginWall(html: string): boolean {
    const lower = html.toLowerCase();
    if (html.length > 80_000) return false;
    return (
      lower.includes('you must log in') ||
      lower.includes('musíte se přihlásit') ||
      (lower.includes('/login') && lower.includes('password') && html.length < 25_000)
    );
  }

  private parseHtml(html: string, baseUrl: string, limit: number): FacebookScrapedPost[] {
    const posts: FacebookScrapedPost[] = [];
    const seen = new Set<string>();

    const add = (item: Omit<FacebookScrapedPost, 'externalId'> & { externalId?: string }) => {
      const permalink = item.permalink.trim();
      if (!permalink || seen.has(permalink)) return;
      const externalId =
        item.externalId?.trim() ||
        createHash('sha256').update(permalink).digest('hex').slice(0, 40);
      if (seen.has(externalId)) return;
      seen.add(permalink);
      seen.add(externalId);
      posts.push({
        externalId,
        permalink,
        message: item.message.trim(),
        imageUrl: item.imageUrl ?? null,
        videoUrl: item.videoUrl ?? null,
        publishedAt: item.publishedAt ?? null,
      });
    };

    const hrefRe =
      /href="([^"]*(?:facebook\.com\/[^"]*(?:posts|photo|photos|videos|reel|watch|permalink)[^"]*)|\/[^"]*(?:posts|photo|videos|reel)[^"]*)"/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRe.exec(html)) !== null && posts.length < limit * 3) {
      const href = this.resolveHref(match[1], baseUrl);
      if (!href) continue;
      add({
        permalink: href,
        message: '',
        imageUrl: null,
        videoUrl: null,
      });
    }

    const ogBlocks = html.split(/<article|<div[^>]*role="article"/i);
    for (const block of ogBlocks.slice(0, limit * 2)) {
      const permalink = this.firstMatch(block, /href="([^"]+)"/i);
      const image = this.firstMatch(
        block,
        /<img[^>]+src="(https:\/\/[^"]+fbcdn[^"]+)"/i,
      );
      const text = this.extractVisibleText(block).slice(0, 2000);
      const resolved = permalink ? this.resolveHref(permalink, baseUrl) : null;
      if (!resolved) continue;
      add({
        permalink: resolved,
        message: text,
        imageUrl: image,
        videoUrl: this.firstMatch(block, /href="(https:\/\/[^"]+\.mp4[^"]*)"/i),
      });
    }

    const jsonLdRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRe.exec(html)) !== null && posts.length < limit * 2) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        const url = typeof data.url === 'string' ? data.url : null;
        const headline = typeof data.headline === 'string' ? data.headline : '';
        const image =
          typeof data.image === 'string'
            ? data.image
            : Array.isArray(data.image) && typeof data.image[0] === 'string'
              ? data.image[0]
              : null;
        const date =
          typeof data.datePublished === 'string' ? new Date(data.datePublished) : null;
        if (url?.includes('facebook.com')) {
          add({
            permalink: url,
            message: headline,
            imageUrl: image,
            publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
          });
        }
      } catch {
        // ignore invalid JSON-LD
      }
    }

    return posts.slice(0, limit);
  }

  private firstMatch(text: string, re: RegExp): string | null {
    const m = re.exec(text);
    return m?.[1]?.trim() || null;
  }

  private extractVisibleText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveHref(href: string, baseUrl: string): string | null {
    const raw = href.replace(/&amp;/g, '&').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return null;
    try {
      const url = new URL(raw, baseUrl);
      if (!url.hostname.toLowerCase().includes('facebook.com')) return null;
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }
}
