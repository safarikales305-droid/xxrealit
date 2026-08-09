import Link from 'next/link';
import Logo from '@/components/Logo';
import { ContentTypeTabs } from '@/components/accommodation/ContentTypeTabs';

export default function UbytovaniNotFound() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between px-4 py-3">
          <Link href="/" aria-label="XXREALIT domů">
            <Logo />
          </Link>
          <Link href="/ubytovani" className="text-sm font-medium text-orange-600">
            ← Ubytování
          </Link>
        </div>
      </header>
      <ContentTypeTabs activeTab="accommodation" />
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-5xl font-bold text-orange-500">404</p>
        <h1 className="mt-3 text-xl font-semibold text-zinc-900">Stránka ubytování nenalezena</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Tato adresa v sekci ubytování neexistuje. Zkuste vyhledat hotel nebo se vraťte na výpis.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/ubytovani"
            className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Zpět na ubytování
          </Link>
          <Link
            href="/ubytovani"
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Zobrazit všechny hotely
          </Link>
        </div>
      </main>
    </div>
  );
}
