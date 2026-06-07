import { getServerSideApiBaseUrl } from '@/lib/api';

export type ShareTexts = {
  shareClassicTitle: string;
  shareClassicDescription: string;
  shareShortsTitle: string;
  shareShortsDescription: string;
  shareTipTitle: string;
  shareTipDescription: string;
  shareTiparPromoText: string;
};

export const DEFAULT_SHARE_TEXTS: ShareTexts = {
  shareClassicTitle: 'Nový inzerát na portálu XXrealit',
  shareClassicDescription: 'Podívejte se na zajímavou nemovitost na XXrealit.',
  shareShortsTitle: 'Shorts video inzerát na XXrealit',
  shareShortsDescription: 'Prohlédněte si nemovitost ve video formátu.',
  shareTipTitle: 'Tip na zajímavou nemovitost',
  shareTipDescription: 'Vydělávejte – dávejte tipy investorům do nemovitostí.',
  shareTiparPromoText: 'Tip na zajímavou nemovitost – XXrealit',
};

export type ShareContentType = 'classic' | 'shorts' | 'tip' | 'tip-shorts';

export async function fetchShareTexts(): Promise<ShareTexts> {
  const apiBase = getServerSideApiBaseUrl();
  if (!apiBase) return DEFAULT_SHARE_TEXTS;
  try {
    const res = await fetch(`${apiBase}/share-texts`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return DEFAULT_SHARE_TEXTS;
    const body = (await res.json().catch(() => null)) as Partial<ShareTexts> | null;
    return { ...DEFAULT_SHARE_TEXTS, ...body };
  } catch {
    return DEFAULT_SHARE_TEXTS;
  }
}

/** Odvodí typ obsahu z veřejné share URL (pro klientské sdílení). */
export function inferShareContentTypeFromUrl(url: string): ShareContentType {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes('/shorts/tip/')) return 'tip-shorts';
    if (path.includes('/shorts/')) return 'shorts';
    if (path.includes('/tipy/') || path.includes('/tipar/')) return 'tip';
    return 'classic';
  } catch {
    return 'classic';
  }
}

export async function fetchShareTextsClient(): Promise<ShareTexts> {
  const { API_BASE_URL } = await import('@/lib/api');
  if (!API_BASE_URL) return DEFAULT_SHARE_TEXTS;
  try {
    const res = await fetch(`${API_BASE_URL}/share-texts`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return DEFAULT_SHARE_TEXTS;
    const body = (await res.json().catch(() => null)) as Partial<ShareTexts> | null;
    return { ...DEFAULT_SHARE_TEXTS, ...body };
  } catch {
    return DEFAULT_SHARE_TEXTS;
  }
}

export function shareTextsForType(
  type: ShareContentType,
  texts: ShareTexts = DEFAULT_SHARE_TEXTS,
): { title: string; description: string } {
  switch (type) {
    case 'shorts':
      return { title: texts.shareShortsTitle, description: texts.shareShortsDescription };
    case 'tip':
      return { title: texts.shareTipTitle, description: texts.shareTipDescription };
    case 'tip-shorts':
      return { title: texts.shareTiparPromoText, description: texts.shareTipDescription };
    default:
      return { title: texts.shareClassicTitle, description: texts.shareClassicDescription };
  }
}
