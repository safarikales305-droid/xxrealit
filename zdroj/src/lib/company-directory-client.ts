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
  googleRating?: number | null;
  googleReviewCount?: number | null;
  xxrealitRating?: number | null;
  xxrealitReviewCount?: number | null;
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

export type PublicProfileDirectoryItem = {
  type: 'USER' | 'COMPANY';
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  logoUrl: string | null;
  category: string;
  categoryLabel: string;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviewCount: number | null;
  verified: boolean;
  claimed: boolean;
  source: string;
  profileUrl: string;
  badges: string[];
  active: boolean;
  postCount?: number;
};

export type PublicProfileDirectoryResponse = {
  items: PublicProfileDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalPublicProfiles: number;
    companies: number;
    professionals: number;
    publicUsers: number;
    categories: number;
    regions: number;
  };
};

export async function nestListPublicProfileDirectory(
  query?: Record<string, string | number | undefined>,
): Promise<PublicProfileDirectoryResponse | null> {
  if (!API_BASE_URL) return null;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).length > 0) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/company-directory/public/directory${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfileDirectoryResponse;
}

export async function nestPublicProfileDirectoryStats(): Promise<
  PublicProfileDirectoryResponse['stats'] | null
> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/directory/stats`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfileDirectoryResponse['stats'];
}

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
    googlePlaceId?: string | null;
    googleMatchStatus?: string | null;
    googleMapsUri?: string | null;
    googleLastSyncAt?: string | null;
    xxrealitRatingAverage?: number | null;
    xxrealitReviewCount?: number | null;
  };
  similar: CompanyDirectoryCard[];
  xxrealitReviewSummary?: { average: number | null; count: number };
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googleMapsUri?: string | null;
};

export type ImportJobView = {
  id: string;
  status: string;
  category?: string | null;
  region?: string | null;
  city?: string | null;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped?: number;
  progressPercent: number;
  progressLabel: string;
  etaSeconds?: number | null;
  requestsCount?: number;
  totalExpected?: number | null;
  totalFound?: number | null;
  lastActivityAt?: string | null;
  startedAt?: string | null;
  error?: string | null;
  currentCompanyName?: string | null;
  currentBatchFrom?: number | null;
  currentBatchTo?: number | null;
  subQueryIndex?: number | null;
  subQueryCount?: number | null;
  currentPartitionLabel?: string | null;
  regionsCompleted?: number | null;
  regionsTotal?: number | null;
  rawResults?: number | null;
  duplicatesSkipped?: number | null;
  importPhase?: string | null;
  importLimit?: number | null;
  needsResplit?: boolean;
};

export type AdminCompanyRow = CompanyDirectoryCard & {
  companyStatus?: string | null;
  googleMatchStatus?: string | null;
  verifiedBusinessEmail?: string | null;
  xxrealitRatingAverage?: number | null;
  xxrealitReviewCount?: number | null;
  aresLastSyncAt?: string | null;
  updatedAt?: string;
  contactDiscoveryState?: string | null;
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
  action: 'pause' | 'resume' | 'stop' | 'resplit',
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

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function nestAdminCompanyImportJob(
  token: string,
  jobId: string,
): Promise<ImportJobView | null> {
  return adminFetch<ImportJobView>(token, `/import/jobs/${encodeURIComponent(jobId)}`);
}

export async function nestAdminCompanyImportJobItems(
  token: string,
  jobId: string,
): Promise<Array<Record<string, unknown>> | null> {
  return adminFetch<Array<Record<string, unknown>>>(
    token,
    `/import/jobs/${encodeURIComponent(jobId)}/items`,
  );
}

export async function nestAdminListCompanies(
  token: string,
  query?: Record<string, string | number | undefined>,
): Promise<{ items: AdminCompanyRow[]; total: number; page: number; pageSize: number } | null> {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).length > 0) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return adminFetch(token, `/companies${qs ? `?${qs}` : ''}`);
}

export async function nestAdminGetCompany(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}`);
}

export async function nestAdminMatchGoogle(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/google/match`, {
    method: 'POST',
  });
}

export async function nestAdminDiscoverContact(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/contact/discover`, {
    method: 'POST',
  });
}

export async function nestAdminGetContactDetail(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/contact`);
}

export async function nestAdminConfirmContact(
  token: string,
  contactId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/contacts/${encodeURIComponent(contactId)}/confirm`, {
    method: 'PATCH',
  });
}

export async function nestAdminRejectContact(
  token: string,
  contactId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/contacts/${encodeURIComponent(contactId)}/reject`, {
    method: 'PATCH',
  });
}

export async function nestAdminStartContactDiscoveryBatch(
  token: string,
  body: {
    companyIds?: string[];
    limit?: number;
    label?: string;
    force?: boolean;
    filter?: { category?: string; region?: string; city?: string; q?: string };
  },
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, '/contact/batches/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function nestAdminListContactDiscoveryBatches(
  token: string,
): Promise<Array<Record<string, unknown>> | null> {
  return adminFetch(token, '/contact/batches');
}

export async function nestAdminGetContactDiscoveryBatch(
  token: string,
  batchId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/contact/batches/${encodeURIComponent(batchId)}`);
}

export async function nestAdminContactDiscoveryBatchAction(
  token: string,
  batchId: string,
  action: 'pause' | 'resume' | 'stop',
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/contact/batches/${encodeURIComponent(batchId)}/${action}`, {
    method: 'POST',
  });
}

export function contactDiscoveryStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'QUEUED':
      return 'Ve frontě';
    case 'SEARCHING':
      return 'Hledám';
    case 'FOUND':
      return 'Nalezeno';
    case 'REVIEW_REQUIRED':
      return 'Ke kontrole';
    case 'VERIFIED':
      return 'Ověřeno';
    case 'NOT_FOUND':
      return 'Nenalezeno';
    case 'FAILED':
      return 'Chyba';
    default:
      return 'Nehledáno';
  }
}

export async function nestAdminStartCampaign(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/campaign/start`, {
    method: 'POST',
  });
}

export async function nestAdminGetCampaign(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/campaign`);
}

export async function nestAdminCampaignAction(
  token: string,
  companyId: string,
  action: 'pause' | 'resume' | 'stop',
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/campaign/${action}`, {
    method: 'POST',
  });
}

export async function nestAdminBulkStartCampaign(
  token: string,
  companyIds: string[],
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, '/campaigns/bulk-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds }),
  });
}

export async function nestAdminEngagementDashboard(
  token: string,
): Promise<Record<string, number> | null> {
  return adminFetch(token, '/engagement/dashboard');
}

export async function nestTrackCompanyEvent(body: {
  companyId: string;
  type: string;
  sessionId?: string;
  userId?: string;
}): Promise<unknown> {
  if (!API_BASE_URL) return null;
  await fetch(`${API_BASE_URL}/company-directory/public/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function nestSubmitCompanyLead(body: {
  companyId: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  consent: boolean;
  userId?: string;
}): Promise<{ id?: string; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) return { error: (data as { message?: string }).message ?? 'Odeslání selhalo.' };
  return data;
}

export async function nestCompanyUnsubscribe(token: string): Promise<{ ok?: boolean; companyName?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { ok?: boolean; companyName?: string };
}

export async function nestAdminSendCompanyEmail(
  token: string,
  companyId: string,
  body: { recipient: string; subject: string; template?: string; body: string },
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function nestGetCompanyReviews(
  slug: string,
): Promise<{
  summary: { average: number | null; count: number };
  items: Array<Record<string, unknown>>;
} | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/company-directory/public/${encodeURIComponent(slug)}/reviews`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    summary: { average: number | null; count: number };
    items: Array<Record<string, unknown>>;
  };
}

export async function nestSubmitCompanyReview(body: {
  companyId?: string;
  companySlug?: string;
  rating: number;
  sentiment?: string;
  title?: string;
  body: string;
  authorEmail: string;
  authorDisplayName?: string;
  authorPhone?: string;
  submittedBusinessEmail?: string;
  confirmedExperience: boolean;
  media?: Array<{ type: 'IMAGE' | 'VIDEO'; url: string; thumbnailUrl?: string; mimeType?: string }>;
}): Promise<{ reviewId?: string; message?: string; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { reviewId?: string; message?: string; error?: string };
  if (!res.ok) return { error: data.error ?? 'Odeslání recenze selhalo.' };
  return data;
}

export async function nestVerifyCompanyReview(
  token: string,
): Promise<{ ok?: boolean; reviewId?: string; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/reviews/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json()) as { ok?: boolean; reviewId?: string; message?: string };
  if (!res.ok) return { error: (data as { message?: string }).message ?? 'Ověření selhalo.' };
  return data;
}

export async function nestAdminListReviews(
  token: string,
  status?: string,
): Promise<Array<Record<string, unknown>> | null> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminFetch(token, `/reviews${qs}`);
}

export async function nestAdminDeleteReviewMedia(
  token: string,
  mediaId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/reviews/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' });
}
