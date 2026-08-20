import type { NewsArticle } from '@prisma/client';
import { NEWS_CATEGORY_LABELS, type NewsArticleCategory } from './news-editorial.constants';
import { getPublicPortalUrl } from '../social/autopost/social-publish-format.util';
import { toAbsoluteMediaUrl } from '../social/autopost/social-publish-format.util';

export const NEWS_CATEGORY_FALLBACK_IMAGES: Partial<Record<NewsArticleCategory, string>> = {
  hypoteky: '/images/news/hypoteky.svg',
  reality: '/images/news/reality.svg',
  bydleni: '/images/news/bydleni.svg',
  'ceny-nemovitosti': '/images/news/ceny-nemovitosti.svg',
  stavebnictvi: '/images/news/stavebnictvi.svg',
  development: '/images/news/development.svg',
  katastr: '/images/news/katastr.svg',
  legislativa: '/images/news/legislativa.svg',
  investice: '/images/news/investice.svg',
  trh: '/images/news/trh.svg',
};

const DEFAULT_NEWS_IMAGE = '/images/aktuality-default-og.svg';

function isOwnedMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith('/uploads/')) return true;
  if (v.includes('res.cloudinary.com') && v.includes('xxrealit')) return true;
  if (v.includes('/images/news/') || v.includes('/images/aktuality')) return true;
  return false;
}

export function resolveNewsArticleImageUrl(
  article: Pick<NewsArticle, 'ogImageUrl' | 'socialImageUrl' | 'category'>,
  defaultOgImageUrl?: string | null,
): string {
  const candidates = [
    article.socialImageUrl,
    isOwnedMediaUrl(article.ogImageUrl) ? article.ogImageUrl : null,
    defaultOgImageUrl,
    NEWS_CATEGORY_FALLBACK_IMAGES[article.category as NewsArticleCategory],
    DEFAULT_NEWS_IMAGE,
  ];
  for (const raw of candidates) {
    const abs = toAbsoluteMediaUrl(raw) ?? (raw?.startsWith('/') ? `${getPublicPortalUrl()}${raw}` : null);
    if (abs) return abs;
  }
  return `${getPublicPortalUrl()}${DEFAULT_NEWS_IMAGE}`;
}

export function buildNewsSocialTitle(article: Pick<NewsArticle, 'title' | 'socialTitle'>): string {
  return (article.socialTitle ?? article.title).trim();
}

export function buildNewsSocialExcerpt(
  article: Pick<NewsArticle, 'perex' | 'socialExcerpt'>,
  maxLen = 280,
): string {
  const base = (article.socialExcerpt ?? article.perex).trim().replace(/\s+/g, ' ');
  if (base.length <= maxLen) return base;
  return `${base.slice(0, maxLen - 1).trim()}…`;
}

export function buildNewsPortalPostContent(input: {
  socialTitle: string;
  socialExcerpt: string;
  category: string;
  articleUrl: string;
}): string {
  const categoryLabel =
    NEWS_CATEGORY_LABELS[input.category as NewsArticleCategory] ?? input.category;
  return [
    'AKTUALITY XXREALIT',
    '',
    input.socialTitle,
    '',
    input.socialExcerpt,
    '',
    `📂 ${categoryLabel}`,
    '',
    `👉 Přečíst celý článek: ${input.articleUrl}`,
  ].join('\n');
}

export function buildNewsFacebookPostText(input: {
  socialTitle: string;
  socialExcerpt: string;
  articleUrl: string;
  addHashtags?: boolean;
}): string {
  const lines = [
    '🏠 Novinka z realitního trhu',
    '',
    input.socialTitle,
    '',
    input.socialExcerpt,
    '',
    '👉 Celý přehled na XXREALIT:',
    input.articleUrl,
  ];
  if (input.addHashtags !== false) {
    lines.push('', '#xxrealit #reality #bydleni');
  }
  return lines.join('\n');
}

export function buildNewsArticleCanonicalUrl(
  article: Pick<NewsArticle, 'slug' | 'canonicalPath'>,
): string {
  const path = article.canonicalPath ?? `/aktuality/${article.slug}`;
  const base = getPublicPortalUrl().replace(/\/+$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function mapNewsCategoryToPostCategory(
  category: string,
): 'MAKLERI' | 'FINANCNI_PORADCI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE' | 'INVESTORI' {
  switch (category) {
    case 'hypoteky':
      return 'FINANCNI_PORADCI';
    case 'stavebnictvi':
    case 'development':
    case 'rekonstrukce':
      return 'STAVEBNI_FIRMY';
    case 'investice':
      return 'INVESTORI';
    case 'reality':
    case 'najmy':
    case 'ceny-nemovitosti':
    case 'trh':
    case 'regiony':
      return 'REALITNI_KANCELARE';
    default:
      return 'MAKLERI';
  }
}

export function buildNewsPortalPostSlug(articleSlug: string): string {
  return `aktualita-${articleSlug}`.slice(0, 80);
}
