import { API_BASE_URL } from './api';

export type CompanySeoPageAdminRow = {
  id: string;
  companyId: string;
  name: string;
  ico: string;
  slug: string;
  city?: string | null;
  region?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  website?: string | null;
  hasAiContent: boolean;
  seoScore: number;
  status: string;
  indexable: boolean;
  googleStatus: string;
  seoStatus: string;
  publicProfile: boolean;
  profileStatus: string;
  updatedAt: string;
  publicUrl: string;
  previewUrl: string;
};

export type CompanySeoJobView = {
  jobId: string;
  type: string;
  status: string;
  requestedCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  progressPct: number;
  currentItem?: string | null;
  lastError?: string | null;
};

export type CompanySeoStats = {
  totalPages: number;
  ready: number;
  indexable: number;
  outdated: number;
  duplicateReview: number;
  waitingEnrichment: number;
  averageScore: number;
  eligibleCompanies: number;
  withoutPage: number;
  activeJob?: CompanySeoJobView | null;
};

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/companies${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function nestAdminCompanySeoStats(token: string) {
  return adminFetch<CompanySeoStats>(token, '/stats');
}

export async function nestAdminCompanySeoProgress(token: string) {
  return adminFetch<{ active: boolean; job: CompanySeoJobView | null }>(token, '/progress');
}

export async function nestAdminCompanySeoPages(
  token: string,
  query?: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && String(v).length > 0) params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return adminFetch<{ items: CompanySeoPageAdminRow[]; total: number; page: number; pageSize: number }>(
    token,
    `/pages${qs ? `?${qs}` : ''}`,
  );
}

export async function nestAdminCompanySeoPreview(token: string, seoPageId: string) {
  return adminFetch<Record<string, unknown>>(token, `/pages/${encodeURIComponent(seoPageId)}/preview`);
}

export async function nestAdminCompanySeoGenerateTest(token: string) {
  return adminFetch<CompanySeoJobView>(token, '/generate-test', { method: 'POST' });
}

export async function nestAdminCompanySeoGenerateBatch(
  token: string,
  count: 10 | 100,
  filters?: Record<string, unknown>,
  forceUpdate?: boolean,
) {
  return adminFetch<CompanySeoJobView>(token, '/generate-batch', {
    method: 'POST',
    body: JSON.stringify({ count, filters, forceUpdate }),
  });
}

export async function nestAdminCompanySeoGenerateFilter(
  token: string,
  filters?: Record<string, unknown>,
  forceUpdate?: boolean,
) {
  return adminFetch<CompanySeoJobView>(token, '/generate-filter', {
    method: 'POST',
    body: JSON.stringify({ filters, forceUpdate }),
  });
}

export async function nestAdminCompanySeoPause(token: string) {
  return adminFetch<CompanySeoJobView>(token, '/jobs/pause', { method: 'POST' });
}

export async function nestAdminCompanySeoResume(token: string) {
  return adminFetch<CompanySeoJobView>(token, '/jobs/resume', { method: 'POST' });
}

export async function nestAdminCompanySeoCancel(token: string) {
  return adminFetch<CompanySeoJobView>(token, '/jobs/cancel', { method: 'POST' });
}

export async function nestAdminCompanySeoJobItems(token: string, jobId: string) {
  return adminFetch<Array<Record<string, unknown>>>(token, `/jobs/${encodeURIComponent(jobId)}/items`);
}

export async function nestAdminCompanySeoGenerateOne(
  token: string,
  companyId: string,
  forceUpdate?: boolean,
) {
  return adminFetch<{ existing: unknown; result: unknown }>(
    token,
    `/companies/${encodeURIComponent(companyId)}/generate`,
    { method: 'POST', body: JSON.stringify({ forceUpdate }) },
  );
}

export type PortalPostFeedItem = {
  id: string;
  slug: string;
  postType?: string | null;
  authorName?: string;
  authorAvatarUrl?: string | null;
  category?: string | null;
  excerpt: string;
  thumbnailUrl?: string | null;
  publishedAt: string;
  href: string;
};

export async function nestGetLatestPortalPosts(limit = 5): Promise<{ items: PortalPostFeedItem[] } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/company-directory/public/portal-posts/latest?limit=${limit}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) return null;
  return (await res.json()) as { items: PortalPostFeedItem[] };
}
