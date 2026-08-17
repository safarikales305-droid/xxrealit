import { notFound } from 'next/navigation';
import { getServerSideApiBaseUrl } from '@/lib/api';
import type { CompanyDirectoryDetailResponse } from '@/lib/company-directory-client';
import type { PortalPostFeedItem } from '@/lib/company-seo-admin-client';
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

export default async function FirmaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [data, reviews, portalPosts] = await Promise.all([
    fetchCompany(slug),
    fetchReviews(slug),
    fetchPortalPosts(),
  ]);

  if (!data?.company) {
    notFound();
  }

  return (
    <FirmaDetailClient
      slug={slug}
      initialData={data}
      initialReviews={reviews?.items ?? []}
      initialReviewSummary={reviews?.summary ?? { average: null, count: 0 }}
      initialPortalPosts={portalPosts}
    />
  );
}
