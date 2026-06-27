import type { PortalWorkerDashboard } from '@/lib/nest-client';

export type WorkerCrmOverview = PortalWorkerDashboard & {
  maxBonusPerClient?: number;
  commissionPercent?: number | null;
  cards?: {
    clientCount: number;
    newRegistrations: number;
    completedRegistrations: number;
    pendingRegistrations: number;
    needsContact: number;
    bonusCreditsGranted: number;
    paidCredits: number;
    myCommission: number;
    todayCalls: number;
    todayWhatsapp: number;
  };
};

export type WorkerClientRow = {
  kind: 'preregistration' | 'client';
  id: string;
  name: string;
  company: string;
  role: string;
  roleLabel: string;
  phone: string;
  whatsapp: string;
  email: string;
  registrationStatus: string;
  whatsappVerified: boolean;
  emailVerified: boolean;
  bonusCredit: number;
  paidCredit: number;
  commission: number;
  createdAt: string;
  lastActivityAt: string;
  clientUserId?: string | null;
  preregistrationId?: string | null;
};

async function workerFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`/api/nest/portal-worker/${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function fetchWorkerCrmOverview(): Promise<WorkerCrmOverview | null> {
  return workerFetch<WorkerCrmOverview>('me/dashboard');
}

export async function fetchWorkerClients(q?: string, status?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return workerFetch<{ items: WorkerClientRow[] }>(`clients${qs ? `?${qs}` : ''}`);
}

export async function fetchWorkerClientDetail(id: string, kind?: string) {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return workerFetch<Record<string, unknown>>(`clients/${encodeURIComponent(id)}${qs}`);
}

export async function createWorkerClient(payload: Record<string, unknown>) {
  const res = await fetch('/api/nest/portal-worker/clients', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, message: data.message, error: res.ok ? undefined : (data.message ?? 'Chyba') };
}

export async function addWorkerClientNote(payload: {
  preregistrationId?: string;
  clientUserId?: string;
  noteType: string;
  body: string;
}) {
  const res = await fetch('/api/nest/portal-worker/clients/notes', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok };
}

export async function grantWorkerClientBonus(clientUserId: string, amount: number, description?: string) {
  const res = await fetch('/api/nest/portal-worker/clients/bonus', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientUserId, amount, description }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, error: data.message };
}

export type WorkerSelfSettings = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsappPhone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  whatsappVerified: boolean;
  maxBonusPerClient: number;
  canAssignBonusCredits: boolean;
  commissionPercent: number | null;
};

export async function fetchWorkerSelfSettings(): Promise<WorkerSelfSettings | null> {
  return workerFetch<WorkerSelfSettings>('me/settings');
}

export async function updateWorkerSelfSettings(payload: {
  phone?: string;
  whatsappPhone?: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/nest/portal-worker/me/settings', {
    method: 'PATCH',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, error: res.ok ? undefined : (data.message ?? 'Chyba') };
}

export async function sendWorkerClientEmail(preregistrationId: string) {
  const res = await fetch(
    `/api/nest/portal-worker/clients/${encodeURIComponent(preregistrationId)}/send-email`,
    { method: 'POST', credentials: 'include' },
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, message: data.message, error: res.ok ? undefined : (data.message ?? 'Chyba') };
}

export async function sendWorkerClientWhatsapp(
  preregistrationId: string,
  action: string,
) {
  const res = await fetch(
    `/api/nest/portal-worker/clients/${encodeURIComponent(preregistrationId)}/send-whatsapp`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string; ok?: boolean };
  return { ok: res.ok, message: data.message, error: res.ok ? undefined : (data.message ?? 'Chyba') };
}

export const WORKER_CLIENT_ROLES = [
  { value: 'AGENT', label: 'Makléř' },
  { value: 'AGENCY', label: 'Realitní kancelář' },
  { value: 'COMPANY', label: 'Stavební firma' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'FINANCIAL_ADVISOR', label: 'Finanční poradce' },
  { value: 'PRIVATE_SELLER', label: 'Soukromý inzerent' },
] as const;

export const NOTE_TYPES = [
  { value: 'PHONE_CALL', label: 'Telefonát' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'AGREED', label: 'Domluveno' },
  { value: 'UNREACHABLE', label: 'Nezastižen' },
  { value: 'INTEREST', label: 'Zájem' },
  { value: 'REJECTED', label: 'Odmítnuto' },
  { value: 'OTHER', label: 'Jiné' },
] as const;

export const REG_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Zahájená registrace',
  COMPLETED: 'Dokončeno',
  EXPIRED: 'Vypršelo',
  NEEDS_CONTACT: 'Vyžaduje kontakt',
  STARTED: 'Zahájená registrace',
  IN_PROGRESS: 'Probíhá',
};
