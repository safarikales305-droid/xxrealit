import { API_BASE_URL } from './api';

function nestAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export type HotelbedsContentDiagnostics = {
  bookingApiOk: boolean;
  contentApiOk: boolean;
  contentApiPermissionDenied: boolean;
  imagesOk: boolean;
  lastContentRequest: {
    endpoint: string;
    status: number;
    responseTimeMs: number;
    error?: string;
    at: string;
  } | null;
  lastSuccessfulContentRequest?: {
    endpoint: string;
    status: number;
    at: string;
    hotelIds: number[];
    imagesCount: number;
  } | null;
  lastFailedContentRequest?: {
    endpoint: string;
    status: number;
    at: string;
    errorCode?: string;
    errorMessage?: string;
  } | null;
  imageSourceCounts?: {
    contentApi: number;
    cache: number;
    database: number;
    fallback: number;
    none: number;
  };
};

export type HotelbedsContentHistoryRow = {
  at: string;
  hotelIds: number[];
  endpoint: string;
  httpStatus: number;
  imagesCount: number;
  source: string;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
};

export type HotelbedsDiagnosticsOverview = {
  bookingApi: { status: string; httpStatus: number | null };
  contentApi: { status: string; permissionDenied: boolean };
  lastSuccessfulContentRequest: HotelbedsContentDiagnostics['lastSuccessfulContentRequest'];
  lastFailedContentRequest: HotelbedsContentDiagnostics['lastFailedContentRequest'];
  imageSourceCounts: NonNullable<HotelbedsContentDiagnostics['imageSourceCounts']>;
  hotelsWithPhoto: {
    fromContentApi: number;
    fromCache: number;
    fromDatabase: number;
    fallback: number;
    withoutPhoto: number;
  };
  database: { available: boolean; note: string };
  contentHistory: HotelbedsContentHistoryRow[];
  cache: HotelbedsCacheInspection;
};

export type HotelbedsCacheInspection = {
  totalEntries: number;
  contentEntries: number;
  contentMetaEntries: number;
  imageEntries: number;
  searchEntries: number;
  availEntries: number;
  otherEntries: number;
  expiredEntries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  defaultContentTtlHours: number;
  keys: string[];
};

export type HotelbedsHotelDiagnosis = {
  hotelId: number;
  name: string | null;
  bookingApi: { httpStatus: number; ok: boolean; error: string | null };
  contentApi: {
    httpStatus: number;
    ok: boolean;
    permissionDenied: boolean;
    error: string | null;
    endpoint: string;
  };
  cache: {
    hit: boolean;
    contentKey: string;
    imagesInCache: number;
    meta: { fetchedAt: string; source: string; imagesCount: number; hotelCode: number } | null;
    entry: { createdAt: string; expiresAt: string; expired: boolean; ttlMs: number } | null;
  };
  database: {
    found: boolean;
    hasContent: boolean;
    imagesCount: number;
    descriptionLength: number;
    lastSyncedAt: string | null;
    provider: string;
    sourceEnvironment: string;
    note: string;
  };
  currentImageSource: string;
  lastSuccessfulContentFetch: string | null;
  images: Array<{
    rawPath: string | null;
    assembledUrl: string | null;
    httpStatus: number | null;
    imageTypeCode: string | null;
    source: string;
  }>;
  debugSource: {
    contentSource: string;
    imageSource: string;
    contentApiStatus: number | null;
    contentFetchedAt: string | null;
    cacheHit: boolean;
    dbHit: boolean;
    fallbackUsed: boolean;
  };
  conclusionHints: string[];
};

export type HotelbedsPublicHotelsDiagnosis = {
  testedAt: string;
  note: string;
  hotels: Array<{ label: string; error?: string } & Partial<HotelbedsHotelDiagnosis>>;
};

export type HotelbedsIntegrationStatus = {
  provider: string;
  environment: string;
  configured: boolean;
  apiKeyMasked: string | null;
  apiSecretMasked: string;
  bookingBaseUrl: string;
  contentBaseUrl: string;
  bookingEnabled: boolean;
  publicListings?: boolean;
  contentDiagnostics?: HotelbedsContentDiagnostics;
  metrics?: {
    requestsToday: number;
    errorsToday: number;
    cacheHitRate: number;
    lastSearch: { at: string; destination: string; total: number } | null;
    lastContentSync: { at: string; hotels: number } | null;
    contentDiagnostics?: HotelbedsContentDiagnostics;
  };
};

export type HotelbedsTestResult = {
  success: boolean;
  provider: string;
  environment: string;
  status: number;
  responseTimeMs: number;
  message: string;
  errorCode?: string;
};

export type HotelbedsTestSearchResult = HotelbedsTestResult & {
  hotelsFound?: number;
  sample?: Array<{ code?: string; name?: string; categoryCode?: string }>;
};

export type HotelbedsTestContentResult = {
  success: boolean;
  permissionDenied?: boolean;
  hotelCode: number;
  httpStatus: number;
  name: string | null;
  descriptionExists: boolean;
  imagesCount: number;
  facilitiesCount: number;
  category: string | null;
  language: string | null;
  addressExists: boolean;
  coordinatesExist: boolean;
  error?: string;
};

export type HotelbedsApiLogEntry = {
  id: string;
  at: string;
  method: string;
  endpoint: string;
  status: number;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  errorBody?: string;
  requestParams?: string;
  cached?: boolean;
};

export async function nestAdminHotelbedsStatus(
  token: string,
): Promise<HotelbedsIntegrationStatus | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/status`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsIntegrationStatus;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsTestConnection(
  token: string,
): Promise<HotelbedsTestResult | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/test`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    return (await res.json()) as HotelbedsTestResult;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsTestSearch(
  token: string,
): Promise<HotelbedsTestSearchResult | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/test-search`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    return (await res.json()) as HotelbedsTestSearchResult;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsClearCache(
  token: string,
): Promise<{ success: boolean; removed: number } | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/cache/clear`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; removed: number };
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsLogs(
  token: string,
  limit = 50,
): Promise<{ logs: HotelbedsApiLogEntry[] } | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/logs?limit=${limit}`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { logs: HotelbedsApiLogEntry[] };
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsLogDetail(
  token: string,
  id: string,
): Promise<{ log: HotelbedsApiLogEntry | null } | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/logs/${encodeURIComponent(id)}`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { log: HotelbedsApiLogEntry | null };
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsDiagnostics(
  token: string,
): Promise<HotelbedsDiagnosticsOverview | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/diagnostics`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsDiagnosticsOverview;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsCacheInspector(
  token: string,
): Promise<HotelbedsCacheInspection | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/cache`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsCacheInspection;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsDiagnoseHotel(
  token: string,
  hotelCode = 6741,
): Promise<HotelbedsHotelDiagnosis | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/integrations/hotelbeds/diagnose-hotel?hotelCode=${hotelCode}`,
      {
        method: 'POST',
        headers: nestAuthHeaders(token),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsHotelDiagnosis;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsDiagnosePublicHotels(
  token: string,
): Promise<HotelbedsPublicHotelsDiagnosis | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/integrations/hotelbeds/diagnose-public-hotels`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsPublicHotelsDiagnosis;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsTestContent(
  token: string,
  hotelCode = 6741,
): Promise<HotelbedsTestContentResult | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/integrations/hotelbeds/test-content?hotelCode=${hotelCode}`,
      {
        method: 'POST',
        headers: nestAuthHeaders(token),
      },
    );
    return (await res.json()) as HotelbedsTestContentResult;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsRawContent(
  token: string,
  hotelCode = 6741,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/integrations/hotelbeds/raw-content?hotelCode=${hotelCode}`,
      { headers: nestAuthHeaders(token), cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsSyncContent(
  token: string,
  destination = 'Praha',
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/integrations/hotelbeds/sync-content?destination=${encodeURIComponent(destination)}`,
      { method: 'POST', headers: nestAuthHeaders(token) },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function nestAdminHotelbedsSyncHotel(
  token: string,
  hotelCode = 6741,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/integrations/hotelbeds/sync-hotel?hotelCode=${hotelCode}`,
      { method: 'POST', headers: nestAuthHeaders(token) },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
