'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestFetchPublicVerifiedAgent, type NestPublicVerifiedAgent } from '@/lib/nest-client';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

export default function VerifiedAgentPublicPage() {
  const params = useParams();
  const userId = typeof params?.userId === 'string' ? params.userId : '';
  const { apiAccessToken } = useAuth();
  const [data, setData] = useState<NestPublicVerifiedAgent | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId.trim()) return;
    setLoadErr(null);
    const d = await nestFetchPublicVerifiedAgent(userId, apiAccessToken);
    if (!d) {
      setLoadErr('Profil nebyl nalezen nebo makléř není ověřen.');
      setData(null);
      return;
    }
    setData(d);
  }, [userId, apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const avatar =
    data?.avatarUrl && data.avatarUrl.trim()
      ? /^https?:\/\//i.test(data.avatarUrl)
        ? data.avatarUrl
        : nestAbsoluteAssetUrl(data.avatarUrl) || data.avatarUrl
      : null;

  const listings: PropertyFeedItem[] = [];
  if (data?.listings && Array.isArray(data.listings)) {
    for (const row of data.listings) {
      const n = safeNormalizePropertyFromApi(row);
      if (n) listings.push(n);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-20 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
      </div>

      {loadErr || !data ? (
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <p className="text-center text-sm text-zinc-600">{loadErr ?? 'Načítám…'}</p>
        </div>
      ) : (
        <>
          <div className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
                <div className="mx-auto size-28 shrink-0 overflow-hidden rounded-full border-2 border-zinc-100 bg-zinc-100 sm:mx-0 sm:size-32">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-2xl font-semibold text-zinc-400">
                      {data.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                      {data.displayName}
                    </h1>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Ověřený makléř
                    </span>
                  </div>
                  {data.personName?.trim() &&
                  data.displayName.trim() !== data.personName.trim() ? (
                    <p className="mt-1 text-sm text-zinc-600">{data.personName}</p>
                  ) : null}
                  <p className="mt-3 text-sm text-zinc-600">
                    <span className="font-medium text-zinc-800">{data.city}</span>
                    {data.phone ? (
                      <>
                        {' '}
                        ·{' '}
                        <a href={`tel:${data.phone}`} className="text-[#e85d00] hover:underline">
                          {data.phone}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {data.website ? (
                    <p className="mt-2 text-sm">
                      <a
                        href={
                          data.website.startsWith('http')
                            ? data.website
                            : `https://${data.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#e85d00] hover:underline"
                      >
                        Webové stránky
                      </a>
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    Telefon:{' '}
                    {data.phoneVerified ? (
                      <span className="font-medium text-emerald-800">ověřen</span>
                    ) : (
                      <span className="font-medium text-zinc-600">neověřen (SMS připravujeme)</span>
                    )}
                  </p>
                  {data.bio ? (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                      {data.bio}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Inzeráty makléře</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-zinc-500">Zatím žádné veřejné inzeráty.</p>
            ) : (
              <PropertyGrid properties={listings} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
