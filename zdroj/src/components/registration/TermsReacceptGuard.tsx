'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { isPathAllowedForTermsReaccept } from '@/lib/portal-terms';

type Props = {
  children: ReactNode;
};

export function TermsReacceptGuard({ children }: Props) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const needsReaccept = user?.termsReacceptRequired === true;
  const allowed = isPathAllowedForTermsReaccept(pathname ?? '');

  useEffect(() => {
    if (isLoading || !needsReaccept || allowed) return;
    router.replace('/souhlas-s-podminkami');
  }, [isLoading, needsReaccept, allowed, router]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" aria-hidden />;
  }

  if (needsReaccept && !allowed) {
    return null;
  }

  return <>{children}</>;
}
