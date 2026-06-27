import { API_BASE_URL } from '@/lib/api';
import type { SupportTicket, SupportTicketStatus } from '@/lib/support-tickets';

function apiBase(): string | null {
  if (!API_BASE_URL) return null;
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

function authHeaders(token: string | null): HeadersInit {
  return token
    ? { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
    : { Accept: 'application/json', 'Content-Type': 'application/json' };
}

export async function fetchMySupportTickets(token: string): Promise<SupportTicket[]> {
  const base = apiBase();
  if (!base) return [];
  const res = await fetch(`${base}/support-tickets/my`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as SupportTicket[];
}

export async function fetchMySupportTicket(token: string, id: string): Promise<SupportTicket | null> {
  const base = apiBase();
  if (!base) return null;
  const res = await fetch(`${base}/support-tickets/my/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SupportTicket;
}

export async function postMySupportMessage(
  token: string,
  ticketId: string,
  body: string,
): Promise<{ ok: boolean; ticket?: SupportTicket }> {
  const base = apiBase();
  if (!base) return { ok: false };
  const res = await fetch(`${base}/support-tickets/my/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { ok: false };
  const ticket = (await res.json()) as SupportTicket;
  return { ok: true, ticket };
}

export type AdminSupportTicketRow = {
  id: string;
  publicId: string;
  createdAt: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  whatsapp: string;
  email: string;
  category: string;
  subject: string;
  status: SupportTicketStatus;
  assignedTo: { id: string; name: string; email: string } | null;
  isRegistered: boolean;
};

export async function nestAdminSupportStats(token: string): Promise<{ newCount: number }> {
  const base = apiBase();
  if (!base || !token) return { newCount: 0 };
  const res = await fetch(`${base}/admin/support-tickets/stats`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return { newCount: 0 };
  return (await res.json()) as { newCount: number };
}

export async function nestAdminListSupportTickets(
  token: string,
  query: Record<string, string>,
): Promise<AdminSupportTicketRow[]> {
  const base = apiBase();
  if (!base || !token) return [];
  const qs = new URLSearchParams(query);
  const res = await fetch(`${base}/admin/support-tickets?${qs}`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as AdminSupportTicketRow[];
}

export async function nestAdminGetSupportTicket(
  token: string,
  id: string,
): Promise<SupportTicket | null> {
  const base = apiBase();
  if (!base || !token) return null;
  const res = await fetch(`${base}/admin/support-tickets/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SupportTicket;
}

export async function nestAdminUpdateSupportTicket(
  token: string,
  id: string,
  payload: { status?: string; assignedToId?: string | null },
): Promise<{ ok: boolean; ticket?: SupportTicket }> {
  const base = apiBase();
  if (!base || !token) return { ok: false };
  const res = await fetch(`${base}/admin/support-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false };
  const ticket = (await res.json()) as SupportTicket;
  return { ok: true, ticket };
}

export async function nestAdminReplySupportTicket(
  token: string,
  id: string,
  body: string,
  isInternalNote = false,
): Promise<{ ok: boolean; ticket?: SupportTicket }> {
  const base = apiBase();
  if (!base || !token) return { ok: false };
  const res = await fetch(`${base}/admin/support-tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ body, isInternalNote }),
  });
  if (!res.ok) return { ok: false };
  const ticket = (await res.json()) as SupportTicket;
  return { ok: true, ticket };
}
