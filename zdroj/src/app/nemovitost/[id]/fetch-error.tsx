'use client';

import Link from 'next/link';
import {
  listingDetailBackTarget,
  parseListingDetailSource,
} from '@/lib/listing-detail-navigation';

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

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">Inzerát se nepodařilo načíst</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Inzerát se nepodařilo načíst. Zkuste obnovit stránku.
      </p>
      {status > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">Chyba serveru ({status})</p>
      ) : null}
      <p className="mt-2 break-all text-xs text-zinc-400">ID: {listingId}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
        >
          Obnovit stránku
        </button>
        <Link
          href={back.href}
          className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          {back.label.replace(/^←\s*/, '')}
        </Link>
      </div>
    </div>
  );
}
