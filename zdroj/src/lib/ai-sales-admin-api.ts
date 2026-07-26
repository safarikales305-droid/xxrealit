import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

export type AiSalesApiError = {
  success: false;
  code: string;
  message: string;
  httpStatus: number;
  phase?: string;
  technicalContext?: Record<string, string | number | boolean | null>;
};

const REQUEST_TIMEOUT_MS = 60_000;

async function aiSalesRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai-sales${path}`, {
      ...init,
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
      throw error;
    }

    return body as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      const error = new Error('Požadavek vypršel (timeout 60 s).') as Error & AiSalesApiError;
      error.success = false;
      error.code = 'TIMEOUT';
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
  _count?: { messages: number; leads: number };
};

export type AiSalesMessage = {
  id: string;
  prospectId: string;
  subject: string | null;
  content: string;
  status: string;
  outreachReason: string | null;
  recommendedOffer: string | null;
  knowledgeUsedJson: unknown;
  sentAt: string | null;
  prospect?: AiSalesProspect;
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
  doNotContact: boolean;
  relevanceReason: string | null;
  savedProspectId: string | null;
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

export function listProspects(token: string, qs?: string) {
  return aiSalesRequest<AiSalesProspect[]>(token, `/prospects${qs ? `?${qs}` : ''}`);
}

export function createProspect(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<AiSalesProspect>(token, '/prospects', { method: 'POST', body: JSON.stringify(body) });
}

export function analyzeProspect(token: string, id: string) {
  return aiSalesRequest<Record<string, unknown>>(token, `/prospects/${id}/analyze`, { method: 'POST', body: '{}' });
}

export function approveProspect(token: string, id: string) {
  return aiSalesRequest(token, `/prospects/${id}/approve`, { method: 'POST', body: '{}' });
}

export function generateMessage(token: string, id: string) {
  return aiSalesRequest<{ message: AiSalesMessage }>(token, `/prospects/${id}/generate-message`, { method: 'POST', body: '{}' });
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
  return aiSalesRequest<{ success: boolean; searchId: string; status: string }>(token, '/search', {
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

export function saveSearchResult(token: string, id: string) {
  return aiSalesRequest<AiSalesProspect>(token, `/search-results/${id}/save`, { method: 'POST', body: '{}' });
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

export function listSearchProviders(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/search-providers');
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

export function sendMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/send`, { method: 'POST', body: '{}' });
}

export function rejectMessage(token: string, id: string) {
  return aiSalesRequest(token, `/messages/${id}/reject`, { method: 'POST', body: '{}' });
}

export function updateMessage(token: string, id: string, body: { subject?: string; content?: string }) {
  return aiSalesRequest(token, `/messages/${id}`, { method: 'PUT', body: JSON.stringify(body) });
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
  return aiSalesRequest<Record<string, unknown>>(token, '/test-analysis', { method: 'POST', body: JSON.stringify(body) });
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
