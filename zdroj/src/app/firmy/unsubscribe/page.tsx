'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { nestCompanyUnsubscribe } from '@/lib/company-directory-client';

export default function CompanyUnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    void nestCompanyUnsubscribe(token).then((res) => {
      if (res?.ok) {
        setStatus('ok');
        setCompanyName(res.companyName ?? null);
      } else {
        setStatus('error');
      }
    });
  }, [token]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-bold text-zinc-900">Odhlášení z emailů</h1>
      {status === 'loading' ? (
        <p className="mt-4 text-sm text-zinc-600">Zpracovávám…</p>
      ) : status === 'ok' ? (
        <p className="mt-4 text-sm text-zinc-700">
          {companyName
            ? `Firma ${companyName} byla odhlášena z automatických engagement emailů.`
            : 'Odhlášení proběhlo úspěšně.'}
        </p>
      ) : (
        <p className="mt-4 text-sm text-red-600">Odkaz pro odhlášení je neplatný nebo vypršel.</p>
      )}
      <Link href="/" className="mt-6 inline-block text-sm font-semibold text-orange-700 hover:underline">
        ← Na úvod
      </Link>
    </div>
  );
}
