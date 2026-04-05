'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { isPrivateSeller } from '@/lib/rental/private-seller-auth';

export function PrivateSellerGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);

  useLayoutEffect(() => {
    if (!isPrivateSeller()) {
      window.location.replace('/');
      return;
    }
    setAllowed(true);
  }, []);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500">
        Načítání…
      </div>
    );
  }

  return <>{children}</>;
}
