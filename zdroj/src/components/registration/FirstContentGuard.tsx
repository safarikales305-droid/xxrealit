'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { isPathAllowedForFirstContent } from '@/lib/registration-gate';

type Props = {
  children: ReactNode;
};

export function FirstContentGuard({ children }: Props) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const needsOnboarding = Boolean(
    user?.requireFirstContent && !user.firstContentCompleted,
  );
  const allowed = isPathAllowedForFirstContent(pathname ?? '');

  useEffect(() => {
    if (isLoading || !needsOnboarding || allowed) return;
    router.replace('/onboarding/first-content');
  }, [isLoading, needsOnboarding, allowed, router]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" aria-hidden />;
  }

  if (needsOnboarding && !allowed) {
    return null;
  }

  return <>{children}</>;
}
