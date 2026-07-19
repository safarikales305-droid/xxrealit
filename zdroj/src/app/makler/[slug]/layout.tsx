import type { Metadata } from 'next';
import { getServerSideApiBaseUrl, nestAbsoluteAssetUrl } from '@/lib/api';
import { buildProfileOpenGraphMetadata } from '@/lib/profile-og-metadata';

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
    return buildProfileOpenGraphMetadata({
      name: 'Makléř',
      canonicalPath: `/makler/${slug}`,
    });
  }

  const res = await fetch(
    `${base}/brokers/by-slug/${encodeURIComponent(slug.trim())}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    return buildProfileOpenGraphMetadata({
      name: 'Makléř',
      canonicalPath: `/makler/${slug}`,
    });
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
    return buildProfileOpenGraphMetadata({
      name: 'Makléř',
      canonicalPath: `/makler/${slug}`,
    });
  }

  const image =
    publicAssetUrl(broker.coverImageUrl) || publicAssetUrl(broker.avatarUrl) || null;

  return buildProfileOpenGraphMetadata({
    name: broker.name?.trim() || 'Makléř',
    description:
      broker.bio?.trim() ||
      `${broker.name ?? 'Makléř'}${broker.officeName ? ` – ${broker.officeName}` : ''} na XXREALIT.`,
    imageUrl: image,
    canonicalPath: `/makler/${encodeURIComponent(slug)}`,
  });
}

export default function MaklerSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
