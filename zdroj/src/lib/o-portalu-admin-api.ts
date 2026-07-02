import { API_BASE_URL } from '@/lib/api';

async function adminFetchRaw<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; status: number; body: unknown }> {
  const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : null;
  if (!base) return { data: null, status: 0, body: null };
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
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, status: res.status, body };
    return { data: body as T, status: res.status, body };
  } catch (err) {
    return { data: null, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const { data } = await adminFetchRaw<T>(token, path, init);
  return data;
}

export type StatValueSource = 'manual' | 'database' | 'api';

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
  valueSource: StatValueSource;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  updatedAt: string;
};

export type AdminPortalStatImportLog = {
  id: string;
  statKey: string;
  source: string;
  fetchedValue: number | null;
  error: string | null;
  detail: unknown;
  createdAt: string;
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

export const VALUE_SOURCE_LABELS: Record<StatValueSource, string> = {
  manual: 'Ruční',
  database: 'Databáze',
  api: 'API',
};

export function nestAdminOPortaluStatsGet(token: string): Promise<{
  stats: AdminPortalStat[];
  monthly: AdminPortalMonthlyStat[];
  importLogs: AdminPortalStatImportLog[];
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
      valueSource?: StatValueSource;
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

export async function nestAdminOPortaluRefreshDatabase(token: string) {
  const { data, body } = await adminFetchRaw<{
    ok: boolean;
    updated: string[];
    errors: string[];
    stats: AdminPortalStat[];
    importLogs: AdminPortalStatImportLog[];
  }>(token, '/admin/o-portalu/stats/refresh-database', { method: 'POST' });
  return data ?? { ok: false, error: String(body) };
}

export async function nestAdminOPortaluRefreshFacebook(token: string) {
  const { data, body } = await adminFetchRaw<{
    ok: boolean;
    error?: string;
    stats: AdminPortalStat[];
    importLogs: AdminPortalStatImportLog[];
  }>(token, '/admin/o-portalu/stats/refresh-facebook', { method: 'POST' });
  return data ?? { ok: false, error: String(body), stats: [], importLogs: [] };
}

export async function nestAdminOPortaluRefreshInstagram(token: string) {
  const { data, body } = await adminFetchRaw<{
    ok: boolean;
    error?: string;
    stats: AdminPortalStat[];
    importLogs: AdminPortalStatImportLog[];
  }>(token, '/admin/o-portalu/stats/refresh-instagram', { method: 'POST' });
  return data ?? { ok: false, error: String(body), stats: [], importLogs: [] };
}

export async function nestAdminOPortaluRecalculate(token: string) {
  const { data, body } = await adminFetchRaw<{
    ok: boolean;
    updated: number;
    stats: AdminPortalStat[];
  }>(token, '/admin/o-portalu/stats/recalculate', { method: 'POST' });
  return data ?? { ok: false, error: String(body), updated: 0, stats: [] };
}

export async function nestAdminOPortaluRefreshStat(token: string, statId: string) {
  const { data, body } = await adminFetchRaw<{
    ok: boolean;
    error?: string;
    stats: AdminPortalStat[];
    importLogs: AdminPortalStatImportLog[];
  }>(token, `/admin/o-portalu/stats/${encodeURIComponent(statId)}/refresh`, { method: 'POST' });
  return data ?? { ok: false, error: String(body), stats: [], importLogs: [] };
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

function formatDt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

export { formatDt as formatStatFetchedAt };
