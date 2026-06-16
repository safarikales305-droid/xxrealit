import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders, nestApiErrorBodyMessage } from '@/lib/nest-client';

export type WhatsAppMessageRow = {
  id: string;
  phone: string;
  recipientName: string | null;
  message: string;
  status: string;
  direction: string;
  listingId: string | null;
  listingTitle: string | null;
  createdAt: string;
  delivered: boolean;
};

export type CrmContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  listingId: string | null;
  notes: string | null;
  tags: string[];
  reminderAt: string | null;
  lastContactAt: string | null;
  createdAt: string;
  listing: { id: string; title: string; city: string | null } | null;
};

export type MarketingCampaignRow = {
  id: string;
  title: string;
  body: string;
  channel: string;
  audience: string;
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
};

export type EmailLogRow = {
  id: string;
  to: string;
  subject: string;
  status: string;
  delivered: boolean;
  createdAt: string;
};

export type ActivityLogRow = {
  id: string;
  category: string;
  message: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
};

export async function nestCommunicationWhatsAppMessages(
  token: string,
  params?: { listingId?: string; contactPhone?: string },
): Promise<WhatsAppMessageRow[]> {
  if (!API_BASE_URL) return [];
  const q = new URLSearchParams();
  if (params?.listingId) q.set('listingId', params.listingId);
  if (params?.contactPhone) q.set('contactPhone', params.contactPhone);
  const res = await fetch(`${API_BASE_URL}/communication/whatsapp/messages?${q}`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as WhatsAppMessageRow[];
}

export async function nestCommunicationWhatsAppSend(
  token: string,
  body: { toPhone: string; message: string; recipientName?: string; listingId?: string },
): Promise<{ ok: true; waUrl?: string } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/whatsapp/send`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, waUrl: typeof data.waUrl === 'string' ? data.waUrl : undefined };
}

export async function nestCommunicationWhatsAppListingLeads(
  token: string,
  body: { listingId: string; message: string },
): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/whatsapp/send-listing-leads`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    sent: typeof data.sent === 'number' ? data.sent : 0,
    failed: typeof data.failed === 'number' ? data.failed : 0,
  };
}

export async function nestCommunicationEmailLogs(token: string): Promise<EmailLogRow[]> {
  if (!API_BASE_URL) return [];
  const res = await fetch(`${API_BASE_URL}/communication/emails/logs`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as EmailLogRow[];
}

export async function nestCommunicationEmailSend(
  token: string,
  body: { to: string; subject: string; body: string; recipientName?: string; listingId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/emails/send`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestCommunicationContacts(
  token: string,
  params?: { listingId?: string; search?: string },
): Promise<CrmContactRow[]> {
  if (!API_BASE_URL) return [];
  const q = new URLSearchParams();
  if (params?.listingId) q.set('listingId', params.listingId);
  if (params?.search) q.set('search', params.search);
  const res = await fetch(`${API_BASE_URL}/communication/contacts?${q}`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as CrmContactRow[];
}

export async function nestCommunicationCreateContact(
  token: string,
  body: Partial<CrmContactRow> & { name: string },
): Promise<{ ok: true; contact: CrmContactRow } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/contacts`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CrmContactRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, contact: data };
}

export async function nestCommunicationCampaigns(token: string): Promise<MarketingCampaignRow[]> {
  if (!API_BASE_URL) return [];
  const res = await fetch(`${API_BASE_URL}/communication/campaigns`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as MarketingCampaignRow[];
}

export async function nestCommunicationCreateCampaign(
  token: string,
  body: {
    title: string;
    body: string;
    channel: string;
    audience: string;
    audienceRegion?: string;
    audienceCity?: string;
  },
): Promise<{ ok: true; campaign: MarketingCampaignRow } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/campaigns`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as MarketingCampaignRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, campaign: data };
}

export async function nestCommunicationSendCampaign(
  token: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  const res = await fetch(`${API_BASE_URL}/communication/campaigns/${id}/send`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminActivityLogs(
  token: string,
  params?: { category?: string; limit?: number },
): Promise<{ total: number; items: ActivityLogRow[] }> {
  if (!API_BASE_URL) return { total: 0, items: [] };
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.limit) q.set('limit', String(params.limit));
  const res = await fetch(`${API_BASE_URL}/communication/admin/activity-logs?${q}`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return { total: 0, items: [] };
  return (await res.json()) as { total: number; items: ActivityLogRow[] };
}

export function communicationContactsExportUrl(): string {
  return `${API_BASE_URL}/communication/contacts/export`;
}
