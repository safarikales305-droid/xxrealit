import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

async function aiSalesRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-sales${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Chyba ${res.status}`);
  }
  return (await res.json()) as T;
}

export type AiSalesDashboard = {
  periodDays: number;
  newProspects: number;
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
  leads: number;
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
  CRAFTSMAN: 'Řemeslník',
  PROPERTY_SERVICES: 'Služby pro nemovitosti',
  PROPERTY_MANAGER: 'Správce nemovitostí',
  PROPERTY_PHOTOGRAPHER: 'Fotograf nemovitostí',
  LEGAL_TECH_SPECIALIST: 'Právní/technický specialista',
  OTHER: 'Jiný partner',
};

export function getDashboard(token: string, days = 7) {
  return aiSalesRequest<AiSalesDashboard>(token, `/dashboard?days=${days}`);
}

export function listProspects(token: string, qs?: string) {
  return aiSalesRequest<AiSalesProspect[]>(token, `/prospects${qs ? `?${qs}` : ''}`);
}

export function getProspect(token: string, id: string) {
  return aiSalesRequest<AiSalesProspect>(token, `/prospects/${id}`);
}

export function createProspect(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<AiSalesProspect>(token, '/prospects', { method: 'POST', body: JSON.stringify(body) });
}

export function analyzeProspect(token: string, id: string) {
  return aiSalesRequest<Record<string, unknown>>(token, `/prospects/${id}/analyze`, { method: 'POST', body: '{}' });
}

export function generateMessage(token: string, id: string) {
  return aiSalesRequest<{ message: AiSalesMessage }>(token, `/prospects/${id}/generate-message`, { method: 'POST', body: '{}' });
}

export function markDoNotContact(token: string, id: string, reason?: string) {
  return aiSalesRequest(token, `/prospects/${id}/do-not-contact`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function importPreview(token: string, csv: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/prospects/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export function importProspects(token: string, rows: Array<Record<string, unknown>>) {
  return aiSalesRequest(token, '/prospects/import', { method: 'POST', body: JSON.stringify({ rows }) });
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

export function listCampaigns(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/campaigns');
}

export function getSettings(token: string) {
  return aiSalesRequest<Record<string, unknown>>(token, '/settings');
}

export function updateSettings(token: string, body: Record<string, unknown>) {
  return aiSalesRequest(token, '/settings', { method: 'PUT', body: JSON.stringify(body) });
}

export function runAiSalesTest(token: string, body: Record<string, unknown>) {
  return aiSalesRequest<Record<string, unknown>>(token, '/test', { method: 'POST', body: JSON.stringify(body) });
}

export function getAnalytics(token: string, days = 30) {
  return aiSalesRequest<Record<string, unknown>>(token, `/analytics?days=${days}`);
}

export function listTasks(token: string) {
  return aiSalesRequest<Array<Record<string, unknown>>>(token, '/tasks');
}
