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
