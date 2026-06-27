'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export default function FirstContentOnboardingPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/prihlaseni?redirect=%2Fonboarding%2Ffirst-content');
      return;
    }
    if (!user) return;
    if (
      user.role === 'ADMIN' ||
      user.role === 'PROPERTY_SEEKER' ||
      !user.requireFirstContent ||
      user.firstContentCompleted
    ) {
      router.replace(user.role === 'PROPERTY_SEEKER' ? '/?tab=shorts' : '/');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !user) {
    return <div className="min-h-[50vh] bg-zinc-50" />;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-orange-200 bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          Aktivace účtu
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Vítejte na XXrealit</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600">
          Pro aktivaci účtu vložte první inzerát nebo tip na nemovitost.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/inzerat/pridat"
            className="inline-flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            Vložit inzerát
          </Link>
          <Link
            href="/profil/tipy"
            className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-orange-300 bg-white px-5 py-3 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
          >
            Vložit tip
          </Link>
        </div>
      </div>
    </div>
  );
}
