import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FacebookImportDetectedReason } from './facebook-import-reason';
import type {
  FacebookContentProvider,
  FacebookScrapeAttempt,
  FacebookScrapeResult,
  FacebookScrapedPost,
} from './facebook-content-provider.interface';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const POST_PATH_RE =
  /(?:\/posts\/|\/permalink\/|\/share\/|\/photos\/|\/photo\/|\/photo\.php|\/videos\/|\/video\.php|\/reel\/|\/watch\/?\?|story\.php|permalink\.php|story_fbid|multi_permalinks)/i;

type FetchTarget = { url: string; ua: 'desktop' | 'mobile' };

type FetchAttemptResult = FacebookScrapeAttempt & { posts: FacebookScrapedPost[] };

@Injectable()
export class FacebookUrlScraperProvider implements FacebookContentProvider {
  private readonly logger = new Logger(FacebookUrlScraperProvider.name);

  async fetchPublicPosts(pageUrl: string, limit: number): Promise<FacebookScrapeResult> {
    const targets = this.buildFetchTargets(pageUrl);
    const attempts: FacebookScrapeAttempt[] = [];
    let sawBlocked = false;
    let sawHttpError = false;
    let sawHtmlWithNoPosts = false;
    let lastAttempt: FacebookScrapeAttempt | null = null;

    for (const target of targets) {
      const result = await this.tryFetchTarget(target, pageUrl, limit);
      const { posts, ...attempt } = result;
      attempts.push(attempt);
      lastAttempt = attempt;

      if (attempt.blocked) {
        sawBlocked = true;
        continue;
      }
      if (attempt.httpStatus >= 400 || attempt.httpStatus === 0) {
        sawHttpError = true;
        continue;
      }
      if (posts.length > 0) {
        this.logger.log(
          `FACEBOOK_URL_SCRAPE_OK url=${pageUrl} fetch=${target.url} count=${posts.length}`,
        );
        return {
          posts: posts.slice(0, limit),
          detectedReason: 'OK',
          fetchUrl: target.url,
          httpStatus: attempt.httpStatus,
          contentLength: attempt.contentLength,
          rawSnippet: attempt.rawSnippet,
          attempts,
        };
      }
      if (attempt.contentLength > 800) {
        sawHtmlWithNoPosts = true;
      }
    }

    const detectedReason = this.resolveFailureReason({
      sawBlocked,
      sawHttpError,
      sawHtmlWithNoPosts,
    });

    return {
      posts: [],
      detectedReason,
      fetchUrl: lastAttempt?.fetchUrl ?? null,
      httpStatus: lastAttempt?.httpStatus ?? null,
      contentLength: lastAttempt?.contentLength ?? null,
      rawSnippet: lastAttempt?.rawSnippet ?? null,
      attempts,
    };
  }

  private resolveFailureReason(flags: {
    sawBlocked: boolean;
    sawHttpError: boolean;
    sawHtmlWithNoPosts: boolean;
  }): FacebookImportDetectedReason {
    if (flags.sawBlocked) return 'FACEBOOK_BLOCKED';
    if (flags.sawHttpError && !flags.sawHtmlWithNoPosts) return 'URL_NOT_AVAILABLE';
    if (flags.sawHtmlWithNoPosts) return 'PARSER_NO_SUPPORTED_POSTS';
    return 'NO_PUBLIC_POSTS';
  }

  private buildFetchTargets(pageUrl: string): FetchTarget[] {
    const slug = this.extractPageSlug(pageUrl);
    const bases = [
      `https://www.facebook.com${slug}`,
      `https://m.facebook.com${slug}`,
      `https://mbasic.facebook.com${slug}`,
    ];
    const suffixes = ['', '/posts', '/videos'];
    const out: FetchTarget[] = [];

    for (const base of bases) {
      for (const suffix of suffixes) {
        const url = `${base}${suffix}`.replace(/([^:]\/)\/+/g, '$1');
        const ua = url.includes('www.facebook.com') && !suffix ? 'desktop' : 'mobile';
        out.push({ url, ua });
      }
    }
    return out;
  }

  private extractPageSlug(pageUrl: string): string {
    try {
      const url = new URL(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`);
      let path = url.pathname.replace(/\/+$/, '');
      if (!path || path === '/') {
        return '';
      }
      return path.startsWith('/') ? path : `/${path}`;
    } catch {
      return '';
    }
  }

  private async tryFetchTarget(
    target: FetchTarget,
    pageUrl: string,
    limit: number,
  ): Promise<FetchAttemptResult> {
    try {
      const { html, httpStatus } = await this.fetchHtmlRaw(target.url, target.ua);
      const blocked = this.looksLikeBlocked(html, httpStatus);
      const posts = blocked ? [] : this.parseHtml(html, pageUrl, limit);
      return {
        fetchUrl: target.url,
        httpStatus,
        contentLength: html.length,
        rawSnippet: html.slice(0, 500),
        blocked,
        postsFound: posts.length,
        posts,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FACEBOOK_URL_SCRAPE_TRY_FAIL target=${target.url} reason=${message}`);
      return {
        fetchUrl: target.url,
        httpStatus: 0,
        contentLength: 0,
        rawSnippet: message.slice(0, 500),
        blocked: false,
        postsFound: 0,
        posts: [],
      };
    }
  }

  private async fetchHtmlRaw(
    url: string,
    ua: 'desktop' | 'mobile',
  ): Promise<{ html: string; httpStatus: number }> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua === 'desktop' ? DESKTOP_UA : MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    return { html, httpStatus: res.status };
  }

  private looksLikeBlocked(html: string, httpStatus: number): boolean {
    if (httpStatus === 401 || httpStatus === 403) return true;
    if (!html || html.length < 200) return true;

    const lower = html.toLowerCase();
    const loginSignals = [
      'you must log in',
      'musíte se přihlásit',
      'you\'re temporarily blocked',
      'dočasně zablokován',
      'checkpoint',
      '/login.php',
      'name="pass"',
      'id="loginform"',
    ];
    const cookieSignals = [
      'cookie consent',
      'cookie-policy',
      'cookies on facebook',
      'souhlas s cookies',
      'allow the use of cookies',
      'data-policy',
    ];

    if (loginSignals.some((s) => lower.includes(s))) return true;
    if (cookieSignals.some((s) => lower.includes(s)) && html.length < 120_000) return true;
    if (lower.includes('/login') && lower.includes('password') && html.length < 30_000) return true;

    return false;
  }

  private isPostPermalink(url: string): boolean {
    if (!POST_PATH_RE.test(url)) return false;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      const qs = parsed.search.toLowerCase();
      if (path === '/' || path === '/profile.php') return false;
      if (qs.includes('story_fbid=')) return true;
      return POST_PATH_RE.test(`${path}${qs}`);
    } catch {
      return false;
    }
  }

  private parseHtml(html: string, baseUrl: string, limit: number): FacebookScrapedPost[] {
    const posts: FacebookScrapedPost[] = [];
    const seen = new Set<string>();

    const add = (item: Omit<FacebookScrapedPost, 'externalId'> & { externalId?: string }) => {
      const permalink = this.normalizePermalink(item.permalink.trim());
      if (!permalink || !this.isPostPermalink(permalink) || seen.has(permalink)) return;
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

    const storyBlocks = html.split(/<article|<div[^>]*data-ft=|<div[^>]*role="article"/i);
    for (const block of storyBlocks) {
      if (posts.length >= limit) break;
      const storyLink = this.extractPostLinkFromBlock(block);
      const resolved = storyLink ? this.resolveHref(storyLink, baseUrl) : null;
      if (!resolved) continue;

      const image =
        this.firstMatch(block, /<img[^>]+src="(https:\/\/[^"]+fbcdn[^"]+)"/i) ||
        this.firstMatch(block, /data-src="(https:\/\/[^"]+fbcdn[^"]+)"/i) ||
        this.firstMatch(block, /"image"\s*:\s*"(https:\/\/[^"]+)"/i);
      const video =
        this.firstMatch(block, /href="(https:\/\/[^"]+\.mp4[^"]*)"/i) ||
        this.firstMatch(block, /"playable_url"\s*:\s*"(https:\/\/[^"]+)"/i);
      const abbrTitle = this.firstMatch(block, /<abbr[^>]+title="([^"]+)"/i);
      const publishedAt = abbrTitle ? this.parseFbDate(abbrTitle) : null;
      const text = this.extractPostText(block);

      add({
        permalink: resolved,
        message: text,
        imageUrl: image,
        videoUrl: video,
        publishedAt,
      });
    }

    const hrefPatterns = [
      /href="([^"]*\/posts\/[^"]+)"/gi,
      /href="([^"]*\/permalink\/[^"]+)"/gi,
      /href="([^"]*\/reel\/[^"]+)"/gi,
      /href="([^"]*\/videos\/[^"]+)"/gi,
      /href="([^"]*story\.php[^"]+)"/gi,
      /href="([^"]*photo\.php[^"]+)"/gi,
      /href="([^"]*permalink\.php[^"]+)"/gi,
      /href="([^"]*watch\/\?v=[^"]+)"/gi,
    ];

    for (const re of hrefPatterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(html)) !== null && posts.length < limit) {
        const href = this.resolveHref(match[1], baseUrl);
        if (!href) continue;
        add({ permalink: href, message: '', imageUrl: null, videoUrl: null });
      }
    }

    const jsonPermalinkRe = /"(?:permalink_url|wwwURL|share_url)"\s*:\s*"([^"]+)"/gi;
    let jsonMatch: RegExpExecArray | null;
    while ((jsonMatch = jsonPermalinkRe.exec(html)) !== null && posts.length < limit) {
      const raw = jsonMatch[1].replace(/\\\//g, '/');
      const href = this.resolveHref(raw, baseUrl);
      if (!href) continue;
      add({ permalink: href, message: '', imageUrl: null, videoUrl: null });
    }

    const storyFbidRe = /story_fbid=(\d+)/gi;
    while ((jsonMatch = storyFbidRe.exec(html)) !== null && posts.length < limit) {
      const pageId = this.firstMatch(html, /"page_id"\s*:\s*"(\d+)"/i) ||
        this.firstMatch(html, /"entity_id"\s*:\s*"(\d+)"/i);
      const fbid = jsonMatch[1];
      const permalink = pageId
        ? `https://www.facebook.com/permalink.php?story_fbid=${fbid}&id=${pageId}`
        : `https://www.facebook.com/story.php?story_fbid=${fbid}`;
      add({ permalink, message: '', imageUrl: null, videoUrl: null, externalId: `fb_story_${fbid}` });
    }

    const jsonLdRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    while ((jsonMatch = jsonLdRe.exec(html)) !== null && posts.length < limit) {
      try {
        const data = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
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

  private extractPostLinkFromBlock(block: string): string | null {
    return (
      this.firstMatch(block, /href="([^"]*story\.php[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*permalink\.php[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*\/posts\/[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*\/permalink\/[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*\/photos\/[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*\/videos\/[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*\/reel\/[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*photo\.php[^"]+)"/i) ||
      this.firstMatch(block, /href="([^"]*watch\/\?v=[^"]+)"/i)
    );
  }

  private normalizePermalink(url: string): string {
    try {
      const u = new URL(url);
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  private parseFbDate(raw: string): Date | null {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private extractPostText(html: string): string {
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const paragraphs = [...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => this.extractVisibleText(m[1]))
      .filter((t) => t.length > 8);
    if (paragraphs.length) return paragraphs.join('\n\n').slice(0, 4000);
    return this.extractVisibleText(stripped).slice(0, 2000);
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
    const raw = href.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').trim();
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
