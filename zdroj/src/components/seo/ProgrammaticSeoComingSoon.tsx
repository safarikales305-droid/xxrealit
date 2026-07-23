import Link from 'next/link';

type Props = {
  locationName: string;
  intentLabel: string;
};

export function ProgrammaticSeoComingSoon({ locationName, intentLabel }: Props) {
  return (
    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Nabídka se průběžně doplňuje
          </p>
          <h2 className="mt-2 text-xl font-bold text-zinc-900 sm:text-2xl">
            Právě připravujeme nabídky z {locationName}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Tato stránka je plnohodnotný průvodce lokalitou a trhem s {intentLabel.toLowerCase()}.
            Jakmile se objeví první inzeráty, zobrazí se zde automaticky — bez nutnosti ruční úpravy.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:max-w-md">
          <li>
            <Link
              href="/registrace"
              className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-orange-300 hover:shadow"
            >
              <span className="text-lg">🔔</span>
              Nastavit hlídacího psa
            </Link>
          </li>
          <li>
            <Link
              href="/pridat-inzerat"
              className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-orange-300 hover:shadow"
            >
              <span className="text-lg">➕</span>
              Přidat vlastní inzerát zdarma
            </Link>
          </li>
          <li className="sm:col-span-2">
            <Link
              href="/makleri"
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-orange-300 hover:shadow"
            >
              <span className="text-lg">🏠</span>
              Nabídnout svou nemovitost přes makléře
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
