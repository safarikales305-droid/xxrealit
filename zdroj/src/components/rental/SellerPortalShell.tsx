'use client';

import type { ReactNode } from 'react';
import { PrivateSellerGate } from './PrivateSellerGate';
import { PortalNavbar } from './PortalNavbar';

export function SellerPortalShell({ children }: { children: ReactNode }) {
  return (
    <PrivateSellerGate>
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <PortalNavbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </div>
    </PrivateSellerGate>
  );
}
