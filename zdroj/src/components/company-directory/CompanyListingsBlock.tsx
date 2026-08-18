'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { PropertyFeedItem } from '@/types/property';
import { classicListingCoverUrl } from '@/types/property';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  companyName?: string;
  city?: string | null;
  region?: string | null;
  initialListings?: PropertyFeedItem[];
  companyListings?: PropertyFeedItem[];
};

function formatPrice(price: number | null, currency?: string | null): string {
  if (price == null || !Number.isFinite(price)) return 'Cena na dotaz';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency === 'EUR' ? 'EUR' : 'CZK',
    maximumFractionDigits: 0,
  }).format(price);
}

function listingHref(item: PropertyFeedItem): string {
  const slug = (item as PropertyFeedItem & { slug?: string }).slug;
  return slug ? `/nemovitosti/${slug}` : `/nemovitost/${item.id}`;
}

function ListingCard({ item }: { item: PropertyFeedItem }) {
  const cover = classicListingCoverUrl(item);
  const href = listingHref(item);
  const hasVideo = Boolean(item.videoUrl?.trim());

  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-orange-200 hover:shadow-md"
      >
        <div className="relative aspect-[4/3] w-full bg-zinc-100">
          {cover ? (
            <Image
              src={nestAbsoluteAssetUrl(cover)}
              alt={item.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 80vw, 280px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-400">
              Bez fotky
            </div>
          )}
          {hasVideo ? (
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
              ▶ Video
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</h3>
          <p className="mt-1 text-xs text-zinc-600">{item.location || '—'}</p>
          <p className="mt-2 text-sm font-semibold text-orange-600">
            {formatPrice(item.price, (item as PropertyFeedItem & { currency?: string }).currency)}
          </p>
          <span className="mt-auto pt-2 text-xs font-semibold text-orange-700">Detail nemovitosti</span>
        </div>
      </Link>
    </li>
  );
}

export function CompanyListingsBlock({
  companyName,
  city,
  region,
  initialListings = [],
  companyListings = [],
}: Props) {
  const own = companyListings.slice(0, 6);
  const nearby = initialListings
    .filter((item) => !own.some((o) => o.id === item.id))
    .slice(0, 6);
  const listings = own.length > 0 ? own : nearby;
  const sectionTitle =
    own.length > 0 ? 'Nabídky této firmy' : 'Aktuální nabídky nemovitostí';
  const subtitle =
    own.length > 0
      ? 'Nemovitosti přímo navázané na profil firmy'
      : city
        ? `Relevantní nabídky v okolí${region ? ` (${region})` : ''}`
        : 'Nejnovější veřejné nabídky na portálu';

  if (!listings.length) {
    return (
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">Aktuální nabídky nemovitostí</h2>
        <p className="mt-2 text-sm text-zinc-600">
          {city
            ? `V lokalitě ${city} momentálně nemáme aktivní nabídku.`
            : 'Momentálně nemáme aktivní nabídky pro tuto firmu.'}
        </p>
        <Link
          href={city ? `/nemovitosti?location=${encodeURIComponent(city)}` : '/nemovitosti'}
          className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:underline"
        >
          {city ? `Reality v ${city}` : 'Zobrazit další reality'}
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">{sectionTitle}</h2>
          <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
        </div>
        {companyName ? (
          <p className="text-xs text-zinc-500">{companyName}</p>
        ) : null}
      </div>

      <ul className="mt-4 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {listings.map((item) => (
          <div key={item.id} className="w-[min(280px,80vw)] shrink-0 sm:w-auto sm:shrink">
            <ListingCard item={item} />
          </div>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          href={city ? `/nemovitosti?location=${encodeURIComponent(city)}` : '/nemovitosti'}
          className="font-semibold text-orange-700 hover:underline"
        >
          {city ? `Reality v ${city}` : 'Zobrazit další reality'}
        </Link>
      </div>
    </section>
  );
}
