'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { isPathAllowedForRegistrationRequirements } from '@/lib/registration-gate';

type Props = {
  children: ReactNode;
};

export function RegistrationRequirementsGuard({ children }: Props) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const requirements = user?.registrationRequirements;
  const needsWizard = Boolean(
    user?.role !== 'ADMIN' &&
      user?.role !== 'PROPERTY_SEEKER' &&
      requirements &&
      !requirements.allCompleted,
  );
  const allowed = isPathAllowedForRegistrationRequirements(pathname ?? '');

  useEffect(() => {
    if (isLoading || !needsWizard || allowed) return;
    router.replace('/onboarding/complete-registration');
  }, [isLoading, needsWizard, allowed, router]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" aria-hidden />;
  }

  if (needsWizard && !allowed) {
    return null;
  }

  return <>{children}</>;
}
