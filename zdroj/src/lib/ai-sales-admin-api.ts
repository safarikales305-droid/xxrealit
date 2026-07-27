import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

export type AiSalesApiError = {
  success: false;
  code: string;
  message: string;
  httpStatus: number;
  phase?: string;
  technicalContext?: Record<string, string | number | boolean | null>;
  validContactIds?: string[];
  invalidContactIds?: string[];
  searchResultId?: string;
};

const REQUEST_TIMEOUT_MS = 60_000;
const ANALYSIS_TIMEOUT_MS = 90_000;

async function aiSalesRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai-sales${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string>),
      },
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const err = body as Partial<AiSalesApiError> | null;
      const code =
        err?.code ??
        (res.status === 404 ? 'ENDPOINT_NOT_FOUND' : res.status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN_ERROR');
      const message =
        err?.message ??
        (res.status === 404
          ? 'Endpoint AI obchodníka nebyl nalezen. Zkontrolujte, zda běží aktuální verze backendu.'
          : res.status >= 500
            ? `Server vrátil chybu ${res.status}.`
            : `Chyba ${res.status}`);
      const error = new Error(message) as Error & AiSalesApiError;
      error.success = false;
      error.code = code;
      error.httpStatus = res.status;
      error.phase = err?.phase;
      error.technicalContext = err?.technicalContext;
      error.validContactIds = err?.validContactIds;
      error.invalidContactIds = err?.invalidContactIds;
      error.searchResultId = err?.searchResultId;
      throw error;
    }

    return body as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      const error = new Error('Požadavek vypršel (timeout).') as Error & AiSalesApiError;
      error.success = false;
      error.code = timeoutMs >= ANALYSIS_TIMEOUT_MS ? 'OPENAI_TIMEOUT' : 'TIMEOUT';
      error.httpStatus = 504;
      error.phase = 'request';
      throw error;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export type AiSalesDashboard = {
  periodDays: number;
  newProspects: number;
  analyzedProspects: number;
  avgFitScore: number;
  needsReview: number;
  approvedProspects: number;
  pendingApproval: number;
  sentToday: number;
  repliesToday: number;
  positiveReplies: number;
  rejections: number;
  noResponse: number;
  scheduledFollowUps: number;
  conversions: number;
  activePartners: number;
  leads: number;
  foundInSearch: number;
  newAgencies: number;
  newAgents: number;
  newConstruction: number;
  conversionRate: number;
  aiCostCzk: number;
  aiRequests: number;
  costPerLead: number;
};

export type AiSalesProspect = {
  id: string;
  partnerType: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  phone?: string | null;
  city: string | null;
  region: string | null;
  website: string | null;
  source: string;
  fitScore: number | null;
  priority: string | null;
  status: string;
  doNotContact: boolean;
  publicInfo: string | null;
  analysisJson: Record<string, unknown> | null;
  fitReasonsJson: string[] | null;
  publicContacts?: AiSalesPublicContact[];
  _count?: { messages: number; leads: number; publicContacts?: number };
};

export type AiSalesMessage = {
  id: string;
  prospectId: string;
  subject: string | null;
  preheader?: string | null;
  greeting?: string | null;
  intro?: string | null;
  benefitsJson?: Array<{ title: string; description: string }> | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  closing?: string | null;
  signature?: string | null;
  plainText?: string | null;
  htmlContent?: string | null;
  content: string;
  status: string;
  replyToEmail?: string | null;
  variantLabel?: string | null;
  analysisIncomplete?: boolean;
  personalizationReasonsJson?: string[] | null;
  knowledgeUsedJson: unknown;
  outreachReason: string | null;
  recommendedOffer: string | null;
  sentAt: string | null;
  prospect?: AiSalesProspect & { email?: string | null };
  versions?: Array<{ id: string; version: number; changeSource: string; createdAt: string }>;
};

export type SaveSearchResultResponse = {
  success: boolean;
  action: 'CREATED' | 'UPDATED';
  prospectId: string;
  prospect?: AiSalesProspect & { publicContacts?: AiSalesPublicContact[] };
  contactsSaved?: number;
  emailsSaved?: number;
  phonesSaved?: number;
  savedContacts: number;
  primaryEmail: string | null;
  primaryPhone: string | null;
  redirectUrl: string;
  partial?: boolean;
  analysisStatus?: 'PENDING' | 'SKIPPED' | 'FAILED' | 'COMPLETED';
  analysisUnavailable?: boolean;
  savedWithoutEmail?: boolean;
  warning?: string | { code?: string; message?: string } | null;
};

export type GenerateMessageResponse = {
  success: boolean;
  partial?: boolean;
  analysisIncomplete?: boolean;
  messageId?: string;
  previewUrl?: string;
  status?: string;
  variants: Array<{
    id?: string;
    messageId: string;
    variant: string;
    tone?: string;
    subject: string;
    previewUrl: string;
  }>;
};

export type AiSalesSearchResult = {
  id: string;
  companyName: string;
  partnerType: string;
  contactName: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  website: string | null;
  city: string | null;
  region: string | null;
  source: string;
  sourceUrl: string | null;
  verificationStatus: string;
  contactVerificationStatus?: string | null;
  contactEnrichmentStatus?: string | null;
  doNotContact: boolean;
  relevanceReason: string | null;
  savedProspectId: string | null;
};

export type AiSalesPublicContact = {
  id: string;
  searchResultId?: string | null;
  type: string;
  value: string;
  normalizedValue: string | null;
  label?: string | null;
  contactPersonName?: string | null;
  contactPersonRole?: string | null;
  sourceUrl: string | null;
  sourcePageTitle: string | null;
  sourceTextSnippet: string | null;
  verificationStatus: string;
  confidence: number;
  isPrimary: boolean;
  isSelectedForOutreach?: boolean;
};

export type AiSalesMessageRecipient = {
  id: string;
  messageId: string;
  contactId: string | null;
  email: string;
  status: string;
  selected: boolean;
  approved: boolean;
  providerMessageId?: string | null;
  sentAt?: string | null;
  contact?: {
    id: string;
    value: string;
    label: string | null;
    contactPersonName: string | null;
    isPrimary: boolean;
    verificationStatus: string;
  } | null;
};

export type EnrichmentResult = {
  success: boolean;
  searchResultId?: string;
  verificationStatus: string;
  email: string | null;
  phone: string | null;
  visitedPages: Array<{ url: string; title: string; status: number }>;
  contacts: AiSalesPublicContact[];
  error?: string;
};

export type AiSalesSearchJob = {
  id: string;
  status: string;
  totalFound: number;
  newResults: number;
  duplicateResults: number;
  suppressedResults: number;
  currentSource: string | null;
  progressPercent: number;
  errorCode: string | null;
  errorMessage: string | null;
  partial?: boolean;
  requestedSources?: string[];
  usedSources?: string[];
  skippedSources?: Array<{ source: string; code: string; message: string }>;
};

export type AiSalesSearchProviderInfo = {
  id: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  missingVariable?: string | null;
  status?: string;
};

export type AiSalesSearchProvidersResponse = {
  providers: AiSalesSearchProviderInfo[];
  activeWebProvider?: { key: string; name: string; envVar: string } | null;
  environment?: {
    environment?: string;
    serviceName?: string | null;
    deploymentId?: string | null;
    applicationVersion?: string | null;
    serpApiConfigured?: boolean;
    serpApiKeyLength?: number;
    serpApiKeyMasked?: string | null;
  };
  legacy?: Array<Record<string, unknown>>;
};

export type AiSalesStartSearchResponse = {
  success: boolean;
  partial?: boolean;
  searchId: string;
  status: string;
  requestedSources?: string[];
  usedSources?: string[];
  skippedSources?: Array<{ source: string; code: string; message: string }>;
};

export const PARTNER_TYPES = [
  'REAL_ESTATE_AGENT', 'REAL_ESTATE_AGENCY', 'CONSTRUCTION_COMPANY', 'DEVELOPER',
  'FINANCIAL_ADVISOR', 'MORTGAGE_SPECIALIST', 'INVESTOR', 'CRAFTSMAN',
  'PROPERTY_SERVICES', 'PROPERTY_MANAGER', 'PROPERTY_PHOTOGRAPHER',
  'LEGAL_TECH_SPECIALIST', 'OTHER',
] as const;

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE_AGENT: 'Makléř',
  REAL_ESTATE_AGENCY: 'Realitní kancelář',
  CONSTRUCTION_COMPANY: 'Stavební firma',
  DEVELOPER: 'Developer',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  MORTGAGE_SPECIALIST: 'Hypoteční specialista',
  INVESTOR: 'Investor',
  CRAFTSMAN: 'Řemeslník / řemeslník',
  PROPERTY_SERVICES: 'Služby pro nemovitosti',
  PROPERTY_MANAGER: 'Správce nemovitostí',
  PROPERTY_PHOTOGRAPHER: 'Fotograf nemovitostí',
  LEGAL_TECH_SPECIALIST: 'Právní/technický specialista',
  OTHER: 'Jiný partner',
};

export const PROSPECT_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nový',
  ANALYZED: 'Analyzovaný',
  NEEDS_REVIEW: 'Ke kontrole',
  APPROVED: 'Schválený',
  READY_FOR_OUTREACH: 'Připravená nabídka',
  CONTACTED: 'Osloven',
  WAITING_REPLY: 'Čeká na odpověď',
  REPLIED: 'Odpověděl',
  IN_NEGOTIATION: 'Probíhá jednání',
  REGISTRATION: 'Registrace',
  ACTIVE_PARTNER: 'Aktivní partner',
  CONVERTED: 'Konvertován',
  NOT_INTERESTED: 'Nezájem',
  DO_NOT_CONTACT: 'Blacklist',
};

export const KNOWLEDGE_CATEGORIES = [
  'AGENT_OFFER', 'AGENCY_OFFER', 'DEVELOPER_OFFER', 'CONSTRUCTION_COMPANY_OFFER',
  'FINANCIAL_ADVISOR_OFFER', 'INVESTOR_OFFER', 'MORTGAGE_OFFER', 'CRAFTSMAN_OFFER',
  'MARKETING', 'PRICING', 'PORTAL_BENEFITS', 'FAQ', 'IMPORTS', 'SOCIAL_PUBLISHING', 'LEADS',
] as const;

export const SEARCH_SOURCES = [
  { id: 'INTERNAL_DATABASE', label: 'Interní databáze XXREALIT' },
  { id: 'APPROVED_WEB_PROVIDER', label: 'Schválený webový provider (SerpAPI / Bing)' },
] as const;

export function getDashboard(token: string, days = 7) {
  return aiSalesRequest<AiSalesDashboard>(token, `/dashboard?days=${days}`);
}

export function getDiagnostics(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/diagnostics');
}

export function getOpenAiDiagnostics(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/openai-diagnostics');
}

export function listProspects(token: string, qs?: string) {
  return aiSalesRequest<AiSalesProspect[]>(token, `/prospects${qs ? `?${qs}` : ''}`);
}

export function createProspect(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<AiSalesProspect>(token, '/prospects', { method: 'POST', body: JSON.stringify(body) });
}

export function analyzeProspect(token: string, id: string) {
  return aiSalesRequest<Record<string, unknown>>(
    token,
    `/prospects/${id}/analyze`,
    { method: 'POST', body: '{}' },
    ANALYSIS_TIMEOUT_MS,
  );
}

export function approveProspect(token: string, id: string) {
  return aiSalesRequest(token, `/prospects/${id}/approve`, { method: 'POST', body: '{}' });
}

export function generateOffer(
  token: string,
  id: string,
  body?: { tone?: string; variantCount?: number; campaignId?: string; skipAnalysis?: boolean },
) {
  return aiSalesRequest<GenerateMessageResponse>(
    token,
    `/prospects/${id}/generate-offer`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? { variantCount: 3 }),
    },
    ANALYSIS_TIMEOUT_MS,
  );
}

export function generateMessage(
  token: string,
  id: string,
  body?: { tone?: string; variantCount?: number; campaignId?: string },
) {
  return aiSalesRequest<GenerateMessageResponse>(token, `/prospects/${id}/generate-message`, {
    method: 'POST',
    body: JSON.stringify(body ?? { variantCount: 3 }),
  });
}

export function generateManualMessage(token: string, id: string) {
  return aiSalesRequest<{ success: boolean; message: AiSalesMessage }>(
    token,
    `/prospects/${id}/generate-message/manual`,
    { method: 'POST', body: '{}' },
  );
}

export function getMessage(token: string, id: string) {
  return aiSalesRequest<AiSalesMessage>(token, `/messages/${id}`);
}

export function getMessagePreview(token: string, id: string) {
  return aiSalesRequest<{
    messageId: string;
    status: string;
    subject: string | null;
    html: string;
    previewUrl: string;
    from?: string;
    fromName?: string;
    fromFormatted?: string;
    replyTo?: string;
    footerContactEmail?: string;
    partial?: boolean;
  }>(token, `/messages/${id}/preview`);
}

export function deleteMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}`, { method: 'DELETE' });
}

export function markDoNotContact(token: string, id: string, reason?: string) {
  return aiSalesRequest(token, `/prospects/${id}/do-not-contact`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function importPreview(token: string, csv: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/prospects/import/preview', { method: 'POST', body: JSON.stringify({ csv }) });
}

export function importProspects(token: string, rows: Array<Record<string, unknown>>) {
  return aiSalesRequest(token, '/prospects/import', { method: 'POST', body: JSON.stringify({ rows }) });
}

export function startSearch(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<AiSalesStartSearchResponse>(token, '/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getSearch(token: string, id: string) {
  return aiSalesRequest<AiSalesSearchJob>(token, `/searches/${id}`);
}

export function getSearchResults(token: string, id: string) {
  return aiSalesRequest<AiSalesSearchResult[]>(token, `/searches/${id}/results`);
}

export function saveSearchResult(
  token: string,
  id: string,
  body?: {
    selectedContactIds?: string[];
    primaryEmailContactId?: string;
    primaryPhoneContactId?: string;
  },
) {
  return aiSalesRequest<SaveSearchResultResponse>(token, `/search-results/${id}/save`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function analyzeSearchResult(token: string, id: string) {
  return aiSalesRequest(token, `/search-results/${id}/analyze`, { method: 'POST', body: '{}' });
}

export function rejectSearchResult(token: string, id: string) {
  return aiSalesRequest(token, `/search-results/${id}/reject`, { method: 'POST', body: '{}' });
}

export function verifySearchResult(token: string, id: string) {
  return aiSalesRequest<AiSalesSearchResult & { checks?: string[] }>(token, `/search-results/${id}/verify`, {
    method: 'POST',
    body: '{}',
  });
}

export function dncSearchResult(token: string, id: string) {
  return aiSalesRequest(token, `/search-results/${id}/do-not-contact`, { method: 'POST', body: '{}' });
}

export function enrichSearchResult(token: string, id: string) {
  return aiSalesRequest<EnrichmentResult>(token, `/search-results/${id}/enrich`, { method: 'POST', body: '{}' });
}

export function enrichSearchResultsBatch(token: string, searchResultIds: string[]) {
  return aiSalesRequest<{ processed: number; results: EnrichmentResult[] }>(token, '/search-results/enrich-batch', {
    method: 'POST',
    body: JSON.stringify({ searchResultIds }),
  });
}

export function getSearchResultContacts(token: string, id: string) {
  return aiSalesRequest<AiSalesPublicContact[]>(token, `/search-results/${id}/contacts`);
}

export function getProspect(token: string, id: string) {
  return aiSalesRequest<AiSalesProspect & { publicContacts?: AiSalesPublicContact[]; messages?: AiSalesMessage[] }>(
    token,
    `/prospects/${id}`,
  );
}

export function importSearchContacts(
  token: string,
  prospectId: string,
  body?: {
    selectedContactIds?: string[];
    primaryEmailContactId?: string;
    primaryPhoneContactId?: string;
  },
) {
  return aiSalesRequest<{
    success: boolean;
    contactsSaved: number;
    emailsSaved: number;
    phonesSaved: number;
    contacts: AiSalesPublicContact[];
    primaryEmail: string | null;
    primaryPhone: string | null;
  }>(token, `/prospects/${prospectId}/import-search-contacts`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function getProspectContacts(token: string, id: string) {
  return aiSalesRequest<AiSalesPublicContact[]>(token, `/prospects/${id}/contacts`);
}

export function setProspectContactPrimary(token: string, prospectId: string, contactId: string) {
  return aiSalesRequest<AiSalesPublicContact[]>(token, `/prospects/${prospectId}/contacts/${contactId}/set-primary`, {
    method: 'POST',
    body: '{}',
  });
}

export function toggleProspectContactOutreach(token: string, prospectId: string, contactId: string, enabled: boolean) {
  return aiSalesRequest(token, `/prospects/${prospectId}/contacts/${contactId}/toggle-outreach`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function getMessageRecipients(token: string, messageId: string) {
  return aiSalesRequest<AiSalesMessageRecipient[]>(token, `/messages/${messageId}/recipients`);
}

export function updateMessageRecipients(
  token: string,
  messageId: string,
  recipients: Array<{ id: string; selected?: boolean; approved?: boolean }>,
) {
  return aiSalesRequest<AiSalesMessageRecipient[]>(token, `/messages/${messageId}/recipients`, {
    method: 'PUT',
    body: JSON.stringify({ recipients }),
  });
}

export function selectAllMessageRecipients(token: string, messageId: string) {
  return aiSalesRequest<AiSalesMessageRecipient[]>(token, `/messages/${messageId}/recipients/select-all`, {
    method: 'POST',
    body: '{}',
  });
}

export function selectPrimaryMessageRecipients(token: string, messageId: string) {
  return aiSalesRequest<AiSalesMessageRecipient[]>(token, `/messages/${messageId}/recipients/select-primary`, {
    method: 'POST',
    body: '{}',
  });
}

export function updateProspectContact(
  token: string,
  id: string,
  body: {
    email?: string | null;
    phone?: string | null;
    contactName?: string | null;
    position?: string | null;
    website?: string | null;
    contactSourceNote?: string | null;
    manualConfirm?: boolean;
  },
) {
  return aiSalesRequest(token, `/prospects/${id}/contact`, { method: 'PUT', body: JSON.stringify(body) });
}

export function enrichProspect(token: string, id: string) {
  return aiSalesRequest<EnrichmentResult>(token, `/prospects/${id}/enrich`, { method: 'POST', body: '{}' });
}

export function listSearchProviders(token: string) {
  return aiSalesRequest<AiSalesSearchProvidersResponse>(token, '/search-providers');
}

export function testSearchProvider(token: string, providerKey: string) {
  return aiSalesRequest<Record<string, unknown>>(token, `/search-providers/${providerKey}/test`, { method: 'POST', body: '{}' });
}

export function listMessages(token: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return aiSalesRequest<AiSalesMessage[]>(token, `/messages${qs}`);
}

export function approveMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/approve`, { method: 'POST', body: '{}' });
}

export function sendMessage(
  token: string,
  id: string,
  body?: { mode?: 'immediate' | 'schedule'; scheduledAt?: string },
) {
  return aiSalesRequest(token, `/messages/${id}/send`, {
    method: 'POST',
    body: JSON.stringify(body ?? { mode: 'immediate' }),
  });
}

export function scheduleMessage(token: string, id: string, scheduledAt: string) {
  return aiSalesRequest(token, `/messages/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  });
}

export function getMessageSendLogs(token: string, messageId: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, `/messages/${messageId}/send-logs`);
}

export function rejectMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/reject`, { method: 'POST', body: '{}' });
}

export function updateMessage(
  token: string,
  id: string,
  body: {
    subject?: string;
    content?: string;
    preheader?: string;
    greeting?: string;
    intro?: string;
    benefitsJson?: unknown;
    ctaText?: string;
    ctaUrl?: string;
    closing?: string;
    signature?: string;
    plainText?: string;
    htmlContent?: string;
    replyToEmail?: string;
  },
) {
  return aiSalesRequest<AiSalesMessage>(token, `/messages/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function submitMessageForApproval(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/submit-for-approval`, { method: 'POST', body: '{}' });
}

export function regenerateMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/regenerate`, { method: 'POST', body: '{}' });
}

export function sendTestMessage(token: string, id: string, email: string) {
  return aiSalesRequest(token, `/messages/${id}/send-test`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function listMessageVersions(token: string, id: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, `/messages/${id}/versions`);
}

export function restoreMessageVersion(token: string, messageId: string, versionId: string) {
  return aiSalesRequest(token, `/messages/${messageId}/versions/${versionId}/restore`, {
    method: 'POST',
    body: '{}',
  });
}

export function listReplies(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/replies');
}

export function getSettings(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/settings');
}

export function updateSettings(token: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, '/settings', { method: 'PUT', body: JSON.stringify(body) });
}

export function testOpenAi(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/test-openai', { method: 'POST', body: '{}' });
}

export function testAnalysis(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<Record<string, unknown>>(
    token,
    '/test-analysis',
    { method: 'POST', body: JSON.stringify(body) },
    ANALYSIS_TIMEOUT_MS,
  );
}

export function testSearchProviderApi(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<Record<string, unknown>>(token, '/test-search-provider', { method: 'POST', body: JSON.stringify(body) });
}

export function listPrompts(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/prompts');
}

export function listKnowledge(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/knowledge');
}

export function getAnalytics(token: string, days = 30) {
  return aiSalesRequest<Record<string, unknown>>(token, `/analytics?days=${days}`);
}

export function listTasks(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/tasks');
}

export function listCrmPartners(token: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return aiSalesRequest<Array<Record<string, unknown>>>(token, `/crm/partners${qs}`);
}

export function getCrmPartner(token: string, id: string) {
  return aiSalesRequest<Record<string, unknown>>(token, `/crm/partners/${id}`);
}

export function updateCrmPartner(token: string, id: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, `/crm/partners/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function addPartnerMemory(token: string, id: string, body: { memoryType: string; content: string }) {
  return aiSalesRequest(token, `/crm/partners/${id}/memories`, { method: 'POST', body: JSON.stringify(body) });
}

export function listFollowUps(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/follow-up');
}

export function scanFollowUps(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/follow-up/scan', { method: 'POST', body: '{}' });
}

export function updatePrompt(token: string, id: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, `/prompts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function activatePrompt(token: string, id: string) {
  return aiSalesRequest(token, `/prompts/${id}/activate`, { method: 'POST', body: '{}' });
}

export function createKnowledge(token: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, '/knowledge', { method: 'POST', body: JSON.stringify(body) });
}

export function updateKnowledge(token: string, id: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, `/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function approveKnowledge(token: string, id: string) {
  return aiSalesRequest(token, `/knowledge/${id}/approve`, { method: 'POST', body: '{}' });
}

export function updateSearchProvider(token: string, id: string, enabled: boolean) {
  return aiSalesRequest(token, `/search-providers/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
}
