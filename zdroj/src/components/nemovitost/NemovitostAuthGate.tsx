'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

type Props = {
  redirectPath: string;
  children: React.ReactNode;
};

export function NemovitostAuthGate({ redirectPath, children }: Props) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      const q = `/prihlaseni?redirect=${encodeURIComponent(redirectPath)}`;
      router.replace(q);
    }
  }, [user, isLoading, router, redirectPath]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Načítám…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Přesměrování na přihlášení…
      </div>
    );
  }

  return <>{children}</>;
}
