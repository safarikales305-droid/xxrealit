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

/** Seznam položek z API – `error` je vyplněno jen při chybě načtení. */
export type ApiItemsResponse<T> = {
  items: T[];
  error?: string;
};

export type ApiMutationError = { ok: false; error: string };

export function hasApiError(response: { error?: string }): response is { error: string } {
  return typeof response.error === 'string' && response.error.length > 0;
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
export type WorkerBulkTemplatesListResponse = ApiItemsResponse<WorkerBulkTemplate>;
export type WorkerBulkHistoryListResponse = ApiItemsResponse<WorkerBulkHistoryRow>;

export type RecruitmentTargetRow = {
  id: string;
  slug: string;
  targetType: string | null;
  label: string;
  name: string;
  description: string;
  workerNote: string;
  isActive: boolean;
  sortOrder: number;
  isCustom: boolean;
  title: string;
  steps: string[];
};

export type RecruitmentTargetsListResponse = ApiItemsResponse<RecruitmentTargetRow>;

export type WorkerRecruitmentTargetWorkerRow = Pick<
  RecruitmentTargetRow,
  'id' | 'label' | 'name' | 'description' | 'workerNote' | 'title' | 'steps'
>;

export type WorkerRecruitmentTargetsListResponse = ApiItemsResponse<WorkerRecruitmentTargetWorkerRow>;

export type AdminWorkerMessagesResponse = {
  messages: WorkerInternalMessageRow[];
  unreadFromWorker: number;
  error?: string;
};

export type SendAdminWorkerMessageSuccess = {
  ok: true;
  message: WorkerInternalMessageRow;
};

export type SendAdminWorkerMessageResult = ApiMutationError | SendAdminWorkerMessageSuccess;

export type SendBulkMessageSuccess = {
  ok: true;
  bulkMessageId: string;
  recipientCount: number;
  emailsSent: number;
  emailErrors: number;
};

export type SendBulkMessageResult = ApiMutationError | SendBulkMessageSuccess;

export type UpdateRecruitmentTargetSuccess = {
  ok: true;
  items: RecruitmentTargetRow[];
};

export type UpdateRecruitmentTargetResult = ApiMutationError | UpdateRecruitmentTargetSuccess;

export type CreateRecruitmentTargetSuccess = {
  ok: true;
  item: RecruitmentTargetRow;
};

export type CreateRecruitmentTargetResult = ApiMutationError | CreateRecruitmentTargetSuccess;

export type DeleteRecruitmentTargetResult = ApiMutationError | { ok: true };

export type SendRecruitmentTargetSuccess = {
  ok: true;
  recipientCount: number;
  emailsSent: number;
  emailErrors: number;
};

export type SendRecruitmentTargetResult = ApiMutationError | SendRecruitmentTargetSuccess;

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

export async function fetchAdminWorkerMessages(
  token: string | null,
  workerId: string,
): Promise<AdminWorkerMessagesResponse> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    return { messages: [], unreadFromWorker: 0, error: await parseError(res) };
  }
  const data = (await res.json()) as { messages?: WorkerInternalMessageRow[]; unreadFromWorker?: number };
  return {
    messages: data.messages ?? [],
    unreadFromWorker: data.unreadFromWorker ?? 0,
  };
}

export async function sendAdminWorkerMessage(
  token: string | null,
  workerId: string,
  body: string,
): Promise<SendAdminWorkerMessageResult> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const data = (await res.json()) as { message: WorkerInternalMessageRow };
  return { ok: true, message: data.message };
}

export async function markAdminWorkerMessagesRead(token: string | null, workerId: string) {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/${encodeURIComponent(workerId)}/messages/mark-read`,
    { method: 'POST', credentials: 'include', headers: headers(token) },
  );
  return res.ok;
}

export async function fetchBulkTemplates(token: string | null): Promise<WorkerBulkTemplatesListResponse> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/templates`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [], error: await parseError(res) };
  const data = (await res.json()) as { items?: WorkerBulkTemplate[] };
  return { items: data.items ?? [] };
}

export async function fetchBulkHistory(token: string | null): Promise<WorkerBulkHistoryListResponse> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/history`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [], error: await parseError(res) };
  const data = (await res.json()) as { items?: WorkerBulkHistoryRow[] };
  return { items: data.items ?? [] };
}

export async function sendBulkMessage(
  token: string | null,
  payload: {
    campaignName: string;
    subject?: string;
    body: string;
    filter: { activeOnly?: boolean; approvedOnly?: boolean; region?: string; district?: string };
    saveAsTemplate?: boolean;
    templateName?: string;
  },
): Promise<SendBulkMessageResult> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/bulk-messages/send`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const data = (await res.json()) as {
    bulkMessageId: string;
    recipientCount: number;
    emailsSent: number;
    emailErrors: number;
  };
  return {
    ok: true,
    bulkMessageId: data.bulkMessageId,
    recipientCount: data.recipientCount,
    emailsSent: data.emailsSent,
    emailErrors: data.emailErrors,
  };
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

export async function fetchRecruitmentTargetsAdmin(
  token: string | null,
): Promise<RecruitmentTargetsListResponse> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/recruitment-targets`, {
    credentials: 'include',
    headers: headers(token),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [], error: await parseError(res) };
  const data = (await res.json()) as { items?: RecruitmentTargetRow[] };
  return { items: data.items ?? [] };
}

export async function updateRecruitmentTargetAdmin(
  token: string | null,
  id: string,
  payload: {
    isActive?: boolean;
    name?: string;
    title?: string;
    description?: string;
    workerNote?: string;
    sortOrder?: number;
    steps?: string[];
  },
): Promise<UpdateRecruitmentTargetResult> {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/communications/recruitment-targets/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: headers(token),
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const data = (await res.json()) as { items?: RecruitmentTargetRow[] };
  return { ok: true, items: data.items ?? [] };
}

export async function createRecruitmentTargetAdmin(
  token: string | null,
  payload: {
    name: string;
    description?: string;
    workerNote?: string;
    sortOrder?: number;
    isActive?: boolean;
    steps: string[];
  },
): Promise<CreateRecruitmentTargetResult> {
  const res = await fetch(`${API_BASE}/admin/portal-workers/communications/recruitment-targets`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const data = (await res.json()) as { item: RecruitmentTargetRow };
  return { ok: true, item: data.item };
}

export async function deleteRecruitmentTargetAdmin(
  token: string | null,
  id: string,
): Promise<DeleteRecruitmentTargetResult> {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/communications/recruitment-targets/${encodeURIComponent(id)}`,
    { method: 'DELETE', credentials: 'include', headers: headers(token) },
  );
  if (!res.ok) return { ok: false, error: await parseError(res) };
  return { ok: true };
}

export async function sendRecruitmentTargetToWorkers(
  token: string | null,
  targetId: string,
  workerIds: string[],
): Promise<SendRecruitmentTargetResult> {
  const res = await fetch(
    `${API_BASE}/admin/portal-workers/communications/recruitment-targets/${encodeURIComponent(targetId)}/send`,
    {
      method: 'POST',
      credentials: 'include',
      headers: headers(token),
      body: JSON.stringify({ workerIds }),
    },
  );
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const data = (await res.json()) as {
    recipientCount: number;
    emailsSent: number;
    emailErrors: number;
  };
  return {
    ok: true,
    recipientCount: data.recipientCount,
    emailsSent: data.emailsSent,
    emailErrors: data.emailErrors,
  };
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

export async function fetchWorkerRecruitmentTargets(): Promise<WorkerRecruitmentTargetsListResponse> {
  const res = await fetch(`${API_BASE}/portal-worker/me/recruitment-targets`, {
    credentials: 'include',
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return { items: [], error: await parseError(res) };
  const data = (await res.json()) as { items?: WorkerRecruitmentTargetWorkerRow[] };
  return { items: data.items ?? [] };
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
