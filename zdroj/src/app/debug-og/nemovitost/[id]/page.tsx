import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { facebookDebuggerUrl, listingPublicDetailUrl } from '@/lib/listing-og-metadata';
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
  const d = await nestOgDebug(id);
  if (!d) notFound();

  const publicUrl = d.publicUrl || listingPublicDetailUrl(id);
  const ogImage = d.selectedOgImage || d.ogImage || d.image || '';

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 font-sans text-zinc-900">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href={`/nemovitost/${encodeURIComponent(id)}`} className="text-orange-600 hover:underline">
          ← Detail inzerátu
        </Link>
      </p>

      <h1 className="text-2xl font-bold">Open Graph debug</h1>

      {d.warning ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>{d.warning}</strong>
        </div>
      ) : d.isLogoFallback ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          isLogoFallback = true — použito logo portálu.
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          OG obrázek OK — zdroj: <strong>{d.selectedSource}</strong>
        </div>
      )}

      <dl className="mt-6 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
        <div><dt className="font-semibold text-zinc-500">selectedOgImage</dt><dd className="mt-1 break-all font-mono text-xs">{ogImage}</dd></div>
        <div><dt className="font-semibold text-zinc-500">selectedSource</dt><dd className="mt-1">{d.selectedSource}</dd></div>
        <div><dt className="font-semibold text-zinc-500">thumbnailUrl</dt><dd className="mt-1 break-all text-xs">{d.thumbnailUrl ?? '—'}</dd></div>
        <div><dt className="font-semibold text-zinc-500">mainImage</dt><dd className="mt-1 break-all text-xs">{d.mainImage ?? '—'}</dd></div>
        <div><dt className="font-semibold text-zinc-500">firstGalleryImage</dt><dd className="mt-1 break-all text-xs">{d.firstGalleryImage ?? '—'}</dd></div>
        <div><dt className="font-semibold text-zinc-500">videoThumbnail</dt><dd className="mt-1 break-all text-xs">{d.videoThumbnail ?? '—'}</dd></div>
        <div><dt className="font-semibold text-zinc-500">isLogoFallback</dt><dd className="mt-1">{d.isLogoFallback ? 'ano' : 'ne'}</dd></div>
      </dl>

      {ogImage ? (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold">Náhled</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ogImage} alt="" className="max-h-80 w-full rounded-xl border object-cover" />
        </div>
      ) : null}

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
        {JSON.stringify(d, null, 2)}
      </pre>
    </main>
  );
}
