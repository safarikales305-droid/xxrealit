'use client';

import { API_BASE_URL, getClientTokenFromCookie } from '@/lib/api';

function getStoredToken(): string | null {
  return getClientTokenFromCookie();
}

export function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function nestAuthHeaders(token: string | null): HeadersInit {
  if (token && token.length > 0) {
    return { Authorization: `Bearer ${token}` };
  }
  return getAuthHeaders();
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
      cache: 'no-store',
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
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

/** Odpověď GET /users/me (Nest JWT). */
export type NestMeProfile = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
  createdAt: string;
};

export async function nestFetchMe(
  token: string | null,
): Promise<NestMeProfile | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as NestMeProfile;
}

export type AdminStats = {
  users: number;
  admins: number;
  total: number;
  properties: number;
  pendingProperties: number;
  visits: number;
};

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

export async function nestAdminPendingProperties(
  token: string | null,
): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/properties/pending`, {
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

export async function nestAdminDeleteProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/properties/${encodeURIComponent(propertyId)}`,
    {
      method: 'DELETE',
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

export async function nestAdminUpdateUserRole(
  token: string | null,
  userId: string,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    },
  );
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

export async function nestAdminDeleteUser(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
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

export async function nestAdminImportProperties(
  token: string | null,
  apiKey: string,
): Promise<{ ok: true; imported: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/import-properties`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    imported?: number;
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
  const imported = typeof data.imported === 'number' ? data.imported : 0;
  return { ok: true, imported };
}

export async function nestAdminImportXml(
  token: string | null,
  url: string,
): Promise<{ ok: true; imported: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/import-xml`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    imported?: number;
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
  const imported = typeof data.imported === 'number' ? data.imported : 0;
  return { ok: true, imported };
}

export async function nestUploadPropertyImages(
  token: string | null,
  files: File[],
): Promise<{ ok: true; urls: string[] } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  if (files.length === 0) {
    return { ok: false, error: 'Vyberte alespoň jeden obrázek' };
  }
  const fd = new FormData();
  for (const f of files) {
    fd.append('files', f);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      urls?: unknown;
      message?: string | string[];
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    const urls = data.urls;
    if (!Array.isArray(urls)) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    const list = urls.filter((u): u is string => typeof u === 'string');
    return { ok: true, urls: list };
  } catch {
    return { ok: false, error: 'Síťová chyba při nahrávání' };
  }
}

export type NestCreateListingBody = Record<string, unknown>;

export async function nestCreatePropertyListing(
  token: string | null,
  body: NestCreateListingBody,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/properties`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

/**
 * POST /upload/avatar (soubor) → PATCH /users/avatar { avatarUrl }.
 */
export async function nestUploadAvatar(
  token: string | null,
  file: File,
): Promise<{ avatarUrl?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('file', file);
  const up = await fetch(`${API_BASE_URL}/upload/avatar`, {
    method: 'POST',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
    body: fd,
  });
  const upData = (await up.json().catch(() => ({}))) as {
    url?: string;
    message?: string | string[];
  };
  if (!up.ok) {
    const msg =
      typeof upData.message === 'string'
        ? upData.message
        : Array.isArray(upData.message)
          ? upData.message.join(', ')
          : `HTTP ${up.status}`;
    return { error: msg };
  }
  const url = typeof upData.url === 'string' ? upData.url : '';
  if (!url) {
    return { error: 'Server nevrátil URL obrázku' };
  }

  const patch = await fetch(`${API_BASE_URL}/users/avatar`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ avatarUrl: url }),
  });
  const patchData = (await patch.json().catch(() => ({}))) as {
    avatarUrl?: string | null;
    message?: string | string[];
  };
  if (!patch.ok) {
    const msg =
      typeof patchData.message === 'string'
        ? patchData.message
        : Array.isArray(patchData.message)
          ? patchData.message.join(', ')
          : `HTTP ${patch.status}`;
    return { error: msg };
  }
  const avatarUrl =
    typeof patchData.avatarUrl === 'string'
      ? patchData.avatarUrl
      : url;
  return { avatarUrl };
}

export type ShortVideo = {
  id: string;
  url?: string;
  videoUrl?: string | null;
  type?: string;
  source?: string;
  propertyId?: string;
  description?: string | null;
  content?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
};

export async function nestCreateVideoPost(
  token: string | null,
  file: File,
  description: string,
): Promise<{ success: true; url: string } | { success: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { success: false, error: 'API nebo token chybí' };
  }
  const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('description', description);
  const timeoutMs = 10 * 60 * 1000;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${postsBase}/posts/video`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      url?: string;
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
      return { success: false, error: msg };
    }
    return {
      success: data.success === true,
      url: typeof data.url === 'string' ? data.url : '',
    };
  } catch {
    return { success: false, error: 'Síťová chyba při uploadu videa' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function nestFetchVideos(): Promise<ShortVideo[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/feed/shorts`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as ShortVideo[]) : [];
  } catch {
    return [];
  }
}

export type PostComment = {
  id: string;
  content: string;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
};

function postsApiBase(): string {
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

export async function nestTogglePostFavorite(
  token: string | null,
  postId: string,
): Promise<{ ok: true; liked: boolean; likeCount: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/favorite`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      liked?: boolean;
      likeCount?: number;
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
    return {
      ok: true,
      liked: Boolean(data.liked),
      likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFetchPostComments(postId: string): Promise<PostComment[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/comments`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as PostComment[]) : [];
  } catch {
    return [];
  }
}

export async function nestAddPostComment(
  token: string | null,
  postId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/comment`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
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
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}
