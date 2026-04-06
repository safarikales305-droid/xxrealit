'use client';

import type { ReactNode } from 'react';
import { PrivateSellerGate } from './PrivateSellerGate';
import { PortalNavbar } from './PortalNavbar';

export function SellerPortalShell({ children }: { children: ReactNode }) {
  return (
    <PrivateSellerGate>
      {/*
        Vnitřní scroll portálu; stránka může scrollovat i vně přes body (globals).
      */}
      <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-zinc-50 text-zinc-900">
        <div className="shrink-0">
          <PortalNavbar />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
        </div>
      </div>
    </PrivateSellerGate>
  );
}
