import { API_BASE_URL } from '@/lib/api';

export type WhatsAppIntegrationSettings = {
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  testPhone: string;
  welcomeEnabled: boolean;
  welcomeTemplates: Record<string, string>;
  batchSize: number;
  batchDelayMs: number;
  accessTokenSet: boolean;
  webhookVerifyTokenSet: boolean;
};

export type WhatsAppAdminStats = {
  configured: boolean;
  enabled: boolean;
  missing: string[];
  webhookUri: string | null;
  apiVersion: string;
  messageCount: number;
  clickCount: number;
  recentErrors: Array<{
    id: string;
    message: string;
    toPhone: string;
    createdAt: string;
  }>;
};

export type WhatsAppCampaignType =
  | 'NEW_LISTINGS'
  | 'BONUS_CREDITS'
  | 'INTERESTING_TIPS'
  | 'PORTAL_INVITE'
  | 'AGENT_AD'
  | 'INVESTOR_PROMO'
  | 'CUSTOM';

export type WhatsAppCampaignRow = {
  id: string;
  name: string;
  campaignType: WhatsAppCampaignType;
  messageTemplate: string;
  waTemplateName: string;
  waMetaTemplateId: string | null;
  waTemplateLanguage: string;
  waTemplateVariables: string[];
  targetRoles: string[];
  targetRegions: string[];
  targetCities: string[];
  manualPhones: string[];
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  sentAt: string | null;
};

export const WHATSAPP_TEMPLATE_REQUIRED_MSG =
  'WhatsApp nepovoluje první marketingovou zprávu jako vlastní text. Vyberte schválenou šablonu zprávy.';

export const WHATSAPP_CAMPAIGN_TEMPLATE_HELP =
  'Vlastní text lze poslat jen jako odpověď do 24 hodin od poslední zprávy zákazníka. Kampaně musí používat schválené WhatsApp šablony.';

export type WhatsAppMetaTemplateRow = {
  id: string;
  metaTemplateId: string;
  templateName: string;
  category: string;
  language: string;
  status: string;
  bodyText: string;
  variablesCount: number;
  syncedAt: string;
};

export type WhatsAppTemplatesListResult = {
  templates: WhatsAppMetaTemplateRow[];
  lastSyncedAt: string | null;
};

export type WhatsAppTemplatesSyncResult = {
  ok: boolean;
  syncedCount: number;
  approvedCount: number;
  syncedAt: string;
  error?: string;
};

export const WHATSAPP_NO_APPROVED_TEMPLATES_MSG =
  'V Meta zatím není schválena žádná WhatsApp šablona.';

export type WhatsAppHistoryRow = {
  id: string;
  createdAt: string;
  recipientName: string | null;
  recipientPhone: string;
  campaignType: WhatsAppCampaignType | null;
  campaignName: string | null;
  status: string;
  errorMessage: string | null;
  providerMessageId: string | null;
  message: string;
  isWelcome: boolean;
  campaignId: string | null;
};

export type WhatsAppCampaignLogRow = {
  id: string;
  createdAt: string;
  recipientPhone: string;
  recipientName: string | null;
  message: string;
  status: string;
  errorMessage: string | null;
  providerMessageId: string | null;
  metaDebug: unknown;
};

export type WhatsAppCampaignRunResult = WhatsAppCampaignRow & {
  recipientPhones?: string[];
  phoneNumberId?: string;
  tokenSource?: string;
  errors?: string[];
};

export const WHATSAPP_CAMPAIGN_TYPE_LABELS: Record<WhatsAppCampaignType, string> = {
  NEW_LISTINGS: 'Nové inzeráty',
  BONUS_CREDITS: 'Bonusové kredity',
  INTERESTING_TIPS: 'Zajímavé tipy',
  PORTAL_INVITE: 'Pozvánka na portál',
  AGENT_AD: 'Reklama pro makléře',
  INVESTOR_PROMO: 'Akce pro investory',
  CUSTOM: 'Vlastní zpráva',
};

export const WHATSAPP_TARGET_ROLES = [
  { value: 'USER', label: 'Uživatel' },
  { value: 'AGENT', label: 'Makléř' },
  { value: 'COMPANY', label: 'Firma' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'FINANCIAL_ADVISOR', label: 'Finanční poradce' },
] as const;

export const CZECH_REGIONS = [
  'Praha',
  'Středočeský',
  'Jihočeský',
  'Plzeňský',
  'Karlovarský',
  'Ústecký',
  'Liberecký',
  'Královéhradecký',
  'Pardubický',
  'Vysočina',
  'Jihomoravský',
  'Olomoucký',
  'Zlínský',
  'Moravskoslezský',
] as const;

const WELCOME_ROLES = ['USER', 'AGENT', 'COMPANY', 'INVESTOR', 'FINANCIAL_ADVISOR', 'AGENCY'] as const;

export const WELCOME_ROLE_LABELS: Record<string, string> = {
  USER: 'Uživatel',
  AGENT: 'Makléř',
  COMPANY: 'Firma',
  INVESTOR: 'Investor',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  AGENCY: 'Realitní kancelář',
};

export type WhatsAppMetaError = {
  message: string;
  code?: number;
  type?: string;
};

export type WhatsAppLastLog = {
  id: string;
  createdAt: string;
  recipientPhone: string;
  recipientName: string | null;
  message: string;
  status: string;
  errorMessage: string | null;
  metaDebug: unknown;
  isWelcome: boolean;
  campaignName: string | null;
};

function parseNestWhatsAppError(
  data: unknown,
  status: number,
): WhatsAppMetaError {
  if (!data || typeof data !== 'object') {
    return { message: `HTTP ${status}` };
  }
  const root = data as Record<string, unknown>;
  const msg = root.message;

  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const o = msg as Record<string, unknown>;
    return {
      message: typeof o.message === 'string' ? o.message : `HTTP ${status}`,
      code: typeof o.code === 'number' ? o.code : undefined,
      type: typeof o.type === 'string' ? o.type : undefined,
    };
  }
  if (typeof msg === 'string') return { message: msg };
  if (Array.isArray(msg)) return { message: msg.map(String).join(', ') };
  if (typeof root.error === 'string') return { message: root.error };
  return { message: `HTTP ${status}` };
}

export function formatWhatsAppMetaError(err: WhatsAppMetaError): string {
  const parts = [err.message];
  if (err.code != null) parts.push(`code: ${err.code}`);
  if (err.type) parts.push(`type: ${err.type}`);
  return parts.join(' | ');
}

export { WELCOME_ROLES };

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function nestAdminWhatsAppSettingsGet(
  token: string,
): Promise<WhatsAppIntegrationSettings | null> {
  return adminFetch<WhatsAppIntegrationSettings>(token, '/settings');
}

export async function nestAdminWhatsAppSettingsPatch(
  token: string,
  body: Partial<
    WhatsAppIntegrationSettings & { accessToken?: string; webhookVerifyToken?: string }
  >,
): Promise<{ ok: true; data: WhatsAppIntegrationSettings } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as WhatsAppIntegrationSettings & {
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.message || `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Chyba sítě' };
  }
}

export async function nestAdminWhatsAppTestSend(
  token: string,
  toPhone?: string,
): Promise<
  | { ok: true; toPhone?: string; phoneNumberId?: string }
  | { ok: false; error: WhatsAppMetaError }
> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toPhone: toPhone?.trim() || undefined }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: parseNestWhatsAppError(data, res.status) };
    }
    return {
      ok: true,
      toPhone: typeof data.toPhone === 'string' ? data.toPhone : undefined,
      phoneNumberId: typeof data.phoneNumberId === 'string' ? data.phoneNumberId : undefined,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : 'Chyba sítě' },
    };
  }
}

export async function nestAdminWhatsAppLastLog(
  token: string,
): Promise<WhatsAppLastLog | null> {
  return adminFetch<WhatsAppLastLog | null>(token, '/last-log');
}

export async function nestAdminWhatsAppMarketingStats(
  token: string,
): Promise<WhatsAppAdminStats | null> {
  return adminFetch<WhatsAppAdminStats>(token, '/stats');
}

export async function nestAdminWhatsAppHistory(
  token: string,
  limit = 100,
): Promise<WhatsAppHistoryRow[] | null> {
  return adminFetch<WhatsAppHistoryRow[]>(token, `/history?limit=${limit}`);
}

export async function nestAdminWhatsAppTemplatesList(
  token: string,
  approvedOnly = false,
): Promise<WhatsAppTemplatesListResult | null> {
  const q = approvedOnly ? '?approvedOnly=true' : '';
  return adminFetch<WhatsAppTemplatesListResult>(token, `/templates${q}`);
}

export async function nestAdminWhatsAppTemplatesSync(
  token: string,
): Promise<
  | { ok: true; data: WhatsAppTemplatesSyncResult }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/templates/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as WhatsAppTemplatesSyncResult & {
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || data.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Chyba sítě' };
  }
}

export async function nestAdminWhatsAppCampaignsList(
  token: string,
): Promise<WhatsAppCampaignRow[] | null> {
  return adminFetch<WhatsAppCampaignRow[]>(token, '/campaigns');
}

export async function nestAdminWhatsAppCampaignCreate(
  token: string,
  body: {
    name: string;
    campaignType: WhatsAppCampaignType;
    messageTemplate?: string;
    waMetaTemplateId?: string;
    waTemplateName?: string;
    waTemplateLanguage?: string;
    waTemplateVariables?: string[];
    targetRoles?: string[];
    targetRegions?: string[];
    targetCities?: string[];
    manualPhones?: string[];
  },
): Promise<{ ok: true; data: WhatsAppCampaignRow } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/campaigns`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: formatWhatsAppMetaError(parseNestWhatsAppError(data, res.status)) };
    }
    return { ok: true, data: data as WhatsAppCampaignRow };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Chyba sítě' };
  }
}

export type WhatsAppCampaignPreviewResult = {
  preview: string | null;
  templateName: string | null;
  templateLanguage: string;
  templateVariablesRendered: string[];
  templateBody?: string | null;
  templateCategory?: string | null;
};

export async function nestAdminWhatsAppCampaignPreview(
  token: string,
  body: {
    name: string;
    campaignType: WhatsAppCampaignType;
    messageTemplate?: string;
    waMetaTemplateId?: string;
    waTemplateName?: string;
    waTemplateLanguage?: string;
    waTemplateVariables?: string[];
    sampleName?: string;
    sampleRole?: string;
  },
): Promise<WhatsAppCampaignPreviewResult | null> {
  return adminFetch<WhatsAppCampaignPreviewResult>(token, '/campaigns/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function nestAdminWhatsAppCampaignTest(
  token: string,
  campaignId: string,
  toPhone?: string,
): Promise<{ ok: true; preview?: string } | { ok: false; error: WhatsAppMetaError }> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/campaigns/${campaignId}/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toPhone: toPhone?.trim() || undefined }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: parseNestWhatsAppError(data, res.status) };
    }
    return {
      ok: true,
      preview: typeof data.preview === 'string' ? data.preview : undefined,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : 'Chyba sítě' },
    };
  }
}

export async function nestAdminWhatsAppCampaignRun(
  token: string,
  campaignId: string,
): Promise<
  | { ok: true; data: WhatsAppCampaignRunResult }
  | { ok: false; error: WhatsAppMetaError }
> {
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin/campaigns/${campaignId}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: parseNestWhatsAppError(data, res.status) };
    }
    return { ok: true, data: data as WhatsAppCampaignRunResult };
  } catch (e: unknown) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : 'Chyba sítě' },
    };
  }
}

export async function nestAdminWhatsAppCampaignLogs(
  token: string,
  campaignId: string,
): Promise<{ campaign: { id: string; name: string; status: string }; logs: WhatsAppCampaignLogRow[] } | null> {
  return adminFetch<{ campaign: { id: string; name: string; status: string }; logs: WhatsAppCampaignLogRow[] }>(
    token,
    `/campaigns/${campaignId}/logs`,
  );
}

export async function nestAdminWhatsAppCampaignDelete(
  token: string,
  campaignId: string,
): Promise<boolean> {
  const data = await adminFetch<{ ok: boolean }>(token, `/campaigns/${campaignId}`, {
    method: 'DELETE',
  });
  return data?.ok === true;
}

export function parsePhonesFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const phones: string[] = [];
  for (const line of lines) {
    const parts = line.split(/[;,]/);
    for (const part of parts) {
      const p = part.trim().replace(/^["']|["']$/g, '');
      if (p && /\+?\d{9,}/.test(p)) phones.push(p);
    }
  }
  return [...new Set(phones)];
}
