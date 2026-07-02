import { API_BASE_URL } from '@/lib/api';

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : null;
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type AdminPortalStat = {
  id: string;
  key: string;
  label: string;
  realValue: number;
  multiplier: number;
  manualValue: number | null;
  displayedValue: number;
  enabled: boolean;
  order: number;
  category: string | null;
  icon: string | null;
  updatedAt: string;
};

export type AdminPortalMonthlyStat = {
  id: string;
  month: string;
  label: string;
  visits: number;
  views: number;
  socialReach: number;
  leads: number;
  multiplier: number;
  displayedVisits: number;
  displayedViews: number;
  displayedSocialReach: number;
  displayedLeads: number;
  enabled: boolean;
  updatedAt: string;
};

export type AdminLeadPrice = {
  id: string;
  title: string;
  description: string;
  priceCzk: number;
  priceCredits: number;
  appliesToRoles: string;
  billedToLabel: string | null;
  active: boolean;
  order: number;
  updatedAt: string;
};

export function nestAdminOPortaluStatsGet(token: string): Promise<{
  stats: AdminPortalStat[];
  monthly: AdminPortalMonthlyStat[];
} | null> {
  return adminFetch(token, '/admin/o-portalu/stats');
}

export function nestAdminOPortaluStatsPut(
  token: string,
  body: {
    stats: Array<{
      id: string;
      label?: string;
      realValue?: number;
      multiplier?: number;
      manualValue?: number | null;
      enabled?: boolean;
      order?: number;
    }>;
    monthly?: Array<{
      id?: string;
      month: string;
      visits?: number;
      views?: number;
      socialReach?: number;
      leads?: number;
      multiplier?: number;
      enabled?: boolean;
    }>;
  },
): Promise<{ stats: AdminPortalStat[]; monthly: AdminPortalMonthlyStat[] } | null> {
  return adminFetch(token, '/admin/o-portalu/stats', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function nestAdminOPortaluMonthlyDelete(
  token: string,
  id: string,
): Promise<{ ok: boolean } | null> {
  return adminFetch(token, `/admin/o-portalu/stats/monthly/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function nestAdminLeadPricesList(
  token: string,
): Promise<{ items: AdminLeadPrice[] } | null> {
  return adminFetch(token, '/admin/lead-prices');
}

export function nestAdminLeadPriceCreate(
  token: string,
  body: Omit<AdminLeadPrice, 'id' | 'updatedAt'>,
): Promise<AdminLeadPrice | null> {
  return adminFetch(token, '/admin/lead-prices', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestAdminLeadPriceUpdate(
  token: string,
  id: string,
  body: Partial<Omit<AdminLeadPrice, 'id' | 'updatedAt'>>,
): Promise<AdminLeadPrice | null> {
  return adminFetch(token, `/admin/lead-prices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function nestAdminLeadPriceDelete(
  token: string,
  id: string,
): Promise<{ ok: boolean } | null> {
  return adminFetch(token, `/admin/lead-prices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export const ROLE_LABELS: Record<string, string> = {
  ALL: 'Všichni',
  USER: 'Uživatelé',
  AGENT: 'Makléři',
  COMPANY: 'Firmy',
};

export function formatRolesLabel(roles: string): string {
  return roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => ROLE_LABELS[r] ?? r)
    .join(', ');
}

export function computeDisplayedPreview(
  realValue: number,
  multiplier: number,
  manualValue: number | null,
): number {
  if (manualValue != null && Number.isFinite(manualValue)) return Math.round(manualValue);
  return Math.round(realValue * multiplier);
}
