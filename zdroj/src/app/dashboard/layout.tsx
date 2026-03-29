import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoutButton } from '@/components/dashboard/logout-button';

export const metadata: Metadata = {
  title: 'Panel | XXrealit',
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-[#e85d00] transition hover:text-[#ff6a00]"
          >
            ← XXrealit
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
