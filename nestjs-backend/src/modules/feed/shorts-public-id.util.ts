import { getSiteOriginForOg } from '../properties/property-og-media.util';
import type { ShortsItemType } from './shorts-mixed-feed.types';

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export type ParsedShortPublicId = {
  contentType: ShortsItemType | string;
  id: string;
  feedKey: string;
};

export function parseShortPublicId(raw: string): ParsedShortPublicId | null {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(':');
  if (idx <= 0) return null;
  const contentType = trimmed.slice(0, idx).trim().toLowerCase();
  const id = trimmed.slice(idx + 1).trim();
  if (!contentType || !id) return null;
  return { contentType, id, feedKey: `${contentType}:${id}` };
}

export function buildShortShareUrl(publicId: string, origin?: string): string {
  const base = (origin ?? getSiteOriginForOg()).replace(/\/+$/, '');
  const trimmed = publicId.trim();
  return `${base}/?tab=shorts&short=${encodeURIComponent(trimmed)}`;
}

export function buildShortShareUrlFromParts(
  contentType: string,
  id: string,
  origin?: string,
): string {
  return buildShortShareUrl(`${contentType}:${id}`, origin);
}

export function getShortPublicIdFromPost(post: {
  id: string;
  type?: string | null;
  youtubeVideoId?: string | null;
}): string | null {
  const type = String(post.type ?? '').toUpperCase();
  if (type === 'YOUTUBE_VIDEO') {
    const videoId = post.youtubeVideoId?.trim();
    if (videoId && YOUTUBE_ID_RE.test(videoId)) return `youtube:${videoId}`;
    return null;
  }
  if (type === 'NEWS_ARTICLE') return `article:${post.id}`;
  if (type === 'COMPANY_REVIEW') return `editorial:${post.id}`;
  return `post:${post.id}`;
}

export function propertyShortPublicId(propertyId: string): string {
  return `property:${propertyId.trim()}`;
}
