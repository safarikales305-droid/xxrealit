import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { NemovitostDetailPageClient } from '@/components/nemovitost/NemovitostDetailPageClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { buildSiteMetadata, listingCanonicalPath } from '@/lib/seo/metadata';
import { breadcrumbJsonLd, realEstateListingJsonLd } from '@/lib/seo/schema';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';
import PropertyDetailLoading from '../../nemovitost/[id]/loading';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

async function resolvePropertyId(slug: string): Promise<string | null> {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) return null;
  const res = await fetch(`${api}/seo/properties/by-slug/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const id = await resolvePropertyId(slug);
  if (!id) {
    return buildSiteMetadata({ title: 'Inzerát nenalezen', path: listingCanonicalPath(slug), noindex: true });
  }
  const listing = await fetchPropertyForOgMetadata(id, 'classic');
  if (!listing) {
    return buildSiteMetadata({ title: 'Inzerát nemovitosti', path: listingCanonicalPath(slug) });
  }
  const og = buildListingOpenGraphMetadata({ ...listing, shareUrl: listingCanonicalPath(slug) });
  return {
    ...og,
    alternates: { canonical: listingCanonicalPath(slug), ...(og.alternates ?? {}) },
  };
}

export default async function NemovitostSlugPage({ params }: Props) {
  const { slug } = await params;
  const id = await resolvePropertyId(slug);
  if (!id) notFound();

  const listing = await fetchPropertyForOgMetadata(id, 'classic');
  const schema = listing
    ? realEstateListingJsonLd({
        id: listing.id,
        slug,
        title: listing.ogTitle ?? listing.title,
        description: listing.ogDescription ?? listing.description,
        city: listing.city,
        price: listing.price,
        currency: listing.currency,
        image: listing.resolvedOgImage ?? listing.mainImage,
        offerType: null,
        propertyType: null,
        videoUrl: listing.videoUrl,
        createdAt: listing.updatedAt,
      })
    : null;

  return (
    <>
      {schema ? <JsonLd data={schema} /> : null}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Domů', path: '/' },
          { name: 'Nemovitosti', path: '/nemovitosti' },
          { name: listing?.title ?? slug, path: listingCanonicalPath(slug) },
        ])}
      />
      <ShareGateShell type="CLASSIC_LISTING" listingId={id}>
        <Suspense fallback={<PropertyDetailLoading />}>
          <NemovitostDetailPageClient propertyId={id} />
        </Suspense>
      </ShareGateShell>
    </>
  );
}
