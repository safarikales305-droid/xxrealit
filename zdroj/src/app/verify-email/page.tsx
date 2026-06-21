'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { nestVerifyEmailByToken } from '@/lib/nest-client';

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token || done) return;
    let cancelled = false;
    void (async () => {
      const result = await nestVerifyEmailByToken(token);
      if (cancelled) return;
      setDone(true);
      if (!result.ok) {
        setError(result.error ?? 'Ověřovací odkaz je neplatný nebo expiroval.');
        return;
      }
      setMessage(result.message ?? 'E-mail byl úspěšně ověřen.');
      router.replace('/profil/dashboard?tab=settings&emailVerified=1');
    })();
    return () => {
      cancelled = true;
    };
  }, [token, done, router]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">Ověření e-mailu</h1>
        {!token ? (
          <p className="mt-3 text-sm text-red-600">
            Ověřovací odkaz je neplatný nebo expiroval.
          </p>
        ) : !done ? (
          <p className="mt-3 text-sm text-zinc-600">Ověřuji e-mail…</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <p className="mt-3 text-sm text-emerald-700">{message}</p>
        )}
        <Link
          href="/profil/dashboard"
          className="mt-6 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Přejít na profil
        </Link>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-10">
          <p className="text-sm text-zinc-600">Načítám…</p>
        </main>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
