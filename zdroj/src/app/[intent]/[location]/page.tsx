import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ProgrammaticSeoPage } from '@/components/seo/ProgrammaticSeoPage';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildSiteMetadata } from '@/lib/seo/metadata';
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  faqJsonLd,
  localBusinessDirectoryJsonLd,
  offerCatalogJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from '@/lib/seo/schema';
import {
  fetchProgrammaticSeoPage,
  isProgrammaticSeoIntent,
} from '@/lib/seo/programmatic-seo';

type Props = { params: Promise<{ intent: string; location: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { intent, location } = await params;
  if (!isProgrammaticSeoIntent(intent)) {
    return buildSiteMetadata({ title: 'Stránka nenalezena', noindex: true });
  }
  const data = await fetchProgrammaticSeoPage(intent, location);
  if (!data) {
    return buildSiteMetadata({ title: 'Stránka nenalezena', noindex: true });
  }

  const seo = data.seo;
  return buildSiteMetadata({
    title: seo?.ogTitle ?? data.title,
    description: seo?.ogDescription ?? data.description,
    path: data.path,
    keywords: data.keywords,
    image: seo?.ogImage ?? data.heroImageUrl,
    noindex: seo?.noindex ?? false,
  });
}

export default async function ProgrammaticSeoRoute({ params }: Props) {
  const { intent, location } = await params;
  if (!isProgrammaticSeoIntent(intent)) notFound();

  const data = await fetchProgrammaticSeoPage(intent, location);
  if (!data) notFound();

  const breadcrumbs = [
    { name: 'Domů', path: '/' },
    { name: data.intent.label, path: `/${data.intent.slug}/${data.location.slug}` },
    { name: data.location.name, path: data.path },
  ];

  const schemaGraph: Record<string, unknown>[] = [
    organizationJsonLd(),
    webSiteJsonLd(),
    breadcrumbJsonLd(breadcrumbs),
    faqJsonLd(data.faq),
  ];

  if (data.hasListings) {
    schemaGraph.push(
      collectionPageJsonLd({
        name: data.h1,
        description: data.description,
        path: data.path,
        numberOfItems: data.totalCount,
      }),
    );
    if (data.intent.isBrokerPage) {
      schemaGraph.push(
        localBusinessDirectoryJsonLd({
          name: data.h1,
          description: data.description,
          path: data.path,
          city: data.location.name,
        }),
      );
    } else {
      schemaGraph.push(
        offerCatalogJsonLd({
          name: data.h1,
          description: data.description,
          path: data.path,
          city: data.location.name,
        }),
      );
    }
  } else {
    schemaGraph.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: data.h1,
      description: data.description,
      inLanguage: 'cs-CZ',
    });
    schemaGraph.push({
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      name: 'XXREALIT',
      description: 'Moderní realitní portál s video inzeráty a programatickým SEO.',
      areaServed: { '@type': 'City', name: data.location.name },
    });
  }

  const storedSchema = data.seo?.schemaJson;
  const jsonLd =
    storedSchema && Object.keys(storedSchema).length > 0
      ? storedSchema
      : {
          '@context': 'https://schema.org',
          '@graph': schemaGraph.map((node) => {
            const { '@context': _ctx, ...rest } = node as Record<string, unknown>;
            return rest;
          }),
        };

  return (
    <>
      <JsonLd data={jsonLd} />
      <ProgrammaticSeoPage data={data} />
    </>
  );
}
