import { API_BASE_URL } from '@/lib/api';

export type PublicBonusCampaign = {
  ctaText: string;
  bonusText: string;
  amount: number;
};

export type BonusGrantedPayload = {
  granted: boolean;
  amount?: number;
  message?: string;
  campaignId?: string;
};

export const DEFAULT_BONUS_CTA: PublicBonusCampaign = {
  ctaText: 'Založ účet, inzeruj a vydělávej',
  bonusText: 'Bonus 1 000 Kč kreditu při vložení inzerátu nebo tipu',
  amount: 1000,
};

export async function fetchActiveBonusCampaign(): Promise<PublicBonusCampaign | null> {
  if (!API_BASE_URL) return null;
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  try {
    const res = await fetch(`${base}/bonus-campaign/active`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as PublicBonusCampaign | null;
    if (!data?.ctaText?.trim()) return null;
    return {
      ctaText: data.ctaText.trim(),
      bonusText: (data.bonusText ?? DEFAULT_BONUS_CTA.bonusText).trim(),
      amount: typeof data.amount === 'number' ? data.amount : DEFAULT_BONUS_CTA.amount,
    };
  } catch {
    return null;
  }
}
