import { API_BASE_URL } from '@/lib/api';

export type OPortaluPublicStat = {
  key: string;
  label: string;
  value: number;
  category: string | null;
  icon: string | null;
};

export type OPortaluMonthlyPoint = {
  month: string;
  label: string;
  visits: number;
  views: number;
  socialReach: number;
  leads: number;
};

export type OPortaluLeadPrice = {
  id: string;
  title: string;
  description: string;
  priceCzk: number;
  priceCredits: number;
  appliesToRoles: string;
  billedToLabel: string | null;
};

export type OPortaluPublicPayload = {
  title: string;
  stats: OPortaluPublicStat[];
  monthly: OPortaluMonthlyPoint[];
  chartMode: 'monthly' | 'summary';
  summaryChart: OPortaluMonthlyPoint[];
  leadPrices: OPortaluLeadPrice[];
};

export function formatPortalStatValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('cs-CZ');
}

export async function fetchOPortaluPublic(): Promise<OPortaluPublicPayload | null> {
  const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : null;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/public/o-portalu`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as OPortaluPublicPayload;
  } catch {
    return null;
  }
}
