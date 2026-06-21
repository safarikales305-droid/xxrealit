'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export default function PortalWorkerSuspendedPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PORTAL_WORKER') {
      router.replace('/profil');
    }
  }, [user, isLoading, router]);

  if (!user || user.role !== 'PORTAL_WORKER') return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">Účet pozastaven</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-700">
          Účet pracovníka byl pozastaven administrátorem. Všechny pracovní funkce jsou dočasně
          zablokovány.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-[#e85d00] hover:underline"
        >
          Odhlásit se
        </Link>
      </div>
    </div>
  );
}
