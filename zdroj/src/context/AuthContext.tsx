'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { API_BASE_URL, getClientTokenFromCookie } from '@/lib/api';
import { clearPwaInstallDismissed } from '@/lib/pwa-install-storage';

export type AuthUser = {
  id: string;
  email: string;
  /** Zobrazované jméno (User.name na backendu, GET /auth/me i /users/me). */
  name?: string | null;
  role: string;
  createdAt: string;
  avatar?: string | null;
  avatarCrop?: { x: number; y: number; zoom: number } | null;
  coverImage?: string | null;
  coverCrop?: { x: number; y: number; zoom: number } | null;
  bio?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function meUrl(): string {
  return API_BASE_URL ? `${API_BASE_URL}/auth/me` : '/api/auth/me';
}

function normalizeMeUser(raw: unknown): AuthUser | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.email !== 'string' || typeof o.role !== 'string') {
    return null;
  }
  const avatarRaw = o.avatar ?? o.avatarUrl;
  const avatarCropRaw = o.avatarCrop;
  const coverRaw = o.coverImage ?? o.coverImageUrl;
  const coverCropRaw = o.coverCrop;
  const avatar =
    typeof avatarRaw === 'string' && avatarRaw.trim() ? avatarRaw.trim() : null;
  const coverImage =
    typeof coverRaw === 'string' && coverRaw.trim() ? coverRaw.trim() : null;
  const avatarCrop =
    avatarCropRaw && typeof avatarCropRaw === 'object'
      ? {
          x: Number((avatarCropRaw as { x?: number }).x ?? 0),
          y: Number((avatarCropRaw as { y?: number }).y ?? 0),
          zoom: Number((avatarCropRaw as { zoom?: number }).zoom ?? 1),
        }
      : null;
  const coverCrop =
    coverCropRaw && typeof coverCropRaw === 'object'
      ? {
          x: Number((coverCropRaw as { x?: number }).x ?? 0),
          y: Number((coverCropRaw as { y?: number }).y ?? 0),
          zoom: Number((coverCropRaw as { zoom?: number }).zoom ?? 1),
        }
      : null;
  const bio = o.bio === null || typeof o.bio === 'string' ? (o.bio as string | null) : null;
  const name =
    o.name === undefined
      ? undefined
      : o.name === null || typeof o.name === 'string'
        ? typeof o.name === 'string'
          ? o.name.trim() || null
          : null
        : undefined;
  const createdAt =
    typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
  return {
    id: o.id,
    email: o.email,
    name,
    role: o.role,
    createdAt,
    avatar,
    avatarCrop,
    coverImage,
    coverCrop,
    bio,
  };
}

async function fetchMe(token: string | null): Promise<AuthUser | null> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(meUrl(), {
    credentials: 'include',
    cache: 'no-store',
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { user?: unknown } | Record<string, unknown> | null;
  if (data && typeof data === 'object' && 'user' in data && data.user) {
    return normalizeMeUser(data.user);
  }
  return normalizeMeUser(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = getClientTokenFromCookie();
    try {
      const u = await fetchMe(token);
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = getClientTokenFromCookie();
      try {
        const u = await fetchMe(token);
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    if (typeof window === 'undefined') return;
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'access_token=; path=/; max-age=0; SameSite=Lax';
    try {
      localStorage.removeItem('user');
    } catch {
      /* ignore */
    }
    clearPwaInstallDismissed();
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, refresh, logout }),
    [user, loading, refresh, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
