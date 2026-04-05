'use client';

import { API_BASE_URL } from '@/lib/api';

export function nestAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function nestApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

/** POST /favorites/:id nebo DELETE — vyžaduje JWT z Nest (stejný secret + uživatel v Nest DB). */
export async function nestToggleFavorite(
  propertyId: string,
  favorited: boolean,
  token: string | null,
): Promise<{ ok: boolean; favorited?: boolean; likeCount?: number; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const method = favorited ? 'DELETE' : 'POST';
  const url = `${API_BASE_URL}/favorites/${encodeURIComponent(propertyId)}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      favorited?: boolean;
      likeCount?: number;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      favorited: data.favorited,
      likeCount: data.likeCount,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFetchFavorites(token: string | null): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/favorites`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

export async function nestFetchMe(
  token: string | null,
): Promise<{ avatarUrl?: string | null; email?: string } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as { avatarUrl?: string | null; email?: string };
}

export type AdminStats = { users: number; admins: number; total: number };

export type AdminUserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
  createdAt: string;
};

export async function nestAdminStats(
  token: string | null,
): Promise<AdminStats | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/stats`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as AdminStats;
}

export async function nestAdminProperties(
  token: string | null,
): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/properties`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

export async function nestAdminApproveProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/properties/${encodeURIComponent(propertyId)}/approve`,
    {
      method: 'PATCH',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: typeof err.message === 'string' ? err.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true };
}

export async function nestAdminUsers(
  token: string | null,
): Promise<AdminUserRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AdminUserRow[]) : null;
}

export async function nestAdminChangePassword(
  token: string | null,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/password`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestUploadAvatar(
  token: string | null,
  file: File,
): Promise<{ avatarUrl?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/users/avatar`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    avatarUrl?: string;
    message?: string;
  };
  if (!res.ok) {
    return { error: data.message ?? `HTTP ${res.status}` };
  }
  return { avatarUrl: data.avatarUrl };
}
