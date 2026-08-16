import { API_BASE_URL } from './api';

export type CompanyDirectoryCategoryKey =
  | 'STAVEBNICTVI'
  | 'REALITY'
  | 'FINANCE'
  | 'PROJEKTOVANI'
  | 'ARCHITEKTURA'
  | 'SPRAVA_NEMOVITOSTI'
  | 'REMESLA'
  | 'DEVELOPMENT'
  | 'ENERGETIKA'
  | 'HYPOTEKA'
  | 'OSTATNI';

export type CompanyDirectoryCard = {
  type: 'company';
  id: string;
  ico: string;
  slug: string;
  name: string;
  category: CompanyDirectoryCategoryKey;
  categoryLabel: string;
  city?: string | null;
  region?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  logoUrl?: string | null;
  profileStatus: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
  verificationStatus: string;
  companyStatus?: string | null;
  badges: string[];
  href: string;
  isVerified: boolean;
};

export type FeaturedProfileCard = {
  type: 'person' | 'company';
  id: string;
  name: string;
  slug?: string | null;
  role?: string;
  category?: string;
  categoryLabel?: string;
  city?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  isVerified: boolean;
  badges: string[];
  href: string;
};

export type CompanyDirectoryListResponse = {
  items: CompanyDirectoryCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type CompanyDirectoryDetailResponse = {
  company: CompanyDirectoryCard & {
    dic?: string | null;
    legalForm?: string | null;
    street?: string | null;
    postalCode?: string | null;
    district?: string | null;
    registeredAddress?: string | null;
    categories: Array<{ key: string; label: string }>;
    businessActivities: string[];
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    aresLastSyncAt?: string | null;
    aresSource?: boolean;
    registryDisclaimer?: string;
  };
  similar: CompanyDirectoryCard[];
};

const CATEGORY_LABELS: Record<CompanyDirectoryCategoryKey, string> = {
  STAVEBNICTVI: 'Stavebnictví',
  REALITY: 'Reality',
  FINANCE: 'Finance',
  PROJEKTOVANI: 'Projektování',
  ARCHITEKTURA: 'Architektura',
  SPRAVA_NEMOVITOSTI: 'Správa nemovitostí',
  REMESLA: 'Řemesla',
  DEVELOPMENT: 'Development',
  ENERGETIKA: 'Energetika',
  HYPOTEKA: 'Hypoteční služby',
  OSTATNI: 'Ostatní',
};

export const COMPANY_DIRECTORY_CATEGORIES = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as CompanyDirectoryCategoryKey, label }),
);

export async function nestListCompanies(
  query?: Record<string, string | number | undefined>,
): Promise<CompanyDirectoryListResponse | null> {
  if (!API_BASE_URL) return null;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).length > 0) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/company-directory/public${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as CompanyDirectoryListResponse;
}

export async function nestGetCompanyBySlug(
  slug: string,
): Promise<CompanyDirectoryDetailResponse | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as CompanyDirectoryDetailResponse;
}

export async function nestListFeaturedProfiles(options?: {
  category?: string;
  limit?: number;
}): Promise<FeaturedProfileCard[] | null> {
  if (!API_BASE_URL) return null;
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/company-directory/public/featured${qs ? `?${qs}` : ''}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as FeaturedProfileCard[];
}

export async function nestSubmitCompanyClaim(body: {
  slug?: string;
  companyId?: string;
  ico: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
}): Promise<{ id: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string };
}

export async function nestAdminCompanyDirectoryDashboard(
  token: string,
): Promise<Record<string, number> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/dashboard`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, number>;
}

export async function nestAdminCompanyImportStart(
  token: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminCompanyImportJobs(
  token: string,
): Promise<Array<Record<string, unknown>> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/jobs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function nestAdminCompanyImportAction(
  token: string,
  jobId: string,
  action: 'pause' | 'resume' | 'stop',
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/jobs/${encodeURIComponent(jobId)}/${action}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminCompanyDirectoryMetrics(
  token: string,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/metrics`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminCompanyClaims(
  token: string,
): Promise<Array<Record<string, unknown>> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/claims`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function nestAdminReviewCompanyClaim(
  token: string,
  claimId: string,
  action: 'approve' | 'reject',
  adminNote?: string,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/claims/${encodeURIComponent(claimId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action, adminNote }),
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}
