'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export default function PortalWorkerPendingPage() {
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
      return;
    }
    if (user.portalWorkerStatus === 'APPROVED') {
      router.replace('/pracovnik');
    }
    if (user.portalWorkerStatus === 'SUSPENDED') {
      router.replace('/pracovnik/pozastaven');
    }
  }, [user, isLoading, router]);

  if (!user || user.role !== 'PORTAL_WORKER') return null;

  const rejected = user.portalWorkerStatus === 'REJECTED';

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">
          {rejected ? 'Žádost byla zamítnuta' : 'Čekáte na schválení'}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-700">
          {rejected
            ? 'Vaše žádost o spolupráci s XXrealit.cz byla zamítnuta administrátorem. V případě dotazů nás kontaktujte.'
            : 'Váš účet pracovníka portálu čeká na schválení administrátorem.'}
        </p>
        {!rejected ? (
          <p className="mt-3 text-sm text-zinc-600">
            Po schválení získáte přístup do pracovního panelu a budete moci zakládat klienty.
          </p>
        ) : null}
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
