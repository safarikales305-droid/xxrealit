import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NemovitostDetailPageClient } from '@/components/nemovitost/NemovitostDetailPageClient';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';
import { listingCanonicalPath } from '@/lib/seo/metadata';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import PropertyDetailLoading from './loading';

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

async function resolveSlug(id: string): Promise<string | null> {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) return null;
  const res = await fetch(`${api}/properties/${encodeURIComponent(id)}/og-meta`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { slug?: string | null };
  return data.slug ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const slug = await resolveSlug(id);
  if (slug) {
    return { alternates: { canonical: listingCanonicalPath(slug) } };
  }
  const listing = await fetchPropertyForOgMetadata(id, 'classic');
  if (!listing) {
    return { title: 'Inzerát nemovitosti', robots: { index: true, follow: true } };
  }
  return buildListingOpenGraphMetadata(listing);
}

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;
  const slug = await resolveSlug(id);
  if (slug) redirect(listingCanonicalPath(slug));

  return (
    <ShareGateShell type="CLASSIC_LISTING" listingId={id}>
      <Suspense fallback={<PropertyDetailLoading />}>
        <NemovitostDetailPageClient propertyId={id} />
      </Suspense>
    </ShareGateShell>
  );
}
