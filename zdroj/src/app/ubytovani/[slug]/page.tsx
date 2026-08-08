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
    return { title: `${slug.replace(/-/g, ' ')} | Ubytování | XXREALIT` };
  }
  const detail = await fetchAccommodationDetail(slug);
  if (!detail) return { title: 'Ubytování | XXREALIT' };
  return {
    title: detail.seoTitle ?? `${detail.name} | Ubytování | XXREALIT`,
    description: detail.seoDescription ?? detail.shortDescription ?? undefined,
    openGraph: {
      title: detail.name,
      description: detail.shortDescription ?? undefined,
      images: detail.coverPhoto ? [{ url: detail.coverPhoto }] : undefined,
    },
  };
}

export default async function UbytovaniSlugPage({ params }: Props) {
  const { slug } = await params;

  if (CATEGORY_SLUGS.has(slug)) {
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
    const res = await fetchAccommodations({ locationSlug: slug, limit: 12 }).catch(() => null);
    return (
      <Shell title={`Ubytování — ${slug.replace(/-/g, ' ')}`}>
        <AccommodationListingClient
          locationSlug={slug}
          initialItems={res?.items ?? []}
          initialTotal={res?.total ?? 0}
        />
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
