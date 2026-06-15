'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const STORAGE_KEY = 'facebook_oauth_return';

/** Po úspěšném Facebook OAuth vrátí uživatele na stránku, odkud přihlášení začalo (PWA i prohlížeč). */
export function FacebookOAuthReturnRedirect() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || handled.current) return;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)?.trim();
      if (!stored || !stored.startsWith('/')) return;
      const current = `${window.location.pathname}${window.location.search}`;
      if (stored === current) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      handled.current = true;
      sessionStorage.removeItem(STORAGE_KEY);
      router.replace(stored);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, isLoading, router]);

  return null;
}
