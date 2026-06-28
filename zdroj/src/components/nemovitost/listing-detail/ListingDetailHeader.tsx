'use client';

import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { TipDetailBadge } from '@/components/listing/TipBadges';
import type { PropertyFeedItem } from '@/types/property';
import { pricePerSqm, renderStars } from './listing-detail-utils';
import type { PropertyDetailAuthor } from '@/lib/property-detail';

type Props = {
  property: PropertyFeedItem;
  extraFields: Record<string, unknown>;
  author: PropertyDetailAuthor;
  isAuthenticated: boolean;
  isTip: boolean;
  showOwnerBadges: boolean;
};

export function ListingDetailHeader({
  property: p,
  extraFields,
  author,
  isAuthenticated,
  isTip,
  showOwnerBadges,
}: Props) {
  const ppm = pricePerSqm(p.price, extraFields.area);
  const offer = String(extraFields.offerType ?? extraFields.type ?? 'prodej');
  const condition = extraFields.condition ? String(extraFields.condition) : null;
  const views = p.viewsCount ?? extraFields.viewsCount;

  const rating = author.brokerReviewAverage ?? 0;
  const reviewCount = author.brokerReviewCount ?? 0;

  return (
    <header className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{p.title}</h1>
          <p className="text-base text-zinc-600">
            {p.address?.trim() ? (
              <>
                <span className="font-medium text-zinc-800">{p.address.trim()}</span>
                {p.location ? <span className="text-zinc-500"> · {p.location}</span> : null}
              </>
            ) : (
              p.location
            )}
          </p>
          {showOwnerBadges ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                Přímý vlastník
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
                Bez realitky
              </span>
            </div>
          ) : null}
          {isTip ? (
            <div className="pt-1">
              <TipDetailBadge />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <div className="hidden lg:block">
            <ListingPriceDisplay
              as="div"
              price={p.price}
              isAuthenticated={isAuthenticated}
              className="text-3xl font-bold text-[#e85d00] sm:text-4xl"
              labelClassName="sr-only"
              valueClassName=""
            />
            <div className="mt-2 space-y-0.5 text-sm text-zinc-600 lg:text-right">
              {ppm != null && isAuthenticated ? (
                <p>
                  Cena za m²:{' '}
                  <strong className="text-zinc-900">{ppm.toLocaleString('cs-CZ')} Kč/m²</strong>
                </p>
              ) : null}
              <p>
                Typ nabídky: <strong className="text-zinc-900">{offer}</strong>
              </p>
              {condition ? (
                <p>
                  Stav: <strong className="text-zinc-900">{condition}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <div className="w-full rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm lg:min-w-[220px] lg:text-right">
            {rating > 0 ? (
              <p className="text-amber-500" aria-label={`Hodnocení ${rating} z 5`}>
                {renderStars(rating)}{' '}
                <span className="text-zinc-600">
                  ({reviewCount} {reviewCount === 1 ? 'hodnocení' : 'hodnocení'})
                </span>
              </p>
            ) : (
              <p className="text-zinc-500">Hodnocení zatím není k dispozici</p>
            )}
            {author.professionalVerified ? (
              <p className="mt-1 font-semibold text-emerald-700">Ověřený makléř</p>
            ) : null}
            {typeof views === 'number' && views > 0 ? (
              <p className="mt-1 text-zinc-500">{views.toLocaleString('cs-CZ')} zobrazení</p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
