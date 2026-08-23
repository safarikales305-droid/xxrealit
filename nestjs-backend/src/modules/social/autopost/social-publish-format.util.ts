import type { Property } from '@prisma/client';
import { getSiteOriginForOg } from '../../properties/property-og-media.util';
import { resolvePropertyOgImageWithSource } from '../../properties/property-og-media.util';
import { getPortalLogoFallbackUrl } from '../../properties/property-og-media.util';
import { resolveAssetBaseUrl } from '../../../lib/image-url';
import { upgradeHttpToHttpsForApi } from '../../../lib/secure-url';
import {
  buildPostPublicUrl,
} from '../../seo/post-seo.util';

/** Veřejná URL portálu — vždy https://www.xxrealit.cz (nebo env override). */
export function getPublicPortalUrl(): string {
  return getSiteOriginForOg();
}

export function buildPostDetailUrl(
  postId: string,
  post?: {
    slug?: string | null;
    type?: string | null;
    videoUrl?: string | null;
    youtubeVideoId?: string | null;
    media?: Array<{ type?: string | null }>;
  },
): string {
  if (post?.slug) {
    return buildPostPublicUrl(getPublicPortalUrl(), { id: postId, ...post });
  }
  return `${getPublicPortalUrl()}/prispevky/${encodeURIComponent(postId)}`;
}

export function buildPropertyFacebookMessage(
  p: Pick<Property, 'title' | 'city' | 'address' | 'area' | 'landArea'>,
  publicUrl: string,
  options?: { hidePublicPrice?: boolean },
): string {
  const location = [p.address?.trim(), p.city?.trim()].filter(Boolean).join(', ') || 'Neuvedeno';

  const lines = [
    '🏠 Nová nabídka na XXREALIT',
    '',
    p.title.trim() || 'Inzerát',
    '',
    `📍 Lokalita:\n${location}`,
  ];

  if (p.area != null && Number.isFinite(p.area)) {
    lines.push('', `📐 Plocha:\n${p.area} m²`);
  }
  if (p.landArea != null && Number.isFinite(p.landArea)) {
    lines.push('', `🌳 Pozemek:\n${p.landArea} m²`);
  }

  if (options?.hidePublicPrice !== false) {
    lines.push('', '💰 Cena je dostupná po přihlášení na portálu XXREALIT.');
  }

  lines.push(
    '',
    '👉 Více na:',
    publicUrl,
    '',
    '#xxrealit',
    '#reality',
    '#nemovitosti',
  );

  return lines.join('\n');
}

export function buildPostFacebookMessage(text: string, publicUrl: string): string {
  const body = text.trim() || 'Nový příspěvek na portálu XXREALIT.';
  return [
    '🏡 Nový příspěvek na XXREALIT',
    '',
    body,
    '',
    '👉 Více na:',
    publicUrl,
    '',
    '#xxrealit',
    '#reality',
    '#nemovitosti',
  ].join('\n');
}

export function buildVideoReelFacebookMessage(publicUrl: string, postText?: string): string {
  const snippet = (postText ?? '').trim().slice(0, 280);
  const lines = [
    '🎬 Nové video na XXREALIT',
    '',
  ];
  if (snippet) {
    lines.push(snippet, '');
  } else {
    lines.push('Podívejte se na krátkou ukázku.', '');
  }
  lines.push(
    '👉 Celý příspěvek a kontakt najdete na portálu XXREALIT:',
    '',
    publicUrl,
    '',
    '#xxrealit',
    '#reality',
    '#nemovitosti',
    '#reels',
    '#video',
  );
  return lines.join('\n');
}

export function toAbsoluteMediaUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const upgraded = upgradeHttpToHttpsForApi(raw.trim()) ?? raw.trim();
  if (/^https:\/\//i.test(upgraded)) return upgraded;
  if (upgraded.startsWith('/')) {
    const base = resolveAssetBaseUrl() ?? getSiteOriginForOg();
    return `${base.replace(/\/+$/, '')}${upgraded}`;
  }
  return upgraded.startsWith('http://') ? upgraded.replace(/^http:/i, 'https:') : null;
}

export function resolvePropertyShareImage(p: {
  facebookShareImageUrl?: string | null;
  facebookShareImageAt?: Date | null;
  thumbnailUrl?: string | null;
  mainImage?: string | null;
  images?: string[];
  generatedVideoThumbnail?: string | null;
  videoUrl?: string | null;
}): string | null {
  const resolved = resolvePropertyOgImageWithSource(
    {
      facebookShareImageUrl: p.facebookShareImageUrl,
      facebookShareImageAt: p.facebookShareImageAt,
      thumbnailUrl: p.thumbnailUrl,
      mainImage: p.mainImage,
      images: p.images ?? [],
      generatedVideoThumbnail: p.generatedVideoThumbnail,
      videoUrl: p.videoUrl,
    },
    getPortalLogoFallbackUrl(),
  );
  return toAbsoluteMediaUrl(resolved.url);
}

export function facebookPostPermalink(pageId: string, postId: string): string {
  if (postId.includes('_')) {
    return `https://www.facebook.com/${postId}`;
  }
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

/** První fotografie z příspěvku (galerie / náhled / OG). */
export function resolvePostShareImage(post: {
  type?: string | null;
  imageUrl?: string | null;
  previewImage?: string | null;
  media?: Array<{ url?: string | null; type?: string | null }>;
}): string | null {
  if (post.type === 'COMPANY_REVIEW') {
    const card =
      toAbsoluteMediaUrl(post.previewImage) ?? toAbsoluteMediaUrl(post.imageUrl);
    if (card) return card;
  }
  for (const m of post.media ?? []) {
    const type = String(m.type ?? '').toLowerCase();
    if (type === 'video') continue;
    const url = toAbsoluteMediaUrl(m.url);
    if (url) return url;
  }
  return (
    toAbsoluteMediaUrl(post.imageUrl) ??
    toAbsoluteMediaUrl(post.previewImage) ??
    null
  );
}

/** Video z příspěvku (videoUrl nebo media typu video). */
export function resolvePostShareVideo(post: {
  videoUrl?: string | null;
  media?: Array<{ url?: string | null; type?: string | null }>;
}): string | null {
  const direct = toAbsoluteMediaUrl(post.videoUrl);
  if (direct) return direct;
  for (const m of post.media ?? []) {
    const type = String(m.type ?? '').toLowerCase();
    if (type !== 'video') continue;
    const url = toAbsoluteMediaUrl(m.url);
    if (url) return url;
  }
  return null;
}

/** Text pro social publish – u recenzí firmy preferuje popis (Facebook copy). */
export function resolvePostSocialText(post: {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
}): string {
  if (post.type === 'COMPANY_REVIEW' || post.type === 'NEWS_ARTICLE' || post.type === 'YOUTUBE_VIDEO') {
    return (post.description ?? post.content ?? post.title ?? '').trim();
  }
  return (post.content ?? post.description ?? post.title ?? '').trim();
}
