import type { Metadata } from 'next';
import { getServerSideApiBaseUrl } from '@/lib/api';

type LayoutProps = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const base = getServerSideApiBaseUrl();
  if (!base || !slug.trim()) {
    return { title: 'Firma | XXREALIT', robots: { index: false, follow: true } };
  }

  const res = await fetch(`${base}/company-directory/public/${encodeURIComponent(slug.trim())}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    return { title: 'Firma | XXREALIT', robots: { index: false, follow: true } };
  }

  const data = (await res.json()) as {
    company?: { name?: string };
    seo?: {
      title?: string;
      description?: string;
      canonical?: string;
      robots?: string;
      jsonLd?: Record<string, unknown> | null;
    };
  };

  const seo = data.seo;
  const noindex = seo?.robots?.includes('noindex');
  return {
    title: seo?.title ?? `${data.company?.name ?? 'Firma'} | XXREALIT`,
    description: seo?.description,
    alternates: seo?.canonical ? { canonical: seo.canonical } : undefined,
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    other: seo?.jsonLd ? { 'script:ld+json': JSON.stringify(seo.jsonLd) } : undefined,
  };
}

export default function FirmaSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
