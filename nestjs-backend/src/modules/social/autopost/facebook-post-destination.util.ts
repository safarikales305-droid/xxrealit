import type { NewsAutomationSettings } from '../../news-editorial/news-editorial-settings.types';
import {
  DEFAULT_FACEBOOK_HASHTAGS,
  DEFAULT_FACEBOOK_POST_TEMPLATE,
  DEFAULT_FACEBOOK_YOUTUBE_TEMPLATE,
  type FacebookLinkTarget,
} from '../../news-editorial/news-editorial-settings.types';
import { buildPostPublicUrl } from '../../seo/post-seo.util';
import { getPublicPortalUrl } from './social-publish-format.util';

export type { FacebookLinkTarget };

export type FacebookDestinationPost = {
  id: string;
  slug?: string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
  externalUrl?: string | null;
  youtubeVideoId?: string | null;
  youtubeChannelTitle?: string | null;
  editorialSourceName?: string | null;
  editorialSourceUrl?: string | null;
  category?: string | null;
  videoUrl?: string | null;
  media?: Array<{ type?: string | null }>;
  user?: { name?: string | null } | null;
};

function resolveLinkTarget(
  post: FacebookDestinationPost,
  settings: Pick<
    NewsAutomationSettings,
    'facebookLinkTargetPortalPost' | 'facebookLinkTargetNewsArticle' | 'facebookLinkTargetYoutube'
  >,
): FacebookLinkTarget {
  const type = String(post.type ?? '').toUpperCase();
  if (type === 'YOUTUBE_VIDEO') {
    return settings.facebookLinkTargetYoutube ?? 'PORTAL_DETAIL';
  }
  if (type === 'NEWS_ARTICLE') {
    return settings.facebookLinkTargetNewsArticle ?? 'ARTICLE_DETAIL';
  }
  return settings.facebookLinkTargetPortalPost ?? 'PORTAL_DETAIL';
}

/** Jednotná cílová URL pro Facebook CTA — nikdy /prispevky/{id}. */
export function getFacebookDestinationUrl(
  post: FacebookDestinationPost,
  settings: Pick<
    NewsAutomationSettings,
    'facebookLinkTargetPortalPost' | 'facebookLinkTargetNewsArticle' | 'facebookLinkTargetYoutube'
  >,
  portalDetailUrl: string,
): string {
  const target = resolveLinkTarget(post, settings);
  const portal = portalDetailUrl.replace(/\/+$/, '');

  switch (target) {
    case 'ARTICLE_DETAIL': {
      const articleUrl = post.externalUrl?.trim();
      if (articleUrl?.startsWith('http')) return articleUrl;
      return portal;
    }
    case 'SOURCE': {
      const source = post.editorialSourceUrl?.trim() || post.externalUrl?.trim();
      if (source?.startsWith('http')) return source;
      return portal;
    }
    case 'YOUTUBE_ORIGINAL': {
      const watch =
        post.externalUrl?.trim() ||
        (post.youtubeVideoId ? `https://www.youtube.com/watch?v=${post.youtubeVideoId}` : '');
      if (watch.startsWith('http')) return watch;
      return portal;
    }
    case 'PORTAL_DETAIL':
    default:
      return portal;
  }
}

export function resolvePostFacebookTeaser(post: FacebookDestinationPost): string {
  const type = String(post.type ?? '').toUpperCase();
  if (type === 'NEWS_ARTICLE' || type === 'YOUTUBE_VIDEO' || type === 'COMPANY_REVIEW') {
    const teaser = (post.previewDescription ?? post.description ?? post.content ?? '').trim();
    return stripLegacyFacebookUrls(teaser);
  }
  return (post.content ?? post.description ?? post.title ?? '').trim();
}

export function resolvePostFacebookTitle(post: FacebookDestinationPost): string {
  const type = String(post.type ?? '').toUpperCase();
  if (type === 'NEWS_ARTICLE' || type === 'YOUTUBE_VIDEO') {
    return (post.previewTitle ?? post.title ?? '').trim();
  }
  return (post.title ?? post.description ?? '').trim().slice(0, 200);
}

function stripLegacyFacebookUrls(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/\/prispevky\/[a-z0-9]+/i.test(line))
    .filter((line) => !/(^|\s)https?:\/\/xxrealit\.cz/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function facebookMessageContainsUrl(text: string, url?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\{url\}/i.test(trimmed)) return true;
  if (/https?:\/\/\S+/i.test(trimmed)) return true;
  if (url && trimmed.includes(url)) return true;
  return false;
}

export function renderFacebookPostTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildFacebookPostMessage(input: {
  post: FacebookDestinationPost;
  destinationUrl: string;
  settings: Pick<
    NewsAutomationSettings,
    | 'facebookPostTemplate'
    | 'facebookYoutubePostTemplate'
    | 'facebookHashtags'
    | 'addHashtags'
    | 'portalPostAuthorLabel'
  >;
}): string {
  const { post, destinationUrl, settings } = input;
  const type = String(post.type ?? '').toUpperCase();
  const template =
    type === 'YOUTUBE_VIDEO' && settings.facebookYoutubePostTemplate?.trim()
      ? settings.facebookYoutubePostTemplate.trim()
      : (settings.facebookPostTemplate?.trim() || DEFAULT_FACEBOOK_POST_TEMPLATE);

  const hashtags =
    settings.addHashtags !== false
      ? (settings.facebookHashtags?.trim() || DEFAULT_FACEBOOK_HASHTAGS)
      : '';

  const youtubeUrl =
    post.externalUrl?.trim() ||
    (post.youtubeVideoId ? `https://www.youtube.com/watch?v=${post.youtubeVideoId}` : '');

  const vars: Record<string, string> = {
    title: resolvePostFacebookTitle(post),
    teaser: resolvePostFacebookTeaser(post),
    url: destinationUrl,
    hashtags,
    author: post.user?.name?.trim() || settings.portalPostAuthorLabel || 'XXREALIT',
    category: String(post.category ?? '').trim(),
    source: post.editorialSourceName?.trim() || '',
    youtube_url: youtubeUrl,
    channel: post.youtubeChannelTitle?.trim() || '',
  };

  return renderFacebookPostTemplate(template, vars);
}

export function buildPortalDetailUrl(post: FacebookDestinationPost): string | null {
  if (!post.slug?.trim()) return null;
  return buildPostPublicUrl(getPublicPortalUrl(), { ...post, slug: post.slug.trim() });
}

export function isValidFacebookDestinationUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return false;
  if (/\/prispevky\/[a-z0-9]+/i.test(trimmed)) return false;
  return true;
}
