import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';

export type ShareGateTargetType =
  | 'CLASSIC_LISTING'
  | 'SHORTS_LISTING'
  | 'TIP_LISTING'
  | 'TIP_SHORTS'
  | 'ALL';

export type ShareGateVideoPublic = {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  targetType: ShareGateTargetType;
  minWatchSeconds: number;
  buttonText: string;
};

export type ShareGateVideoAdmin = ShareGateVideoPublic & {
  isActive: boolean;
  sortOrder: number;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: string;
  updatedAt: string;
};

const SEEN_PREFIX = 'shareGateSeen:';

export function shareGateSeenStorageKey(
  type: ShareGateTargetType,
  listingId: string,
): string {
  return `${SEEN_PREFIX}${type}:${listingId}`;
}

export function isShareGateSeen(type: ShareGateTargetType, listingId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(shareGateSeenStorageKey(type, listingId)) === 'true';
  } catch {
    return false;
  }
}

export function markShareGateSeen(type: ShareGateTargetType, listingId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(shareGateSeenStorageKey(type, listingId), 'true');
  } catch {
    /* ignore */
  }
}

export async function fetchShareGateVideo(
  type: ShareGateTargetType,
): Promise<ShareGateVideoPublic | null> {
  if (!API_BASE_URL) return null;
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const url = `${base}/share-gate-video?type=${encodeURIComponent(type)}`;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as ShareGateVideoPublic | null;
    if (!data?.videoUrl?.trim()) return null;
    return {
      ...data,
      videoUrl: nestAbsoluteAssetUrl(data.videoUrl),
      posterUrl: data.posterUrl ? nestAbsoluteAssetUrl(data.posterUrl) : null,
      minWatchSeconds: Math.max(1, Math.min(120, data.minWatchSeconds ?? 5)),
      buttonText: data.buttonText?.trim() || 'Pokračovat na inzerát',
    };
  } catch {
    return null;
  }
}
