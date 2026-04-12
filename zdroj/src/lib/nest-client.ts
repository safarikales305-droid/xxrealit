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

/** Čitelná zpráva z Nest JSON těla (`message` / `error`), ne jen „Internal server error“. */
export function nestApiErrorBodyMessage(
  status: number,
  data: unknown,
  fallback: string,
): string {
  if (data == null || typeof data !== 'object') {
    if (status === 413) return 'Soubor je příliš velký.';
    if (status >= 500) {
      return 'Server dočasně neodpovídá. Zkuste to prosím znovu nebo zkontrolujte log backendu.';
    }
    return fallback;
  }
  const o = data as Record<string, unknown>;
  const m = o.message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (Array.isArray(m)) {
    const parts = m.filter((x): x is string => typeof x === 'string');
    if (parts.length) return parts.join(', ');
  }
  const err = o.error;
  if (typeof err === 'string' && err.trim() && err !== 'Internal Server Error') {
    return err.trim();
  }
  if (status === 413) return 'Soubor je příliš velký.';
  if (status >= 500) {
    return 'Server dočasně neodpovídá. Zkuste to prosím znovu nebo zkontrolujte log backendu.';
  }
  return fallback;
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
  coverImageUrl?: string | null;
  bio?: string | null;
  createdAt: string;
};

/** Shodně s backend limitem `PROFILE_UPLOAD_MAX_BYTES` (20 MB). */
export const NEST_PROFILE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

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

export async function nestUploadPropertyMedia(
  token: string | null,
  input: { video: File | null; images: File[]; imageOrder: string[] },
): Promise<{ ok: true; videoUrl: string | null; imageUrls: string[] } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  if (input.video) fd.append('video', input.video);
  for (const image of input.images) {
    fd.append('images', image);
  }
  fd.append('imageOrder', JSON.stringify(input.imageOrder));

  try {
    const res = await fetch(`${API_BASE_URL}/upload/media`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      videoUrl?: string | null;
      imageUrls?: unknown;
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
      videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : null,
      imageUrls: Array.isArray(data.imageUrls)
        ? data.imageUrls.filter((u): u is string => typeof u === 'string')
        : [],
    };
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

export async function nestCreatePropertyListingMultipart(
  token: string | null,
  formData: FormData,
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
      },
      body: formData,
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
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return {
      error: `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`,
    };
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
    return {
      error: nestApiErrorBodyMessage(up.status, upData, `Nahrání fotky selhalo (HTTP ${up.status}).`),
    };
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
    return {
      error: nestApiErrorBodyMessage(
        patch.status,
        patchData,
        `Uložení URL profilové fotky selhalo (HTTP ${patch.status}).`,
      ),
    };
  }
  const avatarUrl =
    typeof patchData.avatarUrl === 'string'
      ? patchData.avatarUrl
      : url;
  return { avatarUrl };
}

/**
 * POST /upload/cover → PATCH /users/cover.
 * Kompresi provádí backend (`ProfileImagesService` + `sharp`).
 */
export async function nestUploadCover(
  token: string | null,
  file: File,
): Promise<{ coverImageUrl?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return {
      error: `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`,
    };
  }
  const fd = new FormData();
  fd.append('file', file);
  const up = await fetch(`${API_BASE_URL}/upload/cover`, {
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
    return {
      error: nestApiErrorBodyMessage(up.status, upData, `Nahrání cover obrázku selhalo (HTTP ${up.status}).`),
    };
  }
  const url = typeof upData.url === 'string' ? upData.url : '';
  if (!url) {
    return { error: 'Server nevrátil URL cover obrázku' };
  }
  const patch = await fetch(`${API_BASE_URL}/users/cover`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coverImageUrl: url }),
  });
  const patchData = (await patch.json().catch(() => ({}))) as {
    coverImageUrl?: string | null;
    message?: string | string[];
  };
  if (!patch.ok) {
    return {
      error: nestApiErrorBodyMessage(
        patch.status,
        patchData,
        `Uložení URL cover obrázku selhalo (HTTP ${patch.status}).`,
      ),
    };
  }
  const coverImageUrl =
    typeof patchData.coverImageUrl === 'string'
      ? patchData.coverImageUrl
      : url;
  return { coverImageUrl };
}

export async function nestDeleteCover(
  token: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/cover`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestPatchProfileBio(
  token: string | null,
  bio: string | null,
): Promise<{ ok: boolean; bio?: string | null; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/profile`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bio }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    bio?: string | null;
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
  return { ok: true, bio: data.bio ?? null };
}

export type ShortVideo = {
  id: string;
  url?: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  price?: number | null;
  city?: string | null;
  images?: string[];
  type?: string;
  source?: string;
  propertyId?: string;
  description?: string | null;
  content?: string | null;
  createdAt: string;
  liked?: boolean;
  userId?: string;
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
): Promise<
  | { success: true; url: string; mediaType: 'video' | 'image' }
  | { success: false; error?: string }
> {
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
      mediaType?: string;
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
    const url = typeof data.url === 'string' ? data.url : '';
    if (data.success !== true || !url) {
      return { success: false, error: 'Upload selhal' };
    }
    const mediaType: 'video' | 'image' =
      data.mediaType === 'image' ? 'image' : 'video';
    return { success: true, url, mediaType };
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

/** Shodně s backend `MESSAGE_MAX_LEN`. */
export const NEST_MESSAGE_BODY_MAX = 1000;

export type NestConversationListItem = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyPrice: number;
  propertyCity: string;
  propertyImageUrl: string | null;
  counterpart: { id: string; name: string | null; email: string };
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

export type NestConversationDetailMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
};

export type NestConversationDetail = {
  id: string;
  property: {
    id: string;
    title: string;
    price: number;
    city: string;
    imageUrl: string | null;
  };
  counterpart: { id: string; name: string | null; email: string };
  messages: NestConversationDetailMessage[];
};

export type NestConversationStub = {
  id: string;
  propertyId: string;
};

function nestErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const o = data as Record<string, unknown>;
  const m = o.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m) && m.every((x) => typeof x === 'string')) return m.join(', ');
  if (typeof o.error === 'string') return o.error;
  return fallback;
}

export async function nestMessagesUnreadCount(token: string | null): Promise<number> {
  if (!API_BASE_URL || !token) return 0;
  try {
    const res = await fetch(`${API_BASE_URL}/conversations/unread-count`, {
      cache: 'no-store',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as unknown;
    if (typeof data === 'number') return Math.max(0, data);
    if (data && typeof data === 'object' && typeof (data as { count?: unknown }).count === 'number') {
      return Math.max(0, (data as { count: number }).count);
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function nestConversationsList(
  token: string | null,
  folder: 'inbox' | 'sent' | 'all',
): Promise<NestConversationListItem[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations?folder=${encodeURIComponent(folder)}`,
      {
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NestConversationListItem[]) : null;
  } catch {
    return null;
  }
}

export async function nestGetOrCreateConversation(
  token: string | null,
  propertyId: string,
): Promise<{ ok: true; conversation: NestConversationStub } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ propertyId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    const id = typeof data.id === 'string' ? data.id : '';
    const pid = typeof data.propertyId === 'string' ? data.propertyId : propertyId;
    if (!id) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    return { ok: true, conversation: { id, propertyId: pid } };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestConversationDetail(
  token: string | null,
  conversationId: string,
): Promise<NestConversationDetail | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`,
      {
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as NestConversationDetail;
  } catch {
    return null;
  }
}

export async function nestSendConversationMessage(
  token: string | null,
  conversationId: string,
  body: string,
): Promise<
  | { ok: true; message: { id: string; body: string; senderId: string; createdAt: string } }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const trimmed = body.trim();
  if (!trimmed.length) {
    return { ok: false, error: 'Zpráva nesmí být prázdná' };
  }
  if (trimmed.length > NEST_MESSAGE_BODY_MAX) {
    return { ok: false, error: `Maximálně ${NEST_MESSAGE_BODY_MAX} znaků` };
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...nestAuthHeaders(token),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: trimmed }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    const id = typeof data.id === 'string' ? data.id : '';
    const senderId = typeof data.senderId === 'string' ? data.senderId : '';
    const b = typeof data.body === 'string' ? data.body : trimmed;
    const createdAt =
      data.createdAt instanceof Date
        ? data.createdAt.toISOString()
        : typeof data.createdAt === 'string'
          ? data.createdAt
          : new Date().toISOString();
    if (!id) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    return { ok: true, message: { id, body: b, senderId, createdAt } };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestMarkConversationRead(
  token: string | null,
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/read`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
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

export type ListingMedia = {
  id: string;
  url: string;
  type: 'image' | 'video';
  order: number;
};

export type ListingPost = {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  type: 'post' | 'short' | string;
  createdAt: string;
  media: ListingMedia[];
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
  _count?: {
    favorites?: number;
    comments?: number;
  };
  category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE';
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number;
  reactions?: Array<{
    userId: string;
    postId: string;
    type: 'LIKE' | 'DISLIKE';
  }>;
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

export async function nestCreateListingPost(
  token: string | null,
  input: {
    title: string;
    description: string;
    price: number;
    city: string;
    type: 'post' | 'short';
    video?: File | null;
    images: File[];
    imageOrder: string[];
    category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE';
    latitude?: number;
    longitude?: number;
  },
): Promise<{ ok: true; post: ListingPost } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('title', input.title);
  fd.append('description', input.description);
  fd.append('price', String(Math.max(0, Math.trunc(input.price))));
  fd.append('city', input.city);
  fd.append('type', input.type);
  if (input.category) fd.append('category', input.category);
  if (Number.isFinite(input.latitude)) fd.append('latitude', String(input.latitude));
  if (Number.isFinite(input.longitude)) fd.append('longitude', String(input.longitude));
  fd.append('imageOrder', JSON.stringify(input.imageOrder));
  if (input.video) {
    fd.append('video', input.video);
  }
  for (const image of input.images) {
    fd.append('images', image);
  }

  const res = await fetch(`${postsApiBase()}/posts/listing`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
    },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    post?: ListingPost;
    message?: string | string[];
    error?: string;
  };
  if (!res.ok || !data.post) {
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
  return { ok: true, post: data.post };
}

export async function nestFetchPostDetail(postId: string): Promise<ListingPost | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as ListingPost;
}

export async function nestFetchCommunityPosts(
  category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE',
  options?: { radiusKm?: number; lat?: number; lng?: number },
): Promise<ListingPost[]> {
  if (!API_BASE_URL) return [];
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (Number.isFinite(options?.radiusKm)) params.set('radiusKm', String(options?.radiusKm));
  if (Number.isFinite(options?.lat)) params.set('lat', String(options?.lat));
  if (Number.isFinite(options?.lng)) params.set('lng', String(options?.lng));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${postsApiBase()}/posts${qs}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as ListingPost[]) : [];
}

export async function nestSetPostReaction(
  token: string | null,
  postId: string,
  type: 'LIKE' | 'DISLIKE',
): Promise<
  | { ok: true; likeCount: number; dislikeCount: number; reaction: 'LIKE' | 'DISLIKE' | null }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/reaction`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    likeCount?: number;
    dislikeCount?: number;
    reaction?: 'LIKE' | 'DISLIKE' | null;
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
    likeCount: Number(data.likeCount ?? 0),
    dislikeCount: Number(data.dislikeCount ?? 0),
    reaction: data.reaction ?? null,
  };
}
