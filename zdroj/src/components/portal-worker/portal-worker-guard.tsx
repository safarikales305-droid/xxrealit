'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchMe } from '@/lib/nest-client';
import { shouldRedirectPortalWorker } from '@/lib/portal-worker-routing';

/** Přesměruje PORTAL_WORKER uživatele na správné pracovní stránky. */
export function PortalWorkerGuard({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, apiAccessToken } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'PORTAL_WORKER') return;

    void (async () => {
      let status = user.portalWorkerStatus ?? null;
      if (status == null && apiAccessToken) {
        const me = await nestFetchMe(apiAccessToken);
        status = me?.portalWorkerStatus ?? null;
      }
      const target = shouldRedirectPortalWorker(user.role, status, pathname);
      if (target) router.replace(target);
    })();
  }, [user, isLoading, pathname, router, apiAccessToken]);

  return <>{children ?? null}</>;
}
