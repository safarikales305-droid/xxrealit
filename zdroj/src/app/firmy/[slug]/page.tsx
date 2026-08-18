import { notFound } from 'next/navigation';
import { getServerSideApiBaseUrl } from '@/lib/api';
import type { CompanyDirectoryDetailResponse } from '@/lib/company-directory-client';
import type { PortalPostFeedItem } from '@/lib/company-seo-admin-client';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import { safeNormalizePropertyFromApi, type PropertyFeedItem } from '@/types/property';
import { FirmaDetailClient } from './FirmaDetailClient';

type ReviewResponse = {
  items: Array<{
    id: string;
    rating: number;
    sentiment: string;
    title?: string;
    body: string;
    authorDisplayName: string;
    publishedAt?: string | null;
    media?: Array<{ type: string; url: string; thumbnailUrl?: string | null }>;
    response?: { body: string; verifiedCompanyResponse: boolean; createdAt: string } | null;
  }>;
  summary: { average: number | null; count: number };
};

async function fetchCompany(slug: string): Promise<CompanyDirectoryDetailResponse | null> {
  const base = getServerSideApiBaseUrl();
  if (!base || !slug.trim()) return null;
  const res = await fetch(`${base}/company-directory/public/${encodeURIComponent(slug.trim())}`, {
    next: { revalidate: 60 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as CompanyDirectoryDetailResponse;
}

async function fetchReviews(slug: string): Promise<ReviewResponse | null> {
  const base = getServerSideApiBaseUrl();
  if (!base || !slug.trim()) return null;
  const res = await fetch(
    `${base}/company-directory/public/${encodeURIComponent(slug.trim())}/reviews`,
    { next: { revalidate: 60 }, headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as ReviewResponse;
}

async function fetchPortalPosts(): Promise<PortalPostFeedItem[]> {
  const base = getServerSideApiBaseUrl();
  if (!base) return [];
  const res = await fetch(`${base}/company-directory/public/portal-posts/latest?limit=5`, {
    next: { revalidate: 60 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: PortalPostFeedItem[] };
  return data.items ?? [];
}

async function fetchListingsForCompany(city?: string | null, region?: string | null): Promise<PropertyFeedItem[]> {
  const base = getServerSideApiBaseUrl();
  if (!base) return [];
  const location = city?.trim() || region?.trim();
  const query = location ? `location=${encodeURIComponent(location)}` : undefined;
  const { items } = await loadPropertyFeedItems(base, { query });
  return items.slice(0, 6);
}

async function fetchCompanyOwnedListings(slug: string): Promise<PropertyFeedItem[]> {
  const base = getServerSideApiBaseUrl();
  if (!base || !slug.trim()) return [];
  const res = await fetch(
    `${base}/company-directory/public/${encodeURIComponent(slug.trim())}/listings?limit=6`,
    { next: { revalidate: 120 }, headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: unknown[] };
  return (data.items ?? [])
    .map(safeNormalizePropertyFromApi)
    .filter((x): x is PropertyFeedItem => x != null);
}

export default async function FirmaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await fetchCompany(slug);
  if (!data?.company) {
    notFound();
  }
  const [reviews, portalPosts, listings, companyListings] = await Promise.all([
    fetchReviews(slug),
    fetchPortalPosts(),
    fetchListingsForCompany(data.company.city, data.company.region),
    fetchCompanyOwnedListings(slug),
  ]);

  return (
    <FirmaDetailClient
      slug={slug}
      initialData={data}
      initialReviews={reviews?.items ?? []}
      initialReviewSummary={reviews?.summary ?? { average: null, count: 0 }}
      initialPortalPosts={portalPosts}
      initialListings={listings}
      initialCompanyListings={companyListings}
    />
  );
}
