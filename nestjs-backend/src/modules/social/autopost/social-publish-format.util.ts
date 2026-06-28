import type { Property } from '@prisma/client';
import { getSiteOriginForOg } from '../../properties/property-og-media.util';
import { resolvePropertyOgImageWithSource } from '../../properties/property-og-media.util';
import { getPortalLogoFallbackUrl } from '../../properties/property-og-media.util';
import { resolveAssetBaseUrl } from '../../../lib/image-url';
import { upgradeHttpToHttpsForApi } from '../../../lib/secure-url';

export function buildPropertyFacebookMessage(
  p: Pick<
    Property,
    'title' | 'city' | 'address' | 'price' | 'area' | 'landArea' | 'currency'
  >,
  publicUrl: string,
  priceVisible: boolean,
): string {
  const location = [p.address?.trim(), p.city?.trim()].filter(Boolean).join(', ') || 'Neuvedeno';
  const priceLine =
    priceVisible && p.price != null && Number.isFinite(p.price)
      ? `${p.price.toLocaleString('cs-CZ')} ${p.currency || 'CZK'}`
      : 'Cena na portálu XXREALIT';

  const lines = [
    '🏠 Nová nabídka na XXREALIT',
    '',
    `Název:\n${p.title.trim() || 'Inzerát'}`,
    '',
    `📍 Lokalita:\n${location}`,
    '',
    `💰 Cena:\n${priceLine}`,
  ];

  if (p.area != null && Number.isFinite(p.area)) {
    lines.push('', `📐 Plocha:\n${p.area} m²`);
  }
  if (p.landArea != null && Number.isFinite(p.landArea)) {
    lines.push('', `🌳 Pozemek:\n${p.landArea} m²`);
  }

  lines.push(
    '',
    `Podívejte se na detail:\n${publicUrl}`,
    '',
    '#xxrealit #reality #nemovitosti #prodej #pronajem',
  );

  return lines.join('\n');
}

export function buildPostFacebookMessage(text: string, publicUrl: string): string {
  const body = text.trim() || 'Nový příspěvek na portálu XXREALIT.';
  return [
    'Nový příspěvek na XXREALIT',
    '',
    body,
    '',
    `Zobrazit na portálu:\n${publicUrl}`,
    '',
    '#xxrealit',
  ].join('\n');
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
