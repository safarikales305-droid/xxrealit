'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchMe } from '@/lib/nest-client';
import { shouldRedirectPropertySeeker } from '@/lib/property-seeker-routing';

/** Přesměruje PROPERTY_SEEKER na ověření WhatsApp a sdílení portálu. */
export function PropertySeekerGuard({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, apiAccessToken } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'PROPERTY_SEEKER') return;

    void (async () => {
      const me = apiAccessToken ? await nestFetchMe(apiAccessToken) : null;
      const target = shouldRedirectPropertySeeker(user.role, me, pathname);
      if (target) router.replace(target);
    })();
  }, [user, isLoading, pathname, router, apiAccessToken]);

  return <>{children ?? null}</>;
}
