'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Map, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchAccommodations,
  toggleAccommodationFavorite,
  type AccommodationItem,
} from '@/lib/accommodation-client';
import {
  defaultHotelbedsSearchParams,
  fetchHotelbedsConfig,
  fetchHotelbedsMapMarkers,
  fetchHotelbedsSearch,
} from '@/lib/hotelbeds-client';
import { ACCOMMODATION_PAGE_SIZE } from '@/lib/accommodation-categories';
import { AccommodationCategoryEmptyState } from './AccommodationEmptyStates';
import { AccommodationCard, AccommodationCardSkeleton } from './AccommodationCard';
import { AccommodationCategoryChips } from './ContentTypeTabs';
import {
  AccommodationSearchBar,
  AccommodationSidebarFilters,
  type AccommodationFilterState,
} from './AccommodationFilters';

const LOCATION_LABELS: Record<string, string> = {
  praha: 'Praha',
  brno: 'Brno',
  'karlovy-vary': 'Karlovy Vary',
  'cesky-krumlov': 'Český Krumlov',
};

type Props = {
  category?: string;
  locationSlug?: string;
  initialItems?: AccommodationItem[];
  initialTotal?: number;
  hideTopSearch?: boolean;
  useHotelbeds?: boolean;
  emptyCategoryLabel?: string;
};

export function AccommodationListingClient({
  category,
  locationSlug,
  initialItems = [],
  initialTotal = 0,
  hideTopSearch = false,
  useHotelbeds: useHotelbedsProp,
  emptyCategoryLabel,
}: Props) {
  const searchParams = useSearchParams();
  const defaults = defaultHotelbedsSearchParams();
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [useHotelbeds, setUseHotelbeds] = useState(useHotelbedsProp ?? false);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [markers, setMarkers] = useState<
    Array<{ id: string; slug: string; name: string; latitude: number; longitude: number; priceFrom: number | null }>
  >([]);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  const [filters, setFilters] = useState<AccommodationFilterState>({
    q: searchParams.get('q') ?? (locationSlug ? LOCATION_LABELS[locationSlug] ?? locationSlug.replace(/-/g, ' ') : ''),
    checkIn: searchParams.get('checkIn') ?? defaults.checkIn,
    checkOut: searchParams.get('checkOut') ?? defaults.checkOut,
    guests: Number(searchParams.get('guests')) || defaults.adults,
    rooms: Number(searchParams.get('rooms')) || defaults.rooms,
    priceMin: searchParams.get('priceMin') ?? '',
    priceMax: searchParams.get('priceMax') ?? '',
    ratingMin: searchParams.get('ratingMin') ?? '',
    wifi: searchParams.get('wifi') === '1',
    parking: searchParams.get('parking') === '1',
    breakfast: searchParams.get('breakfast') === '1',
    wellness: searchParams.get('wellness') === '1',
    pool: searchParams.get('pool') === '1',
    pets: searchParams.get('pets') === '1',
    accessible: searchParams.get('accessible') === '1',
  });

  useEffect(() => {
    if (useHotelbedsProp != null) return;
    void fetchHotelbedsConfig().then((cfg) => {
      if (cfg?.publicListings) setUseHotelbeds(true);
    });
  }, [useHotelbedsProp]);

  const destination = filters.q || defaults.destination;

  const load = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        if (useHotelbeds) {
          const res = await fetchHotelbedsSearch({
            destination,
            checkIn: filters.checkIn || defaults.checkIn,
            checkOut: filters.checkOut || defaults.checkOut,
            adults: filters.guests,
            rooms: filters.rooms,
            page: pageNum,
            limit: ACCOMMODATION_PAGE_SIZE,
            category: category || undefined,
            priceMax: Number(filters.priceMax) || undefined,
            wifi: filters.wifi,
            parking: filters.parking,
            breakfast: filters.breakfast,
            wellness: filters.wellness,
            pool: filters.pool,
            pets: filters.pets,
            accessible: filters.accessible,
            ratingMin: Number(filters.ratingMin) || undefined,
          });
          setItems((prev) => (append ? [...prev, ...res.items] : res.items));
          setTotal(res.total);
          setPage(pageNum);
        } else {
          const res = await fetchAccommodations(
            {
              q: filters.q || undefined,
              category: category || undefined,
              locationSlug: locationSlug || undefined,
              priceMin: Number(filters.priceMin) || undefined,
              priceMax: Number(filters.priceMax) || undefined,
              ratingMin: Number(filters.ratingMin) || undefined,
              page: pageNum,
              limit: ACCOMMODATION_PAGE_SIZE,
              wifi: filters.wifi,
              parking: filters.parking,
              breakfast: filters.breakfast,
              wellness: filters.wellness,
              pool: filters.pool,
            },
            apiAccessToken,
          );
          setItems((prev) => (append ? [...prev, ...res.items] : res.items));
          setTotal(res.total);
          setPage(pageNum);
        }
      } catch {
        setError('Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [apiAccessToken, category, destination, filters, locationSlug, useHotelbeds, defaults],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  useEffect(() => {
    if (view !== 'map') return;
    if (useHotelbeds) {
      void fetchHotelbedsMapMarkers({
        destination,
        checkIn: filters.checkIn || defaults.checkIn,
        checkOut: filters.checkOut || defaults.checkOut,
        adults: filters.guests,
        rooms: filters.rooms,
      }).then(setMarkers);
    } else {
      void import('@/lib/accommodation-client').then((m) =>
        m.fetchAccommodationMapMarkers({
          q: filters.q || undefined,
          category: category || undefined,
          city: locationSlug,
        }).then(setMarkers),
      );
    }
  }, [view, filters, category, locationSlug, useHotelbeds, destination, defaults]);

  async function handleFavorite(id: string) {
    if (!isAuthenticated || !apiAccessToken || useHotelbeds) return;
    setFavoritingId(id);
    try {
      const res = await toggleAccommodationFavorite(apiAccessToken, id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, favorited: res.favorited } : i)));
    } finally {
      setFavoritingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {!hideTopSearch ? (
        <>
          <div className="md:hidden">
            <AccommodationSearchBar compact initial={filters} onApply={setFilters} />
          </div>
          <div className="hidden md:block">
            <AccommodationSearchBar initial={filters} onApply={setFilters} />
          </div>
        </>
      ) : null}

      {!useHotelbeds ? <AccommodationCategoryChips active={category} /> : (
        <AccommodationCategoryChips active={category} />
      )}

      <div className="flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setShowMobileFilters(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium"
        >
          <SlidersHorizontal className="size-4" />
          Filtry
        </button>
        <button
          type="button"
          onClick={() => setView((v) => (v === 'list' ? 'map' : 'list'))}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium"
        >
          <Map className="size-4" />
          {view === 'list' ? 'Mapa' : 'Seznam'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="hidden lg:block">
          <AccommodationSidebarFilters
            filters={filters}
            onChange={setFilters}
            onApply={() => void load(1, false)}
          />
        </div>

        <div className="space-y-4">
          <div className="hidden items-center justify-between md:flex">
            <p className="text-sm text-zinc-600">
              {items.length} z {total} nabídek
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'list' ? 'bg-orange-500 text-white' : 'bg-zinc-100'}`}
              >
                Seznam
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'map' ? 'bg-orange-500 text-white' : 'bg-zinc-100'}`}
              >
                Mapa
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : null}

          {view === 'map' ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                {markers.length === 0 ? (
                  <p className="col-span-full py-8 text-center text-sm text-zinc-600">
                    Žádné body na mapě pro aktuální hledání.
                  </p>
                ) : (
                  markers.map((m) => (
                    <a
                      key={m.id}
                      href={`/ubytovani/${m.slug}`}
                      className="rounded-xl border border-zinc-200 bg-white p-3 text-sm hover:border-orange-300"
                    >
                      <p className="font-semibold">{m.name}</p>
                      {m.priceFrom != null ? (
                        <p className="text-orange-700">od {m.priceFrom.toLocaleString('cs-CZ')} Kč / noc</p>
                      ) : null}
                    </a>
                  ))
                )}
              </div>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <AccommodationCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 && !loading ? (
            category && emptyCategoryLabel ? (
              <AccommodationCategoryEmptyState
                title={`Pro kategorii „${emptyCategoryLabel}“ nyní nemáme dostupné nabídky`}
              />
            ) : (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-600">
                Pro zadané období nebylo nalezeno žádné ubytování. Zkuste jiný termín nebo destinaci.
              </p>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <AccommodationCard
                  key={item.id}
                  item={item}
                  onFavorite={isAuthenticated && !useHotelbeds ? handleFavorite : undefined}
                  favoriting={favoritingId === item.id}
                />
              ))}
            </div>
          )}

          {items.length < total ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(page + 1, true)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {loadingMore ? 'Načítám…' : 'Načíst další'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setShowMobileFilters(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <AccommodationSidebarFilters
              filters={filters}
              onChange={setFilters}
              onApply={() => {
                setShowMobileFilters(false);
                void load(1, false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
