'use client';

import Link from 'next/link';
import { useLayoutEffect, useState } from 'react';
import { LogoutButton } from '@/components/dashboard/logout-button';
import { getClientTokenFromCookie } from '@/lib/api';

type StoredUser = {
  id?: string;
  email?: string;
  name?: string | null;
  role?: string;
};

export default function PanelPage() {
  const [ready, setReady] = useState(false);
  const [storedUser, setStoredUser] = useState<StoredUser | null>(null);

  useLayoutEffect(() => {
    const token = getClientTokenFromCookie();
    const user = localStorage.getItem('user');
    if (!token && !user) {
      window.location.href = '/login';
      return;
    }
    if (user) {
      try {
        setStoredUser(JSON.parse(user) as StoredUser);
        setReady(true);
        return;
      } catch {
        window.location.href = '/login';
        return;
      }
    }
    void (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : undefined,
        });
        if (!res.ok) {
          window.location.href = '/login';
          return;
        }
        const data = (await res.json()) as { user?: StoredUser };
        if (!data.user) {
          window.location.href = '/login';
          return;
        }
        setStoredUser(data.user);
        try {
          localStorage.setItem('user', JSON.stringify(data.user));
        } catch {
          /* ignore */
        }
        setReady(true);
      } catch {
        window.location.href = '/login';
      }
    })();
  }, []);

  if (!ready || !storedUser) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 text-zinc-600">
        Načítání…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-12 text-zinc-900">
      <Link
        href="/"
        className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
      >
        ← Domů
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Panel</h1>
      <p className="mt-2 text-[15px] text-zinc-600">
        Přihlášen jako{' '}
        <span className="font-medium text-zinc-800">
          {storedUser.email ?? '—'}
        </span>
        {storedUser.name ? (
          <>
            {' '}
            ({storedUser.name})
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Role: {storedUser.role ?? '—'}
      </p>
      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}
