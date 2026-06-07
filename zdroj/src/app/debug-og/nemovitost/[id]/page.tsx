import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildListingOgDescription,
  buildListingOgTitle,
  facebookDebuggerUrl,
  listingPublicDetailUrl,
} from '@/lib/listing-og-metadata';
import { nestOgDebug } from '@/lib/nest-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `OG debug · ${id}`,
    robots: { index: false, follow: false },
  };
}

export default async function DebugOgPropertyPage({ params }: Props) {
  const { id } = await params;
  const apiDebug = await nestOgDebug(id);
  if (!apiDebug) notFound();

  const publicUrl = apiDebug.publicUrl || listingPublicDetailUrl(id);
  const ogTitle = apiDebug.title || buildListingOgTitle({ id, title: 'Inzerát' });
  const ogDescription = apiDebug.description || '';
  const ogImage = apiDebug.ogImage || apiDebug.image;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 font-sans text-zinc-900">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href={`/nemovitost/${encodeURIComponent(id)}`} className="text-orange-600 hover:underline">
          ← Detail inzerátu
        </Link>
      </p>

      <h1 className="text-2xl font-bold">Open Graph debug</h1>
      <p className="mt-1 text-sm text-zinc-600">Inzerát {id}</p>

      {apiDebug.usedFallbackLogo ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>usedFallbackLogo = true</strong> — chybí použitelná fotka inzerátu.
        </div>
      ) : apiDebug.isWhiteOrBlank ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aktuální og:image je bílý/prázdný — měl by se přepnout na galerii (source: {apiDebug.source}).
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          OG obrázek OK — zdroj: <strong>{apiDebug.source}</strong>
          {apiDebug.isPublic ? '' : ' (neveřejný!)'}
        </div>
      )}

      <dl className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
        <div>
          <dt className="font-semibold text-zinc-500">publicUrl</dt>
          <dd className="mt-1 break-all">
            <a href={publicUrl} className="text-orange-600 hover:underline">
              {publicUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">og:title</dt>
          <dd className="mt-1">{ogTitle}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">og:description</dt>
          <dd className="mt-1">{ogDescription}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">og:image</dt>
          <dd className="mt-1 break-all font-mono text-xs">{ogImage}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-zinc-500">imageStatus</dt>
            <dd className="mt-1">{apiDebug.imageStatus ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">contentType</dt>
            <dd className="mt-1">{apiDebug.contentType ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">contentLength</dt>
            <dd className="mt-1">{apiDebug.contentLength ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">width</dt>
            <dd className="mt-1">{apiDebug.width ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">height</dt>
            <dd className="mt-1">{apiDebug.height ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">isPublic</dt>
            <dd className="mt-1">{apiDebug.isPublic ? 'ano' : 'ne'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">isWhiteOrBlank</dt>
            <dd className="mt-1">{apiDebug.isWhiteOrBlank ? 'ano' : 'ne'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">source</dt>
            <dd className="mt-1">{apiDebug.source}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-zinc-700">Náhled og:image</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ogImage}
          alt="OG náhled"
          className="max-h-80 w-full rounded-xl border border-zinc-200 object-cover"
        />
      </div>

      <p className="mt-8">
        <a
          href={facebookDebuggerUrl(publicUrl)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Obnovit náhled Facebook (Scrape Again)
        </a>
      </p>

      <pre className="mt-8 overflow-x-auto rounded-xl bg-zinc-900 p-4 text-xs text-zinc-100">
        {JSON.stringify(apiDebug, null, 2)}
      </pre>
    </main>
  );
}
