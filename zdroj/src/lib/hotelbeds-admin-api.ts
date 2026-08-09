import { API_BASE_URL } from './api';

function nestAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export type HotelbedsIntegrationStatus = {
  provider: string;
  environment: string;
  configured: boolean;
  apiKeyMasked: string | null;
  apiSecretMasked: string;
  bookingBaseUrl: string;
  contentBaseUrl: string;
  bookingEnabled: boolean;
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
