import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import { AccommodationListingClient } from '@/components/accommodation/AccommodationListingClient';
import { AccommodationDetailView } from '@/components/accommodation/AccommodationDetailView';
import { ContentTypeTabs } from '@/components/accommodation/ContentTypeTabs';
import {
  ACCOMMODATION_CATEGORIES,
  fetchAccommodationDetail,
  fetchAccommodations,
} from '@/lib/accommodation-client';
import {
  fetchHotelbedsConfig,
  fetchHotelbedsDetail,
  fetchHotelbedsSearch,
  isHotelbedsSlug,
} from '@/lib/hotelbeds-client';

const CATEGORY_SLUGS = new Set<string>(
  ACCOMMODATION_CATEGORIES.map((c) => c.slug).filter(Boolean) as string[],
);
const LOCATION_SLUGS = new Set<string>([
  'praha',
  'brno',
  'krkonose',
  'lipno',
  'spindleruv-mlyn',
  'karlovy-vary',
  'cesky-krumlov',
]);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (CATEGORY_SLUGS.has(slug) || LOCATION_SLUGS.has(slug)) {
    return { title: `${slug.replace(/-/g, ' ')} | Ubytování | XXREALIT`, robots: { index: false } };
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

  if (CATEGORY_SLUGS.has(slug) && !useHotelbeds) {
    const res = await fetchAccommodations({ category: slug, limit: 12 }).catch(() => null);
    return (
      <Shell title={`Ubytování — ${slug}`}>
        <AccommodationListingClient
          category={slug}
          initialItems={res?.items ?? []}
          initialTotal={res?.total ?? 0}
        />
      </Shell>
    );
  }

  if (LOCATION_SLUGS.has(slug)) {
    let initialItems: Awaited<ReturnType<typeof fetchHotelbedsSearch>>['items'] = [];
    let initialTotal = 0;
    if (useHotelbeds) {
      const res = await fetchHotelbedsSearch({ destination: slug.replace(/-/g, ' '), limit: 12 }).catch(() => null);
      initialItems = res?.items ?? [];
      initialTotal = res?.total ?? 0;
    } else {
      const res = await fetchAccommodations({ locationSlug: slug, limit: 12 }).catch(() => null);
      initialItems = res?.items ?? [];
      initialTotal = res?.total ?? 0;
    }
    return (
      <Shell title={`Ubytování — ${slug.replace(/-/g, ' ')}`}>
        <AccommodationListingClient
          locationSlug={slug}
          initialItems={initialItems}
          initialTotal={initialTotal}
          useHotelbeds={useHotelbeds}
        />
      </Shell>
    );
  }

  if (useHotelbeds && isHotelbedsSlug(slug)) {
    const detail = await fetchHotelbedsDetail(slug).catch(() => null);
    if (!detail) notFound();
    return (
      <Shell title={detail.name}>
        <AccommodationDetailView item={detail} />
      </Shell>
    );
  }

  const detail = await fetchAccommodationDetail(slug);
  if (!detail) notFound();

  return (
    <Shell title={detail.name}>
      <AccommodationDetailView item={detail} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
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
      <ContentTypeTabs />
      <main className="mx-auto max-w-[100rem] px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold capitalize text-zinc-900 md:text-3xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}
