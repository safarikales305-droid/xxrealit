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

const LEGACY_SHARE_GATE_TYPES: ShareGateTargetType[] = [
  'CLASSIC_LISTING',
  'SHORTS_LISTING',
  'TIP_LISTING',
  'TIP_SHORTS',
  'ALL',
];

/** Jedna session značka na inzerát — platí napříč /shorts, /nemovitost atd. */
export function shareGateSeenStorageKey(listingId: string): string {
  return `${SEEN_PREFIX}${listingId.trim()}`;
}

export function isShareGateSeen(listingId: string): boolean {
  if (typeof window === 'undefined') return false;
  const id = listingId.trim();
  if (!id) return false;
  try {
    if (sessionStorage.getItem(shareGateSeenStorageKey(id)) === 'true') return true;
    for (const type of LEGACY_SHARE_GATE_TYPES) {
      if (sessionStorage.getItem(`${SEEN_PREFIX}${type}:${id}`) === 'true') return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function markShareGateSeen(listingId: string): void {
  if (typeof window === 'undefined') return;
  const id = listingId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(shareGateSeenStorageKey(id), 'true');
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
