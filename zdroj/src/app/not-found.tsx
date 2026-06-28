import type { Metadata } from 'next';
import Link from 'next/link';
import { buildSiteMetadata, pageTitle } from '@/lib/seo/metadata';

export const metadata: Metadata = buildSiteMetadata({
  title: pageTitle('Stránka nenalezena'),
  description: 'Požadovaná stránka na XXREALIT neexistuje. Vyhledejte nemovitosti nebo se vraťte na úvod.',
  path: '/404',
  noindex: true,
});

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fafafa] px-4 py-12 text-center text-zinc-900">
      <p className="text-6xl font-bold text-orange-500">404</p>
      <h1 className="text-2xl font-semibold">Stránka nenalezena</h1>
      <p className="max-w-md text-sm text-zinc-600">
        Tato adresa neexistuje nebo byla odstraněna. Zkuste vyhledat nemovitost nebo se vraťte na hlavní stránku.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/nemovitosti"
          className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Prohlížet nemovitosti
        </Link>
        <Link
          href="/"
          className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Domů
        </Link>
      </div>
    </div>
  );
}
