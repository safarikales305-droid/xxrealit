import type { Metadata } from 'next';
import { getServerSideApiBaseUrl, nestAbsoluteAssetUrl } from '@/lib/api';
import { getAppOrigin } from '@/lib/app-url';
import { pageTitle } from '@/lib/seo/metadata';

type LayoutProps = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

function publicAssetUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return nestAbsoluteAssetUrl(path) || path;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const base = getServerSideApiBaseUrl();
  if (!base || !slug.trim()) {
    return { title: pageTitle('Makléř'), robots: { index: true, follow: true } };
  }

  const res = await fetch(
    `${base}/brokers/by-slug/${encodeURIComponent(slug.trim())}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    return { title: pageTitle('Makléř'), robots: { index: true, follow: true } };
  }

  const data = (await res.json()) as {
    broker?: {
      name?: string | null;
      bio?: string | null;
      officeName?: string | null;
      avatarUrl?: string | null;
      coverImageUrl?: string | null;
    };
  };
  const broker = data.broker;
  if (!broker) {
    return { title: pageTitle('Makléř'), robots: { index: true, follow: true } };
  }

  const title = pageTitle(broker.name?.trim() || 'Makléř');
  const description =
    broker.bio?.trim()?.slice(0, 200) ||
    `${broker.name ?? 'Makléř'}${broker.officeName ? ` – ${broker.officeName}` : ''} na XXREALIT.`;
  const image =
    publicAssetUrl(broker.coverImageUrl) || publicAssetUrl(broker.avatarUrl) || undefined;
  const canonical = `${getAppOrigin()}/makler/${encodeURIComponent(slug)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
      images: image ? [{ url: image, width: 1200, height: 630, alt: broker.name ?? 'Makléř' }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default function MaklerSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
