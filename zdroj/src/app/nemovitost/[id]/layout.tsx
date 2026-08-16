import type { ReactNode } from 'react';
import { PublicHeader } from '@/components/navigation/PublicHeader';

/** Veřejný detail — bez PrivateSellerGate (shorts výpis odkazuje sem). */
export default function NemovitostDetailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <PublicHeader activeSection="reality" />
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
