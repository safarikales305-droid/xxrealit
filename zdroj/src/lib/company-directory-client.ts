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
  googleMapsUri?: string | null;
};

export type CompanySourcedField<T = string> = {
  value: T;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: number | null;
  lastVerifiedAt?: string | null;
};

/** JSON payload from AI enrichment (`CompanyDirectoryEntry.enrichmentData`). */
export type CompanyEnrichmentData = {
  services?: CompanySourcedField[];
  specializations?: CompanySourcedField[];
  products?: CompanySourcedField[];
  serviceAreas?: CompanySourcedField[];
  certifications?: CompanySourcedField[];
  brands?: CompanySourcedField[];
  keywords?: CompanySourcedField[];
  socialLinks?: CompanySourcedField[];
  yearsOnMarket?: CompanySourcedField<number>;
  targetCustomers?: CompanySourcedField[];
  phone?: CompanySourcedField | null;
  website?: CompanySourcedField | null;
  email?: CompanySourcedField | null;
};

export type CompanyDirectorySeoMeta = {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  keywords: string[];
  seoQualityScore: number | null;
  seoStatus: string;
  indexStatus: string;
  indexable?: boolean;
  h1?: string;
  breadcrumbs?: Array<{ name: string; href: string }>;
  jsonLd: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

/** Public company detail — matches `serializeCompanyDirectoryDetail()` output. */
export type CompanyDirectoryDetail = CompanyDirectoryCard & {
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
  googleMatchScore?: number | null;
  googleLastSyncAt?: string | null;
  xxrealitRatingAverage?: number | null;
  xxrealitReviewCount?: number | null;
  verifiedBusinessEmail?: string | null;
  discoveredEmail?: string | null;
  emailSourceUrl?: string | null;
  emailConfidence?: number | null;
  websiteSource?: string | null;
  websiteConfidence?: number | null;
  websiteVerifiedAt?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  enrichmentStatus?: string | null;
  enrichmentData?: CompanyEnrichmentData | null;
  contentEnrichedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[];
  seoQualityScore?: number | null;
  seoStatus?: string | null;
  indexStatus?: string | null;
  socialIntroPublishedAt?: string | null;
  aiSummary?: string | null;
  aiPositiveSummary?: string | null;
  aiNegativeSummary?: string | null;
  claimedAt?: string | null;
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

export type CompanySeoPagePublic = {
  id: string;
  status: string;
  indexable: boolean;
  seoScore: number;
  title: string;
  metaDescription: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  content?: unknown;
  updatedAt: string;
};

export type CompanyDirectoryDetailResponse = {
  company: CompanyDirectoryDetail;
  seo?: CompanyDirectorySeoMeta;
  redirectTo?: string | null;
  companySeoPage?: CompanySeoPagePublic | null;
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
  currentRegion?: string | null;
  currentRegionOrder?: number | null;
  uniqueIcoCount?: number | null;
  jobUniqueIcoCount?: number | null;
  alreadySeenSkipped?: number | null;
  inactiveSkipped?: number | null;
  duplicateQueryCount?: number | null;
  warningCode?: string | null;
  syncType?: string | null;
  currentRequestRows?: number | null;
  aresDiagnostics?: Array<{
    at: string;
    partitionLabel: string;
    offset: number;
    pocetCelkem: number | null;
    returnedCount: number;
    createdInBatch: number;
    existingInBatch: number;
    httpStatus: number;
    durationMs: number;
    duplicateResultSet: boolean;
    requestBody: Record<string, unknown>;
  }>;
  rawResults?: number | null;
  duplicatesSkipped?: number | null;
  importPhase?: string | null;
  importLimit?: number | null;
  needsResplit?: boolean;
  completedPartitions?: number;
  totalPartitions?: number;
  currentPartitionProcessed?: number;
  currentPartitionTotal?: number | null;
  currentPartitionPercent?: number;
  partitionProgress?: {
    overallPercent: number;
    overallLabel: string;
    partitionPercent: number;
    partitionLabel: string;
    completedPartitions: number;
    totalPartitions: number;
  };
  auditLog?: Array<{ at: string; message: string }>;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  heartbeatAt?: string | null;
  finishedAt?: string | null;
  partitionStats?: {
    total: number;
    completed: number;
    pending: number;
    running: number;
    failed: number;
  };
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

export async function nestAdminCompanyImportMasterSync(
  token: string,
  body?: { batchSize?: number; delayMs?: number; limit?: number },
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number; activeJobId?: string }
> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'API není nakonfigurováno.', status: 0 };
  }
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/master-sync/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      `HTTP ${res.status}`;
    return { ok: false, error: message, status: res.status };
  }
  return { ok: true, data: payload };
}

export async function nestAdminAresRawTest(
  token: string,
  body: { locality?: string; nace?: string; ico?: string; limit?: number },
) {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/diagnostics/raw-test`, {
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

export async function nestAdminAresSplitPreview(
  token: string,
  body: { locality?: string; nace?: string; ico?: string },
) {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/diagnostics/raw-test/split-preview`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminAresWorkerDiagnostics(token: string) {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/diagnostics/worker`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminCompanyImportMiniMasterSync(token: string) {
  if (!API_BASE_URL) {
    return { ok: false as const, error: 'API není nakonfigurováno.', status: 0 };
  }
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/master-sync/mini-start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false as const,
      error: (typeof payload.message === 'string' && payload.message) || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true as const, data: payload };
}

export async function nestAdminProcessOnePartition(token: string, jobId?: string) {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/diagnostics/process-one-partition`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(jobId ? { jobId } : {}),
    },
  );
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function nestAdminRequeueImportJob(token: string, jobId: string) {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/jobs/${encodeURIComponent(jobId)}/requeue`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as ImportJobView;
}

export async function nestAdminCompanyImportStart(
  token: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number; activeJobId?: string }
> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'API není nakonfigurováno.', status: 0 };
  }
  const res = await fetch(`${API_BASE_URL}/admin/company-directory/import/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const nested =
      payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
        ? (payload.message as Record<string, unknown>)
        : null;
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof nested?.message === 'string' && nested.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      (Array.isArray(payload.message)
        ? (payload.message as string[]).join(', ')
        : null) ||
      `HTTP ${res.status}`;
    return {
      ok: false,
      error: message,
      status: res.status,
      activeJobId:
        typeof nested?.activeJobId === 'string'
          ? nested.activeJobId
          : typeof payload.activeJobId === 'string'
            ? payload.activeJobId
            : undefined,
    };
  }
  return { ok: true, data: payload };
}

export async function nestAdminCompanyImportRetry(
  token: string,
  jobId: string,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number; activeJobId?: string }
> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'API není nakonfigurováno.', status: 0 };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/jobs/${encodeURIComponent(jobId)}/retry`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const nested =
      payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
        ? (payload.message as Record<string, unknown>)
        : null;
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof nested?.message === 'string' && nested.message) ||
      `HTTP ${res.status}`;
    return {
      ok: false,
      error: message,
      status: res.status,
      activeJobId: typeof nested?.activeJobId === 'string' ? nested.activeJobId : undefined,
    };
  }
  return { ok: true, data: payload };
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

export async function nestAdminCompanyImportTestPartition(
  token: string,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/company-directory/import/jobs/${encodeURIComponent(jobId)}/test-partition`,
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
  options?: { forcePrimaryEmail?: boolean },
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
      body: JSON.stringify({ action, adminNote, forcePrimaryEmail: options?.forcePrimaryEmail }),
    },
  );
  const data = (await res.json()) as Record<string, unknown> & { message?: string };
  if (!res.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : `Schválení selhalo (${res.status})`);
  }
  return data;
}

export type AdminFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string; code?: string };

async function adminFetchResult<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<AdminFetchResult<T>> {
  if (!API_BASE_URL) {
    return { ok: false, status: 0, message: 'API není nakonfigurováno.' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/company-directory${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const rawMessage = payload?.message;
    const message =
      (typeof rawMessage === 'string' && rawMessage) ||
      (Array.isArray(rawMessage) && rawMessage.map(String).join(', ')) ||
      (typeof payload?.error === 'string' && payload.error) ||
      `HTTP ${res.status}`;
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    return { ok: false, status: res.status, message, code };
  }
  return { ok: true, data: (payload ?? {}) as T, status: res.status };
}

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE_URL}/admin/company-directory${path}`, {
    ...init,
    headers,
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

export type ContactDiscoveryEnqueueResponse = {
  jobId: string | null;
  itemId: string | null;
  companyId: string;
  status: string;
  email?: string | null;
  sourceUrl?: string | null;
  confidence?: number | null;
};

export async function nestAdminDiscoverContact(
  token: string,
  companyId: string,
  options?: { force?: boolean },
): Promise<AdminFetchResult<ContactDiscoveryEnqueueResponse>> {
  return adminFetchResult<ContactDiscoveryEnqueueResponse>(
    token,
    `/companies/${encodeURIComponent(companyId)}/contact/discover`,
    {
      method: 'POST',
      body: JSON.stringify({ force: options?.force ?? false }),
    },
  );
}

export async function nestAdminGetContactDiscoveryItem(
  token: string,
  itemId: string,
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult(token, `/contact/discovery/${encodeURIComponent(itemId)}`);
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

export type ContactDiscoveryBatchResponse = {
  id: string;
  jobId: string;
  status: string;
  total: number;
  totalExpected?: number | null;
  processed?: number;
  found?: number;
  notFound?: number;
  needsReview?: number;
  failed?: number;
  queued?: number;
  currentCompanyName?: string | null;
  progressPercent?: number;
  progressLabel?: string;
};

export async function nestAdminStartContactDiscoveryBatch(
  token: string,
  body: {
    companyIds?: string[];
    limit?: number;
    label?: string;
    force?: boolean;
    filter?: {
      category?: string;
      region?: string;
      city?: string;
      q?: string;
      ico?: string;
      verified?: string;
      active?: string;
      minRating?: string;
      hasGoogle?: string;
      hasEmail?: string;
      claimed?: string;
      hasReviews?: string;
      noReviews?: string;
      contactDiscoveryState?: string;
    };
  },
): Promise<AdminFetchResult<ContactDiscoveryBatchResponse>> {
  return adminFetchResult<ContactDiscoveryBatchResponse>(token, '/contact/batches/start', {
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
      return '⏳ Ve frontě';
    case 'SEARCHING':
      return '🔵 Hledám';
    case 'FOUND':
      return 'Nalezeno';
    case 'REVIEW_REQUIRED':
      return '⚠ Ke kontrole';
    case 'VERIFIED':
      return '✓ Ověřeno';
    case 'NOT_FOUND':
      return 'Nenalezeno';
    case 'FAILED':
      return 'Chyba';
    default:
      return 'Nehledáno';
  }
}

export function contactDiscoveryEmailCell(
  email: string | null | undefined,
  state: string | null | undefined,
): string {
  if (email?.trim()) {
    if (state === 'REVIEW_REQUIRED') return `${email}\n⚠ Ke kontrole`;
    if (state === 'VERIFIED') return `${email}\n✓ Ověřeno`;
    return email;
  }
  return contactDiscoveryStateLabel(state);
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

export async function nestSearchCompaniesForReview(
  query: string,
): Promise<{ items: Array<Record<string, unknown>> } | null> {
  if (!API_BASE_URL || query.trim().length < 2) return { items: [] };
  const res = await fetch(
    `${API_BASE_URL}/company-directory/public/companies/search?q=${encodeURIComponent(query)}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as { items: Array<Record<string, unknown>> };
}

export async function nestSearchAresCompaniesForReview(
  query: string,
): Promise<{ items: Array<Record<string, unknown>>; total?: number } | null> {
  if (!API_BASE_URL || query.trim().length < 3) return { items: [] };
  const res = await fetch(`${API_BASE_URL}/company-directory/public/companies/ares-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ q: query }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { items: Array<Record<string, unknown>>; total?: number };
}

export async function nestImportCompanyFromAres(
  ico: string,
): Promise<{ company?: Record<string, unknown>; message?: string; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/companies/from-ares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ico }),
  });
  const data = (await res.json()) as {
    company?: Record<string, unknown>;
    message?: string;
    error?: string;
  };
  if (!res.ok) return { error: (data as { message?: string }).message ?? 'Import z ARES selhal.' };
  return data;
}

export type CompanyReviewSubmitResponse = {
  reviewId?: string;
  status?: string;
  message?: string;
  emailVerificationRequired?: boolean;
  emailSent?: boolean;
  error?: string;
  code?: string;
};

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
}): Promise<CompanyReviewSubmitResponse> {
  if (!API_BASE_URL) {
    return { error: 'API není nakonfigurováno.', code: 'REVIEW_CREATE_FAILED' };
  }
  const res = await fetch(`${API_BASE_URL}/company-directory/public/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const rawMessage = data.message;
    let message: string;
    let code = typeof data.code === 'string' ? data.code : 'REVIEW_CREATE_FAILED';
    if (typeof rawMessage === 'string') {
      message = rawMessage;
    } else if (Array.isArray(rawMessage)) {
      message = rawMessage.map(String).join(', ');
    } else if (rawMessage && typeof rawMessage === 'object') {
      const nested = rawMessage as Record<string, unknown>;
      if (typeof nested.message === 'string') message = nested.message;
      else message = 'Odeslání recenze selhalo.';
      if (typeof nested.code === 'string') code = nested.code;
    } else if (typeof data.error === 'string') {
      message = data.error;
    } else {
      message =
        res.status >= 500
          ? 'Recenzi se nepodařilo odeslat. Zkuste to prosím znovu.'
          : 'Odeslání recenze selhalo.';
    }
    return { error: message, code };
  }
  return {
    reviewId: typeof data.reviewId === 'string' ? data.reviewId : undefined,
    status: typeof data.status === 'string' ? data.status : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    emailVerificationRequired: data.emailVerificationRequired === true,
    emailSent: data.emailSent === true,
  };
}

export async function nestVerifyCompanyReview(
  token: string,
): Promise<{ ok?: boolean; reviewId?: string; slug?: string | null; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/public/reviews/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json()) as { ok?: boolean; reviewId?: string; slug?: string | null; message?: string };
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

export async function nestAdminGetReviewDetail(
  token: string,
  reviewId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/reviews/${encodeURIComponent(reviewId)}`);
}

export async function nestAdminResendCompanyReviewNotification(
  token: string,
  reviewId: string,
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult(token, `/reviews/${encodeURIComponent(reviewId)}/resend-company-notification`, {
    method: 'POST',
  });
}

export async function nestAdminModerateReview(
  token: string,
  reviewId: string,
  action: 'approve' | 'reject' | 'hide' | 'remove' | 'reject_changes',
  note?: string,
  removalReason?: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/reviews/${encodeURIComponent(reviewId)}/moderate`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note, removalReason }),
  });
}

export async function nestAdminModerateReviewResult(
  token: string,
  reviewId: string,
  action: 'approve' | 'reject' | 'hide' | 'remove' | 'reject_changes',
  note?: string,
  removalReason?: string,
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult(token, `/reviews/${encodeURIComponent(reviewId)}/moderate`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note, removalReason }),
  });
}

export async function nestAdminUpdateReview(
  token: string,
  reviewId: string,
  body: {
    rating?: number;
    sentiment?: string;
    title?: string;
    body?: string;
    keepPublished?: boolean;
  },
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult(token, `/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function nestAdminDeleteReviewMedia(
  token: string,
  mediaId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/reviews/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' });
}

export type MyCompanyReviewRow = {
  id: string;
  company: { id: string; name: string; slug: string };
  rating: number;
  sentiment: string;
  title: string;
  body: string;
  bodyPreview: string;
  status: string;
  statusLabel: string;
  reviewNeedsModeration: boolean;
  editedByAuthor: boolean;
  editedAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  mediaCount: number;
  canEdit: boolean;
};

export async function nestListMyCompanyReviews(
  token: string,
): Promise<MyCompanyReviewRow[] | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/my/reviews`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as MyCompanyReviewRow[];
}

export async function nestUpdateMyCompanyReview(
  token: string,
  reviewId: string,
  body: {
    rating?: number;
    sentiment?: string;
    title?: string;
    body?: string;
    removeMediaIds?: string[];
  },
): Promise<{ ok?: boolean; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/my/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok) return { error: data.message ?? 'Uložení selhalo.' };
  return data;
}

export async function nestRemoveMyCompanyReview(
  token: string,
  reviewId: string,
  reason?: string,
): Promise<{ ok?: boolean; error?: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/company-directory/my/reviews/${encodeURIComponent(reviewId)}/remove`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });
  const data = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok) return { error: data.message ?? 'Odstranění selhalo.' };
  return data;
}

export type CompanyAutomationSettings = {
  seo: {
    aiEnrichmentEnabled: boolean;
    enrichAfterWebsiteFound: boolean;
    minScoreForIndex: number;
    refreshDays: number;
    addSeoReadyToSitemap: boolean;
    noindexWeakProfiles: boolean;
    generateJsonLd: boolean;
  };
  facebook: {
    autoPublishNewCompanies: boolean;
    postsPerDay: number;
    publishFromHour: number;
    publishToHour: number;
    onlyEnrichedCompanies: boolean;
    useProfileAsCta: boolean;
    headlineTemplate: string;
    textTemplate: string;
    ctaLabel: string;
  };
  email: {
    enrollOnContactFound: boolean;
    notifyOnNewReview: boolean;
    notifyReviewAuthor: boolean;
    notifyOnProfileInterest: boolean;
    profileViewThrottleDays: number;
    sequenceDelaysDays: number[];
    monthlyAfterSequence: boolean;
  };
  aresImport: {
    batchSize: number;
    delayMs: number;
    maxRetries: number;
    concurrency: number;
    autoContinue: boolean;
    saveCheckpoint: boolean;
    autoRecoverOnRestart: boolean;
    maintainRegistry: boolean;
    maintainInterval: 'daily' | 'weekly' | 'manual';
  };
};

export async function nestAdminGetAutomationSettings(
  token: string,
): Promise<CompanyAutomationSettings | null> {
  return adminFetch(token, '/settings/automation');
}

export async function nestAdminUpdateAutomationSettings(
  token: string,
  body: Partial<CompanyAutomationSettings>,
): Promise<CompanyAutomationSettings | null> {
  return adminFetch(token, '/settings/automation', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function nestAdminSeoStats(token: string): Promise<Record<string, number> | null> {
  return adminFetch(token, '/settings/seo/stats');
}

export async function nestAdminFacebookStats(
  token: string,
): Promise<Record<string, number | string | boolean | null> | null> {
  return adminFetch(token, '/settings/facebook/stats');
}

export async function nestAdminSocialQueue(
  token: string,
  query?: { status?: string; page?: number },
): Promise<{ items: unknown[]; total: number } | null> {
  const qs = new URLSearchParams();
  if (query?.status) qs.set('status', query.status);
  if (query?.page) qs.set('page', String(query.page));
  const suffix = qs.toString() ? `?${qs}` : '';
  return adminFetch(token, `/social/queue${suffix}`);
}

export async function nestAdminRunCompanyEnrichment(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/enrichment/run`, {
    method: 'POST',
  });
}

export async function nestAdminSocialPreview(
  token: string,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return adminFetch(token, `/companies/${encodeURIComponent(companyId)}/social-preview`);
}
