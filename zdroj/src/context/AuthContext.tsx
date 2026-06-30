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
import { getClientTokenFromCookie } from '@/lib/api';
import {
  clearClientAuthCookies,
  getBrowserAuthMeUrl,
} from '@/lib/auth-client';
import { normalizeAuthUser, type AuthUser } from '@/lib/auth-user';
import { clearPwaInstallDismissed } from '@/lib/pwa-install-storage';
import { clearProfileOnboardingSession } from '@/lib/onboarding-popup-session';
import { setWindowLocationHref } from '@/lib/navigation-debug';

export type { AuthUser };

type AuthContextValue = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(token: string | null): Promise<AuthUser | null> {
  const headers: HeadersInit = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(getBrowserAuthMeUrl(), {
    credentials: 'include',
    cache: 'no-store',
    headers,
  });
  if (res.status === 401) {
    clearClientAuthCookies();
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[auth] /me returned 401 — cleared client auth cookies');
    }
    return null;
  }
  if (!res.ok) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[auth/me] ROLE_LOAD_FAIL status=', res.status);
    }
    return null;
  }
  const data = (await res.json()) as { user?: unknown } | Record<string, unknown> | null;
  let user: AuthUser | null = null;
  if (data && typeof data === 'object' && 'user' in data && data.user) {
    user = normalizeAuthUser(data.user);
  } else {
    user = normalizeAuthUser(data);
  }
  if (user && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug('[auth] /me loaded', {
      userId: user.id,
      role: user.role,
      publicProfile: user.publicProfile,
    });
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
        publicProfile: user.publicProfile ?? false,
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
  if (user && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug('[auth] auth user set in context', user.id);
  }
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
    clearClientAuthCookies();
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
