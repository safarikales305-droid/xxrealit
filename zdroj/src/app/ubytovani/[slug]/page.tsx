import type { Metadata } from 'next';
import { AccommodationListingClient } from '@/components/accommodation/AccommodationListingClient';
import { AccommodationDetailView } from '@/components/accommodation/AccommodationDetailView';
import { AccommodationHotelNotFound } from '@/components/accommodation/AccommodationEmptyStates';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import {
  ACCOMMODATION_CATEGORY_SLUGS,
  ACCOMMODATION_LOCATION_SLUGS,
  ACCOMMODATION_PAGE_SIZE,
  accommodationCategoryLabel,
} from '@/lib/accommodation-categories';
import {
  fetchAccommodationDetail,
  fetchAccommodations,
} from '@/lib/accommodation-client';
import {
  fetchHotelbedsConfig,
  fetchHotelbedsDetail,
  fetchHotelbedsSearch,
  isHotelbedsSlug,
} from '@/lib/hotelbeds-client';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (ACCOMMODATION_CATEGORY_SLUGS.has(slug) || ACCOMMODATION_LOCATION_SLUGS.has(slug)) {
    return {
      title: `${accommodationCategoryLabel(slug)} | Ubytování | XXREALIT`,
      robots: { index: false },
    };
  }
  const hbConfig = await fetchHotelbedsConfig().catch(() => null);
  const detail =
    hbConfig?.publicListings && isHotelbedsSlug(slug)
      ? await fetchHotelbedsDetail(slug).catch(() => null)
      : await fetchAccommodationDetail(slug).catch(() => null);
  if (!detail) return { title: 'Ubytování | XXREALIT' };
  return {
    title: detail.seoTitle ?? `${detail.name} | Ubytování | XXREALIT`,
    description: detail.seoDescription ?? detail.shortDescription ?? undefined,
    alternates: { canonical: `https://www.xxrealit.cz/ubytovani/${slug}` },
    openGraph: {
      title: detail.name,
      description: detail.shortDescription ?? undefined,
      images: detail.coverPhoto ? [{ url: detail.coverPhoto }] : undefined,
    },
  };
}

export default async function UbytovaniSlugPage({ params }: Props) {
  const { slug } = await params;
  const hbConfig = await fetchHotelbedsConfig().catch(() => null);
  const useHotelbeds = hbConfig?.publicListings === true;

  if (ACCOMMODATION_CATEGORY_SLUGS.has(slug)) {
    let initialItems: Awaited<ReturnType<typeof fetchHotelbedsSearch>>['items'] = [];
    let initialTotal = 0;
    let ssrLoaded = false;
    if (useHotelbeds) {
      const res = await fetchHotelbedsSearch({ category: slug, limit: ACCOMMODATION_PAGE_SIZE, page: 1 }).catch(() => null);
      if (res) {
        initialItems = res.items;
        initialTotal = res.total;
        ssrLoaded = true;
      }
    } else {
      const res = await fetchAccommodations({ category: slug, limit: ACCOMMODATION_PAGE_SIZE }).catch(() => null);
      if (res) {
        initialItems = res.items;
        initialTotal = res.total;
        ssrLoaded = true;
      }
    }
    return (
      <Shell title={`Ubytování — ${accommodationCategoryLabel(slug)}`}>
        <AccommodationListingClient
          category={slug}
          initialItems={initialItems}
          initialTotal={initialTotal}
          useHotelbeds={useHotelbeds}
          emptyCategoryLabel={accommodationCategoryLabel(slug)}
          ssrPrefetched={ssrLoaded}
        />
      </Shell>
    );
  }

  if (ACCOMMODATION_LOCATION_SLUGS.has(slug)) {
    let initialItems: Awaited<ReturnType<typeof fetchHotelbedsSearch>>['items'] = [];
    let initialTotal = 0;
    let ssrLoaded = false;
    if (useHotelbeds) {
      const res = await fetchHotelbedsSearch({
        destination: slug.replace(/-/g, ' '),
        limit: ACCOMMODATION_PAGE_SIZE,
        page: 1,
      }).catch(() => null);
      if (res) {
        initialItems = res.items;
        initialTotal = res.total;
        ssrLoaded = true;
      }
    } else {
      const res = await fetchAccommodations({ locationSlug: slug, limit: ACCOMMODATION_PAGE_SIZE }).catch(() => null);
      if (res) {
        initialItems = res.items;
        initialTotal = res.total;
        ssrLoaded = true;
      }
    }
    return (
      <Shell title={`Ubytování — ${slug.replace(/-/g, ' ')}`}>
        <AccommodationListingClient
          locationSlug={slug}
          initialItems={initialItems}
          initialTotal={initialTotal}
          useHotelbeds={useHotelbeds}
          ssrPrefetched={ssrLoaded}
        />
      </Shell>
    );
  }

  if (useHotelbeds && isHotelbedsSlug(slug)) {
    const detail = await fetchHotelbedsDetail(slug).catch(() => null);
    if (!detail) {
      return (
        <Shell title="Ubytování">
          <AccommodationHotelNotFound />
        </Shell>
      );
    }
    return (
      <Shell title={detail.name} hideTitle>
        <AccommodationDetailView item={detail} />
      </Shell>
    );
  }

  const detail = await fetchAccommodationDetail(slug);
  if (!detail) {
    return (
      <Shell title="Ubytování">
        <AccommodationHotelNotFound />
      </Shell>
    );
  }

  return (
    <Shell title={detail.name} hideTitle>
      <AccommodationDetailView item={detail} />
    </Shell>
  );
}

function Shell({
  title,
  children,
  hideTitle = false,
}: {
  title: string;
  children: React.ReactNode;
  hideTitle?: boolean;
}) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <PublicHeader activeSection="accommodation" />
      <main className="mx-auto max-w-[100rem] px-4 py-6">
        {hideTitle ? null : (
          <h1 className="mb-4 text-2xl font-bold capitalize text-zinc-900 md:text-3xl">{title}</h1>
        )}
        {children}
      </main>
    </div>
  );
}
