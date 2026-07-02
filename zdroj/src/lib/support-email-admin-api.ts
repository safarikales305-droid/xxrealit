import { API_BASE_URL } from '@/lib/api';

function apiBase(): string | null {
  if (!API_BASE_URL) return null;
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export type SupportEmailSettings = {
  adminNotifyEmail: string | null;
  updatedAt: string;
};

export type SupportEmailMailbox = {
  id: string;
  label: string;
  email: string;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPassword: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  imapUser: string | null;
  hasImapPassword: boolean;
  signatureHtml: string;
  signatureText: string;
  autoReplyEnabled: boolean;
  autoReplySubject: string | null;
  autoReplyHtml: string | null;
  autoReplyText: string | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportMailboxForReply = {
  id: string;
  label: string;
  email: string;
  replyToEmail: string | null;
  isDefault: boolean;
};

export type SupportEmailMailboxInput = {
  label: string;
  email: string;
  replyToEmail?: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword?: string;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean;
  imapUser?: string | null;
  imapPassword?: string | null;
  signatureHtml?: string;
  signatureText?: string;
  autoReplyEnabled?: boolean;
  autoReplySubject?: string | null;
  autoReplyHtml?: string | null;
  autoReplyText?: string | null;
  isDefault?: boolean;
  active?: boolean;
  sortOrder?: number;
};

export async function nestAdminGetSupportEmailSettings(
  token: string,
): Promise<SupportEmailSettings | null> {
  const base = apiBase();
  if (!base) return null;
  const res = await fetch(`${base}/admin/support-email/settings`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SupportEmailSettings;
}

export async function nestAdminUpdateSupportEmailSettings(
  token: string,
  payload: { adminNotifyEmail?: string | null },
): Promise<{ ok: boolean; settings?: SupportEmailSettings; error?: string }> {
  const base = apiBase();
  if (!base) return { ok: false, error: 'API není nakonfigurováno' };
  const res = await fetch(`${base}/admin/support-email/settings`, {
    method: 'PATCH',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { message?: string }).message ?? 'Uložení selhalo' };
  }
  const settings = (await res.json()) as SupportEmailSettings;
  return { ok: true, settings };
}

export async function nestAdminListSupportEmailMailboxes(
  token: string,
): Promise<SupportEmailMailbox[]> {
  const base = apiBase();
  if (!base) return [];
  const res = await fetch(`${base}/admin/support-email/mailboxes`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as SupportEmailMailbox[];
}

export async function nestAdminListSupportMailboxesForReply(
  token: string,
): Promise<SupportMailboxForReply[]> {
  const base = apiBase();
  if (!base) return [];
  const res = await fetch(`${base}/admin/support-email/mailboxes/for-reply`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as SupportMailboxForReply[];
}

export async function nestAdminCreateSupportEmailMailbox(
  token: string,
  payload: SupportEmailMailboxInput,
): Promise<{ ok: boolean; mailbox?: SupportEmailMailbox; error?: string }> {
  const base = apiBase();
  if (!base) return { ok: false, error: 'API není nakonfigurováno' };
  const res = await fetch(`${base}/admin/support-email/mailboxes`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { message?: string }).message ?? 'Vytvoření selhalo' };
  }
  const mailbox = (await res.json()) as SupportEmailMailbox;
  return { ok: true, mailbox };
}

export async function nestAdminUpdateSupportEmailMailbox(
  token: string,
  id: string,
  payload: Partial<SupportEmailMailboxInput>,
): Promise<{ ok: boolean; mailbox?: SupportEmailMailbox; error?: string }> {
  const base = apiBase();
  if (!base) return { ok: false, error: 'API není nakonfigurováno' };
  const res = await fetch(`${base}/admin/support-email/mailboxes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { message?: string }).message ?? 'Uložení selhalo' };
  }
  const mailbox = (await res.json()) as SupportEmailMailbox;
  return { ok: true, mailbox };
}

export async function nestAdminDeleteSupportEmailMailbox(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = apiBase();
  if (!base) return { ok: false };
  const res = await fetch(`${base}/admin/support-email/mailboxes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { message?: string }).message ?? 'Smazání selhalo' };
  }
  return { ok: true };
}

export async function nestAdminPollSupportInbound(token: string): Promise<{ fetched: number }> {
  const base = apiBase();
  if (!base) return { fetched: 0 };
  const res = await fetch(`${base}/support-tickets/inbound/poll`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) return { fetched: 0 };
  return (await res.json()) as { fetched: number };
}
