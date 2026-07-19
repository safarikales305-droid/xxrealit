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
  return buildSiteMetadata({
    title: data.title,
    description: data.description,
    path: data.path,
    keywords: data.keywords,
  });
}

export default async function ProgrammaticSeoRoute({ params }: Props) {
  const { intent, location } = await params;
  if (!isProgrammaticSeoIntent(intent)) notFound();

  const data = await fetchProgrammaticSeoPage(intent, location);
  if (!data) notFound();

  const schemaGraph = [
    organizationJsonLd(),
    webSiteJsonLd(),
    breadcrumbJsonLd([
      { name: 'Domů', path: '/' },
      { name: data.intent.label, path: data.path },
      { name: data.location.name, path: data.path },
    ]),
    collectionPageJsonLd({
      name: data.h1,
      description: data.description,
      path: data.path,
      numberOfItems: data.totalCount,
    }),
    faqJsonLd(data.faq),
    data.intent.isBrokerPage
      ? localBusinessDirectoryJsonLd({
          name: data.h1,
          description: data.description,
          path: data.path,
          city: data.location.name,
        })
      : offerCatalogJsonLd({
          name: data.h1,
          description: data.description,
          path: data.path,
          city: data.location.name,
        }),
  ];

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': schemaGraph.map((node) => {
            const { '@context': _ctx, ...rest } = node as Record<string, unknown>;
            return rest;
          }),
        }}
      />
      <ProgrammaticSeoPage data={data} />
    </>
  );
}
