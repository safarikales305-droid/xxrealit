'use client';

const API_BASE =
  typeof window !== 'undefined' ? '/api/nest' : process.env.NEXT_PUBLIC_NEST_API_URL ?? '';

function headers(token?: string | null): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const raw = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const msg = raw.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? `HTTP ${res.status}`;
}

export type WorkerInternalMessageRow = {
  id: string;
  body: string;
  senderRole: 'ADMIN' | 'WORKER';
  senderUserId: string;
  senderName: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type WorkerBulkTemplate = { id: string; templateName: string; body: string; createdAt: string };
export type WorkerBulkHistoryRow = {
  id: string;
  campaignName: string;
  recipientCount: number;
  emailsSent: number;
  emailErrors: number;
  sentAt: string | null;
  admin: { id: string; name: string; email: string };
};

export type RecruitmentTargetRow = {
  id: string;
  targetType: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  steps: string[];
};

export type WorkerProfileReminderInfo = {
  enabled: boolean;
  lastReminderSentAt: string | null;
  remindersSentCount: number;
  profileComplete: boolean;
  missing: string[];
};

export type WorkerCooperationCancelInfo = {
  request: {
    id?: string;
    status: string;
    reason: string | null;
    requestedAt: string;
    resolvedAt?: string | null;
  } | null;
  portalWorkerStatus?: string | null;
};

export type WorkerWorkGuideAdmin = {
  guide: {
    id: string;
    enabled: boolean;
    templateName: string | null;
    steps: Array<{ id: string; sortOrder: number; title: string; body: string }>;
  };
  templates: Array<{
    id: string;
    templateName: string | null;
    steps: Array<{ id: string; sortOrder: number; title: string; body: string }>;
  }>;
};

export async function fetchAdminWorkerMessages(token: string | null, workerId: string) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { messages: [] as WorkerInternalMessageRow[], unreadFromWorker: 0, error: await parseError(res) };
  return (await res.json()) as { messages: WorkerInternalMessageRow[]; unreadFromWorker: number };
}

export async function sendAdminWorkerMessage(token: string | null, workerId: string, body: string) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function markAdminWorkerMessagesRead(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages/mark-read`,
    { method: 'POST', credentials: 'include', headers: headers(token) },
  );
  return res.ok;
}

export async function fetchBulkTemplates(token: string | null) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/templates`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [] as WorkerBulkTemplate[], error: await parseError(res) };
  return (await res.json()) as { items: WorkerBulkTemplate[] };
}

export async function fetchBulkHistory(token: string | null) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/history`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [] as WorkerBulkHistoryRow[], error: await parseError(res) };
  return (await res.json()) as { items: WorkerBulkHistoryRow[] };
}

export async function sendBulkMessage(
  token: string | null,
  payload: {
    campaignName: string;
    body: string;
    filter: { activeOnly?: boolean; approvedOnly?: boolean; region?: string; district?: string };
    saveAsTemplate?: boolean;
    templateName?: string;
  },
) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/send`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function fetchProfileReminder(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/profile-reminder`,
    { credentials: 'include', headers: headers(token), cache: 'no-store' },
  );
  if (!res.ok) return { error: await parseError(res) };
  return (await res.json()) as WorkerProfileReminderInfo;
}

export async function updateProfileReminder(token: string | null, workerId: string, enabled: boolean) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/profile-reminder`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: headers(token),
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function fetchCooperationCancel(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/cooperation-cancel`,
    { credentials: 'include', headers: headers(token), cache: 'no-store' },
  );
  if (!res.ok) return { error: await parseError(res) };
  return (await res.json()) as WorkerCooperationCancelInfo;
}

export async function confirmCooperationCancel(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/cooperation-cancel/confirm`,
    { method: 'POST', credentials: 'include', headers: headers(token) },
  );
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const };
}

export async function restoreCooperation(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/cooperation-cancel/restore`,
    { method: 'POST', credentials: 'include', headers: headers(token) },
  );
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const };
}

export async function fetchWorkGuideAdmin(token: string | null, workerId: string) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/work-guide`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { error: await parseError(res) };
  return (await res.json()) as WorkerWorkGuideAdmin;
}

export async function updateWorkGuideAdmin(
  token: string | null,
  workerId: string,
  payload: {
    enabled: boolean;
    steps: Array<{ title?: string; body: string; sortOrder: number }>;
    saveAsTemplate?: boolean;
    templateName?: string;
  },
) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/work-guide`, {
    method: 'PATCH',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function fetchRecruitmentTargetsAdmin(token: string | null) {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/recruitment-targets`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [] as RecruitmentTargetRow[], error: await parseError(res) };
  return (await res.json()) as { items: RecruitmentTargetRow[] };
}

export async function updateRecruitmentTargetAdmin(
  token: string | null,
  targetType: string,
  payload: { isActive: boolean; title?: string; steps: string[] },
) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/communications/recruitment-targets/${encodeURIComponent(targetType)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: headers(token),
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function fetchWorkerMessages() {
  const res = await fetch(`${API_BASE}/portal-worker/me/messages`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { messages: [] as WorkerInternalMessageRow[], unreadFromAdmin: 0, error: await parseError(res) };
  return (await res.json()) as { messages: WorkerInternalMessageRow[]; unreadFromAdmin: number };
}

export async function replyWorkerMessage(body: string) {
  const res = await fetch(`${API_BASE}/portal-worker/me/messages/reply`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function markWorkerMessagesRead() {
  const res = await fetch(`${API_BASE}/portal-worker/me/messages/mark-read`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(),
  });
  return res.ok;
}

export async function fetchWorkerWorkGuide() {
  const res = await fetch(`${API_BASE}/portal-worker/me/work-guide`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { enabled: false, steps: [], error: await parseError(res) };
  return (await res.json()) as { enabled: boolean; steps: Array<{ sortOrder: number; title: string; body: string }> };
}

export async function fetchWorkerRecruitmentTargets() {
  const res = await fetch(`${API_BASE}/portal-worker/me/recruitment-targets`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [] as Array<{ targetType: string; label: string; title: string; steps: string[] }> };
  return (await res.json()) as { items: Array<{ targetType: string; label: string; title: string; steps: string[] }> };
}

export async function fetchWorkerCooperationCancel() {
  const res = await fetch(`${API_BASE}/portal-worker/me/cooperation-cancel`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { request: null };
  return (await res.json()) as { request: { status: string; reason: string | null; requestedAt: string } | null };
}

export async function requestWorkerCooperationCancel(reason?: string) {
  const res = await fetch(`${API_BASE}/portal-worker/me/cooperation-cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) return { ok: false as const, error: await parseError(res) };
  return { ok: true as const, ...(await res.json()) };
}

export async function fetchWorkerProfileCompletion() {
  const res = await fetch(`${API_BASE}/portal-worker/me/profile-completion`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { complete: true, missing: [] as string[] };
  return (await res.json()) as { complete: boolean; missing: string[] };
}
