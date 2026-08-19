import type { Metadata } from 'next';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { JsonLdScript } from '@/components/seo/JsonLdScript';

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
    };
  };

  const seo = data.seo;
  const noindex = seo?.robots?.includes('noindex');
  return {
    title: seo?.title ?? `${data.company?.name ?? 'Firma'} | XXREALIT`,
    description: seo?.description,
    alternates: seo?.canonical ? { canonical: seo.canonical } : undefined,
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: seo?.title
      ? {
          title: seo.title,
          description: seo.description,
          url: seo.canonical,
        }
      : undefined,
  };
}

export default async function FirmaSlugLayout({ params, children }: LayoutProps) {
  const { slug } = await params;
  const base = getServerSideApiBaseUrl();
  let jsonLd: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

  if (base && slug.trim()) {
    const res = await fetch(`${base}/company-directory/public/${encodeURIComponent(slug.trim())}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        seo?: { jsonLd?: Record<string, unknown> | Array<Record<string, unknown>> | null };
      };
      jsonLd = data.seo?.jsonLd ?? null;
    }
  }

  return (
    <>
      <JsonLdScript data={jsonLd} />
      {children}
    </>
  );
}
