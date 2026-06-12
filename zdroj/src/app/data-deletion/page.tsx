import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Smazání uživatelských dat | XXRealit',
  description:
    'Jak požádat o smazání účtu a osobních údajů z portálu XXRealit v souladu s GDPR.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: 'https://xxrealit.cz/data-deletion',
  },
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-[100dvh] bg-[#fafafa] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="XXRealit — domů">
            <Logo className="h-7 w-auto sm:h-8" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-zinc-600 transition hover:text-[#e85d00]"
          >
            Přihlášení
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Drobečková navigace" className="text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="font-semibold text-[#e85d00] hover:underline">
                Domů
              </Link>
            </li>
            <li aria-hidden className="text-zinc-400">
              /
            </li>
            <li className="font-medium text-zinc-700">Smazání dat</li>
          </ol>
        </nav>

        <article className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Smazání uživatelských dat
          </h1>

          <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-zinc-700">
            <p>
              Společnost XXRealit respektuje právo uživatelů na ochranu osobních údajů v souladu s
              GDPR.
            </p>

            <p>
              Pokud chcete odstranit svůj účet a všechna uložená data z portálu XXRealit, můžete:
            </p>

            <ol className="list-decimal space-y-2 pl-5">
              <li>Smazat účet přímo v nastavení profilu.</li>
              <li>
                Odeslat žádost na e-mail:{' '}
                <a
                  href="mailto:info@xxrealit.cz"
                  className="font-semibold text-[#e85d00] hover:underline"
                >
                  info@xxrealit.cz
                </a>
              </li>
            </ol>

            <div>
              <p className="font-semibold text-zinc-900">Do žádosti uveďte:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>e-mail účtu</li>
                <li>jméno účtu</li>
                <li>telefonní číslo (pokud je uvedeno)</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-zinc-900">Po ověření identity budou odstraněna:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>profilová data</li>
                <li>příspěvky</li>
                <li>inzeráty</li>
                <li>fotografie</li>
                <li>videa</li>
                <li>zprávy</li>
                <li>marketingové souhlasy</li>
              </ul>
            </div>

            <p>
              Data budou odstraněna nejpozději do <strong>30 dnů</strong> od ověření žádosti.
            </p>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <p className="font-semibold text-zinc-900">Kontakt</p>
              <p className="mt-2">
                <a
                  href="mailto:info@xxrealit.cz"
                  className="font-semibold text-[#e85d00] hover:underline"
                >
                  info@xxrealit.cz
                </a>
              </p>
              <p className="mt-1">
                <a
                  href="https://xxrealit.cz"
                  className="font-semibold text-[#e85d00] hover:underline"
                  rel="noopener noreferrer"
                >
                  https://xxrealit.cz
                </a>
              </p>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
