import Link from 'next/link';

type Props = {
  title?: string;
  message?: string;
  showAllLink?: boolean;
};

export function AccommodationCategoryEmptyState({
  title = 'V této kategorii zatím nemáme dostupné nabídky',
  message = 'V této kategorii zatím nemáme dostupné nabídky z našeho partnerského zdroje.',
  showAllLink = true,
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">{message}</p>
      {showAllLink ? (
        <Link
          href="/ubytovani"
          className="mt-5 inline-flex rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Zobrazit všechna ubytování
        </Link>
      ) : null}
    </div>
  );
}

export function AccommodationHotelNotFound() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Hotel se momentálně nepodařilo načíst</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
        Zkuste to prosím za chvíli, nebo se vraťte na výpis ubytování.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/ubytovani"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Zpět na ubytování
        </Link>
        <Link
          href="/ubytovani"
          className="inline-flex rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
        >
          Zobrazit všechny hotely
        </Link>
      </div>
    </div>
  );
}
