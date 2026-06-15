'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  clearFacebookOAuthReturnPath,
  readFacebookOAuthReturnPath,
} from '@/lib/facebook-oauth-return';

/** Po úspěšném Facebook OAuth vrátí uživatele na stránku, odkud přihlášení začalo (PWA i prohlížeč). */
export function FacebookOAuthReturnRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, refresh } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    const fb = searchParams.get('facebook');
    if (fb === 'success' && !handled.current) {
      handled.current = true;
      void refresh().then(() => {
        const stored = readFacebookOAuthReturnPath();
        clearFacebookOAuthReturnPath();
        if (stored && stored !== `${window.location.pathname}${window.location.search}`) {
          router.replace(stored);
        } else {
          router.replace('/');
        }
      });
    }
  }, [refresh, router, searchParams]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || handled.current) return;
    const stored = readFacebookOAuthReturnPath();
    if (!stored) return;
    const current = `${window.location.pathname}${window.location.search}`;
    if (stored === current) {
      clearFacebookOAuthReturnPath();
      return;
    }
    handled.current = true;
    clearFacebookOAuthReturnPath();
    router.replace(stored);
  }, [isAuthenticated, isLoading, router]);

  return null;
}
