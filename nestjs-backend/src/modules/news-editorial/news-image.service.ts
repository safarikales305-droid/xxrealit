import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import { join } from 'node:path';
import sharp from '../../lib/sharp-instance';
import { getUploadsPath } from '../../lib/uploads-path';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { isProfileRemoteStorageConfigured } from '../upload/profile-media-storage.service';
import { guardedFetchFollow, NewsFetchGuardError } from './news-fetch-guard.util';
import { pickCategoryFallbackImage } from './news-hero-image.util';
import type { NewsArticleCategory } from './news-editorial.constants';
import { NEWS_FETCH_USER_AGENT } from './news-feed.util';
import { NewsAuditService } from './news-audit.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4 * 1024;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 250;
const FETCH_TIMEOUT_MS = 15_000;

const MIRROR_ALLOWED_HOSTS = new Set([
  'hypoindex.cz',
  'www.hypoindex.cz',
  'e15.cz',
  'www.e15.cz',
]);

export type NewsImageSourceKind =
  | 'media:content'
  | 'media:thumbnail'
  | 'enclosure'
  | 'rss:image'
  | 'og:image'
  | 'twitter:image'
  | 'article:image'
  | 'fallback'
  | 'none';

export type NewsImageRights = 'SOURCE_IMAGE_FOUND' | 'SOURCE_IMAGE_ALLOWED' | 'SOURCE_IMAGE_NOT_ALLOWED';

export type NewsImageDiagnostics = {
  sourceImageFound: boolean;
  sourceImageAllowed: boolean;
  rights: NewsImageRights;
  imageSource: NewsImageSourceKind;
  download: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  httpStatus?: number | null;
  contentType?: string | null;
  stored: boolean;
  storedUrl?: string | null;
  alt?: string | null;
  error?: string | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isMirrorAllowed(url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  return MIRROR_ALLOWED_HOSTS.has(h) || h.endsWith('.xxrealit.cz');
}


function extFromBuffer(metaFormat: string | undefined, contentType: string | null): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (metaFormat === 'png') return 'png';
  if (metaFormat === 'webp') return 'webp';
  return 'jpg';
}

function slugFileBase(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'aktualita';
}

@Injectable()
export class NewsImageService {
  private readonly log = new Logger(NewsImageService.name);

  constructor(
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly audit: NewsAuditService,
  ) {}

  buildAltText(title: string, category: string): string {
    const base = title.trim().replace(/\s+/g, ' ').slice(0, 120);
    const suffix =
      category === 'hypoteky'
        ? 'hypotečního trhu'
        : category === 'reality'
          ? 'realitního trhu'
          : 'bydlení a realit';
    return `Ilustrační fotografie k tématu ${base} — vývoj ${suffix} v Česku`;
  }

  async discoverOgImage(pageUrl: string): Promise<{ url: string; source: NewsImageSourceKind } | null> {
    try {
      const { response, finalUrl } = await guardedFetchFollow(pageUrl, {
        timeoutMs: FETCH_TIMEOUT_MS,
        headers: { 'User-Agent': NEWS_FETCH_USER_AGENT, Accept: 'text/html' },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const og =
        /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i.exec(html);
      const tw =
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i.exec(html);
      const raw = og?.[1] ?? tw?.[1];
      if (!raw?.trim()) return null;
      const abs = new URL(raw.trim(), finalUrl).toString();
      return { url: abs, source: og ? 'og:image' : 'twitter:image' };
    } catch {
      return null;
    }
  }

  resolveRights(imageUrl: string | null | undefined): NewsImageRights {
    if (!imageUrl?.trim()) return 'SOURCE_IMAGE_NOT_ALLOWED';
    return isMirrorAllowed(imageUrl) ? 'SOURCE_IMAGE_ALLOWED' : 'SOURCE_IMAGE_FOUND';
  }

  async resolveHeroForArticle(input: {
    articleId?: string;
    slug: string;
    title: string;
    category: string;
    rssImageUrl?: string | null;
    articlePageUrl?: string | null;
    imageSource?: NewsImageSourceKind;
  }): Promise<{ storedUrl: string; alt: string; diagnostics: NewsImageDiagnostics }> {
    let candidate = input.rssImageUrl?.trim() || null;
    let source: NewsImageSourceKind = input.imageSource ?? (candidate ? 'enclosure' : 'none');

    if (!candidate && input.articlePageUrl) {
      const discovered = await this.discoverOgImage(input.articlePageUrl);
      if (discovered) {
        candidate = discovered.url;
        source = discovered.source;
      }
    }

    const rights = this.resolveRights(candidate);
    const alt = this.buildAltText(input.title, input.category);
    const baseDiag: NewsImageDiagnostics = {
      sourceImageFound: Boolean(candidate),
      sourceImageAllowed: rights === 'SOURCE_IMAGE_ALLOWED',
      rights,
      imageSource: candidate ? source : 'none',
      download: 'SKIPPED',
      stored: false,
      alt,
    };

    if (candidate && rights === 'SOURCE_IMAGE_ALLOWED') {
      const stored = await this.downloadAndStore(candidate, input.slug);
      if (stored) {
        const diag: NewsImageDiagnostics = {
          ...baseDiag,
          download: 'SUCCESS',
          httpStatus: stored.httpStatus,
          contentType: stored.contentType,
          stored: true,
          storedUrl: stored.url,
        };
        await this.audit.log('NEWS_IMAGE_STORED', `Obrázek uložen pro ${input.slug}`, {
          articleId: input.articleId,
          metadata: diag as object,
        });
        return { storedUrl: stored.url, alt, diagnostics: diag };
      }
      baseDiag.download = 'FAILED';
      baseDiag.error = 'Stažení obrázku selhalo';
      await this.audit.log('NEWS_IMAGE_FAILED', baseDiag.error, {
        articleId: input.articleId,
        metadata: baseDiag as object,
      });
    } else if (candidate) {
      baseDiag.download = 'SKIPPED';
      baseDiag.error = 'Zdrojový obrázek nelze bezpečně použít — použit fallback';
    }

    const fallback = pickCategoryFallbackImage(input.category, input.slug);
    const diag: NewsImageDiagnostics = {
      ...baseDiag,
      imageSource: 'fallback',
      stored: true,
      storedUrl: fallback,
    };
    await this.audit.log('NEWS_IMAGE_FALLBACK', `Fallback obrázek ${fallback}`, {
      articleId: input.articleId,
      metadata: diag as object,
    });
    return { storedUrl: fallback, alt, diagnostics: diag };
  }

  private async downloadAndStore(
    imageUrl: string,
    slug: string,
  ): Promise<{ url: string; httpStatus: number; contentType: string | null } | null> {
    try {
      const { response } = await guardedFetchFollow(imageUrl, {
        timeoutMs: FETCH_TIMEOUT_MS,
        headers: { 'User-Agent': NEWS_FETCH_USER_AGENT, Accept: 'image/*' },
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.toLowerCase().includes('image/')) return null;
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength < MIN_IMAGE_BYTES || buf.byteLength > MAX_IMAGE_BYTES) return null;

      const meta = await sharp(buf, { failOn: 'none' }).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
      const fmt = meta.format?.toLowerCase();
      if (fmt && !['jpeg', 'jpg', 'png', 'webp'].includes(fmt)) return null;

      const ext = extFromBuffer(meta.format, contentType);
      const base = `${slugFileBase(slug)}-${Date.now()}`;
      const filename = `${base}.${ext}`;

      if (isProfileRemoteStorageConfigured()) {
        const url = await this.cloudinary.uploadImageBuffer(buf, filename);
        return { url, httpStatus: response.status, contentType };
      }

      const dir = join(getUploadsPath(), 'news');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(join(dir, filename), buf);
      return {
        url: `/uploads/news/${filename}`,
        httpStatus: response.status,
        contentType,
      };
    } catch (err) {
      const msg = err instanceof NewsFetchGuardError ? err.message : err instanceof Error ? err.message : String(err);
      this.log.warn(`news-image download failed: ${msg}`);
      return null;
    }
  }
}
