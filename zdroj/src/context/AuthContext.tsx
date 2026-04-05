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

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  avatar?: string | null;
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
  return '/api/auth/me';
}

async function fetchMe(token: string | null): Promise<AuthUser | null> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(meUrl(), {
    credentials: 'include',
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { user?: AuthUser } | AuthUser | null;
  if (data && typeof data === 'object' && 'user' in data && data.user) {
    return data.user;
  }
  if (
    data &&
    typeof data === 'object' &&
    'id' in data &&
    'email' in data &&
    'role' in data
  ) {
    return data as AuthUser;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
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
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
    localStorage.removeItem('token');
    try {
      localStorage.removeItem('user');
    } catch {
      /* ignore */
    }
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
