import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PortalNavbar } from '@/components/rental/PortalNavbar';

export const metadata: Metadata = {
  title: 'Dashboard | XXrealit',
};

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <PortalNavbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
