'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { nestVerifyCompanyReview } from '@/lib/company-directory-client';

function VerifyReviewContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const reviewId = params.get('reviewId') ?? '';
  const slug = params.get('slug') ?? '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Ověřujeme email…');
  const [redirectSlug, setRedirectSlug] = useState<string | null>(slug || null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Chybí ověřovací token.');
      return;
    }
    void nestVerifyCompanyReview(token).then((res) => {
      if (res?.ok) {
        setStatus('ok');
        setMessage('Email byl ověřen. Recenze čeká na schválení administrátorem.');
        if (res.slug) setRedirectSlug(res.slug);
      } else {
        setStatus('error');
        setMessage(res?.error ?? 'Ověření se nezdařilo.');
      }
    });
  }, [token]);

  const reviewHref =
    redirectSlug && reviewId
      ? `/firmy/${redirectSlug}#review-${reviewId}`
      : redirectSlug
        ? `/firmy/${redirectSlug}#recenze`
        : '/firmy';

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-zinc-900">Ověření recenze</h1>
      <p
        className={`mt-4 text-sm ${
          status === 'error' ? 'text-red-600' : status === 'ok' ? 'text-emerald-700' : 'text-zinc-600'
        }`}
      >
        {message}
      </p>
      {status === 'ok' ? (
        <Link href={reviewHref} className="mt-6 inline-block text-sm font-semibold text-orange-700 hover:underline">
          Zobrazit recenzi u profilu firmy →
        </Link>
      ) : (
        <Link href="/firmy" className="mt-6 inline-block text-sm font-semibold text-orange-700 hover:underline">
          ← Zpět na registr firem
        </Link>
      )}
    </div>
  );
}

export default function VerifyCompanyReviewPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-zinc-500">Načítám…</div>}>
      <VerifyReviewContent />
    </Suspense>
  );
}
