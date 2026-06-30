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
import { clearProfileOnboardingSession } from '@/lib/onboarding-popup-session';
import { setWindowLocationHref } from '@/lib/navigation-debug';

export type AuthUser = {
  id: string;
  email: string;
  /** Zobrazované jméno (User.name na backendu, GET /auth/me i /users/me). */
  name?: string | null;
  phone?: string;
  phonePublic?: boolean;
  role: string;
  createdAt: string;
  portalWorkerStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
  avatar?: string | null;
  avatarCrop?: { x: number; y: number; zoom: number } | null;
  coverImage?: string | null;
  coverCrop?: { x: number; y: number; zoom: number } | null;
  bio?: string | null;
  firstContentCompleted?: boolean;
  requireFirstContent?: boolean;
  registrationRequirements?: import('@/lib/marketing-bonus').RegistrationRequirementsStatus | null;
  termsReacceptRequired?: boolean;
  currentTermsVersion?: number | null;
  isPublicProfile?: boolean;
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
  const portalWorkerStatus =
    o.portalWorkerStatus === 'PENDING_APPROVAL' ||
    o.portalWorkerStatus === 'APPROVED' ||
    o.portalWorkerStatus === 'REJECTED' ||
    o.portalWorkerStatus === 'SUSPENDED'
      ? o.portalWorkerStatus
      : o.portalWorkerStatus === null
        ? null
        : undefined;
  return {
    id: o.id,
    email: o.email,
    name,
    phone: typeof o.phone === 'string' ? o.phone : '',
    phonePublic: o.phonePublic === true,
    role: o.role,
    createdAt,
    portalWorkerStatus,
    avatar,
    avatarCrop,
    coverImage,
    coverCrop,
    bio,
    firstContentCompleted: o.firstContentCompleted === true,
    requireFirstContent: o.requireFirstContent === true,
    registrationRequirements:
      o.registrationRequirements && typeof o.registrationRequirements === 'object'
        ? (o.registrationRequirements as AuthUser['registrationRequirements'])
        : null,
    termsReacceptRequired: o.termsReacceptRequired === true,
    currentTermsVersion:
      typeof o.currentTermsVersion === 'number' ? o.currentTermsVersion : null,
    isPublicProfile: o.isPublicProfile === true,
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
    console.warn('[auth/me] ROLE_LOAD_FAIL status=', res.status);
    return null;
  }
  const data = (await res.json()) as { user?: unknown } | Record<string, unknown> | null;
  let user: AuthUser | null = null;
  if (data && typeof data === 'object' && 'user' in data && data.user) {
    user = normalizeMeUser(data.user);
  } else {
    user = normalizeMeUser(data);
  }
  if (user) {
    console.log(`[auth/me] ROLE_LOADED userId=${user.id} role=${user.role}`);
  }
  return user;
}

function persistAuthUserToStorage(user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      localStorage.removeItem('user');
      return;
    }
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? null,
        createdAt: user.createdAt,
        avatar: user.avatar ?? null,
        coverImage: user.coverImage ?? null,
        bio: user.bio ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
}

function applyAuthUser(
  user: AuthUser | null,
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>,
) {
  setUser(user);
  persistAuthUserToStorage(user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = getClientTokenFromCookie();
    try {
      const u = await fetchMe(token);
      applyAuthUser(u, setUser);
    } catch {
      applyAuthUser(null, setUser);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = getClientTokenFromCookie();
      try {
        const u = await fetchMe(token);
        if (!cancelled) applyAuthUser(u, setUser);
      } catch {
        if (!cancelled) applyAuthUser(null, setUser);
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
    clearProfileOnboardingSession();
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setWindowLocationHref('/login', 'AuthContext.logout');
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
