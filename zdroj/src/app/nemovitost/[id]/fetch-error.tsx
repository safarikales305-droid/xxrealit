'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
  listingDetailBackTarget,
  parseListingDetailSource,
} from '@/lib/listing-detail-navigation';
import { logListingDetailNavigation } from '@/lib/listing-detail-debug';

export function PropertyDetailFetchError({
  listingId,
  status,
  source: sourceRaw,
}: {
  listingId: string;
  status: number;
  source?: string | null;
}) {
  const sp = new URLSearchParams();
  if (sourceRaw?.trim()) sp.set('source', sourceRaw.trim());
  const source = parseListingDetailSource(sp);
  const back = listingDetailBackTarget(source);
  const inactive = status === 410;
  const notFound = status === 404;

  useEffect(() => {
    logListingDetailNavigation('detail-fetch-error', {
      listingId,
      status,
      inactive,
      notFound,
      currentHost: window.location.host,
    });
  }, [listingId, status, inactive, notFound]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">
        {inactive
          ? 'Inzerát již není aktivní'
          : notFound
            ? 'Inzerát nebyl nalezen'
            : 'Inzerát se nepodařilo načíst'}
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        {inactive
          ? 'Tento inzerát byl vypnut, expiroval nebo již není veřejně dostupný.'
          : notFound
            ? 'Inzerát mohl být smazán, není veřejný nebo má neplatný odkaz.'
            : 'Inzerát se nepodařilo načíst. Zkuste obnovit stránku.'}
      </p>
      {!inactive && status > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">Chyba serveru ({status})</p>
      ) : null}
      <p className="mt-2 break-all text-xs text-zinc-400">ID: {listingId}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {!inactive ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
          >
            Obnovit stránku
          </button>
        ) : null}
        <Link
          href={inactive ? '/nemovitosti' : back.href}
          className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          {inactive ? 'Zpět na inzeráty' : back.label.replace(/^←\s*/, '')}
        </Link>
      </div>
    </div>
  );
}
