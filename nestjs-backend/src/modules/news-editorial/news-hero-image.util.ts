import { createHash } from 'node:crypto';
import type { NewsArticleCategory } from './news-editorial.constants';
import { NEWS_CATEGORY_FALLBACK_IMAGES } from './news-portal-post.util';

const DEFAULT_NEWS_IMAGE = '/images/aktuality-default-og.svg';

const CATEGORY_FALLBACK_POOLS: Partial<Record<NewsArticleCategory | string, string[]>> = {
  reality: ['/images/news/reality.svg', '/images/news/trh.svg', '/images/news/ceny-nemovitosti.svg'],
  bydleni: ['/images/news/bydleni.svg', '/images/news/reality.svg'],
  hypoteky: ['/images/news/hypoteky.svg', '/images/news/investice.svg'],
  finance: ['/images/news/hypoteky.svg', '/images/news/investice.svg'],
  'ceny-nemovitosti': ['/images/news/ceny-nemovitosti.svg', '/images/news/trh.svg'],
  stavebnictvi: ['/images/news/stavebnictvi.svg', '/images/news/development.svg'],
  development: ['/images/news/development.svg', '/images/news/stavebnictvi.svg'],
  investice: ['/images/news/investice.svg', '/images/news/trh.svg'],
  legislativa: ['/images/news/legislativa.svg', '/images/news/katastr.svg'],
  katastr: ['/images/news/katastr.svg', '/images/news/legislativa.svg'],
  trh: ['/images/news/trh.svg', '/images/news/reality.svg'],
  regiony: ['/images/news/reality.svg', '/images/news/trh.svg'],
  cnb: ['/images/news/hypoteky.svg', '/images/news/legislativa.svg', '/images/news/trh.svg'],
};

export function isOwnedNewsHeroUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith('/uploads/')) return true;
  if (v.includes('res.cloudinary.com')) return true;
  if (v.includes('/images/news/') || v.includes('/images/aktuality')) return true;
  return false;
}

export function isValidNewsHeroImageUrl(url: string | null | undefined): boolean {
  const v = url?.trim();
  if (!v || v === 'null' || v === 'undefined') return false;
  if (v.startsWith('data:')) return false;
  return isOwnedNewsHeroUrl(v);
}

export function pickCategoryFallbackImage(category: string, seed: string): string {
  const pool =
    CATEGORY_FALLBACK_POOLS[category] ??
    (NEWS_CATEGORY_FALLBACK_IMAGES[category as NewsArticleCategory]
      ? [NEWS_CATEGORY_FALLBACK_IMAGES[category as NewsArticleCategory]!]
      : []);
  const defaults = [
    '/images/news/reality.svg',
    '/images/news/hypoteky.svg',
    '/images/news/bydleni.svg',
    '/images/news/investice.svg',
    '/images/news/trh.svg',
    DEFAULT_NEWS_IMAGE,
  ];
  const choices = [...pool, ...defaults];
  const hash = createHash('sha256').update(seed).digest();
  const idx = hash[0]! % choices.length;
  return choices[idx]!;
}

export function resolveValidNewsHeroUrl(
  article: { ogImageUrl?: string | null; socialImageUrl?: string | null; category: string; slug: string },
  defaultOgImageUrl?: string | null,
): string {
  const candidates = [
    article.socialImageUrl,
    article.ogImageUrl,
    defaultOgImageUrl,
  ];
  for (const raw of candidates) {
    if (isValidNewsHeroImageUrl(raw)) return raw!.trim();
  }
  return pickCategoryFallbackImage(article.category, article.slug);
}
