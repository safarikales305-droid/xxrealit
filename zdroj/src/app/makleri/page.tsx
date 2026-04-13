'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestListPublicBrokers, type NestPublicBrokerCard } from '@/lib/nest-client';

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-hidden>
      {Array.from({ length: max }, (_, i) => (i < full ? '★' : '☆')).join('')}
    </span>
  );
}

export default function MakleriPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const [rows, setRows] = useState<NestPublicBrokerCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login?redirect=%2Fmakleri');
      return;
    }
    void nestListPublicBrokers(apiAccessToken).then((r) => {
      if (!r) {
        setErr('Katalog makléřů se nepodařilo načíst. Zkontrolujte připojení k API.');
        setRows([]);
        return;
      }
      setErr(null);
      setRows(r);
    });
  }, [apiAccessToken, isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-600">Načítání…</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">Makléři</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Veřejné profily makléřů, kteří se rozhodli být v katalogu vidět.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-4xl px-4 sm:px-6">
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {rows === null ? (
          <p className="text-sm text-zinc-500">Načítám…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600">
            Zatím tu není žádný veřejný profil makléře.
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((b) => {
              const img =
                b.avatarUrl && b.avatarUrl.trim()
                  ? /^https?:\/\//i.test(b.avatarUrl)
                    ? b.avatarUrl
                    : nestAbsoluteAssetUrl(b.avatarUrl) || b.avatarUrl
                  : null;
              return (
                <li key={b.slug}>
                  <Link
                    href={`/makler/${encodeURIComponent(b.slug)}`}
                    className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                  >
                    <div className="size-16 shrink-0 overflow-hidden rounded-full bg-zinc-100">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-lg font-semibold text-zinc-400">
                          {(b.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{b.name ?? 'Makléř'}</p>
                      {b.officeName ? (
                        <p className="text-sm text-zinc-600">{b.officeName}</p>
                      ) : null}
                      {b.regionLabel ? (
                        <p className="mt-1 text-xs text-zinc-500">{b.regionLabel}</p>
                      ) : null}
                      {b.ratingAverage != null && b.ratingCount != null ? (
                        <p className="mt-2 text-sm text-zinc-700">
                          <Stars value={b.ratingAverage} />{' '}
                          <span className="font-medium">{b.ratingAverage.toFixed(1)}</span>
                          <span className="text-zinc-500"> ({b.ratingCount})</span>
                        </p>
                      ) : null}
                      {b.bioExcerpt ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-600">
                          {b.bioExcerpt}
                          {(b.bioExcerpt?.length ?? 0) >= 160 ? '…' : ''}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
