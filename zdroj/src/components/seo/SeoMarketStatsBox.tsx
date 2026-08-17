type MarketStats = {
  listingCount: number;
  averagePrice: number | null;
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  pricePerM2: number | null;
  updatedAt: string;
  hasEnoughData: boolean;
};

function formatPrice(value: number | null): string {
  if (value == null || value <= 0) return '—';
  return `${new Intl.NumberFormat('cs-CZ').format(value)} Kč`;
}

export function SeoMarketStatsBox({ stats }: { stats: MarketStats }) {
  if (!stats.hasEnoughData) {
    return (
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="text-lg font-bold text-zinc-900">Aktuální přehled trhu</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Pro tuto lokalitu zatím nemáme dostatek nabídek pro spolehlivý cenový průměr.
        </p>
        {stats.listingCount > 0 ? (
          <p className="mt-2 text-sm text-zinc-700">Aktivních nabídek: {stats.listingCount}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-orange-100 bg-orange-50/40 p-5">
      <h2 className="text-lg font-bold text-zinc-900">Aktuální přehled</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-zinc-500">Nabídek</dt>
          <dd className="text-lg font-semibold text-zinc-900">{stats.listingCount}</dd>
        </div>
        {stats.medianPrice != null ? (
          <div>
            <dt className="text-xs text-zinc-500">Medián</dt>
            <dd className="text-lg font-semibold text-zinc-900">{formatPrice(stats.medianPrice)}</dd>
          </div>
        ) : null}
        {stats.averagePrice != null ? (
          <div>
            <dt className="text-xs text-zinc-500">Průměrná cena</dt>
            <dd className="text-lg font-semibold text-zinc-900">{formatPrice(stats.averagePrice)}</dd>
          </div>
        ) : null}
        {stats.pricePerM2 != null ? (
          <div>
            <dt className="text-xs text-zinc-500">Cena za m²</dt>
            <dd className="text-lg font-semibold text-zinc-900">{formatPrice(stats.pricePerM2)} / m²</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-zinc-500">
        Poslední aktualizace: {new Date(stats.updatedAt).toLocaleString('cs-CZ')} · data z inzerátů XXREALIT
      </p>
    </section>
  );
}
