import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PresentationLanding } from '@/components/presentation/PresentationLanding';
import { fetchPortalPresentation } from '@/lib/portal-presentation';
import { getAppOrigin } from '@/lib/app-url';

export const revalidate = 60;

const ORIGIN = getAppOrigin();

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPortalPresentation('cs');
  if (!page) {
    return { title: 'Představení portálu | XXREALIT' };
  }

  const canonical = page.canonicalUrl ?? `${ORIGIN}/o-portalu`;
  const ogImage = page.ogImageUrl ?? `${ORIGIN}/icons/icon-512.png`;

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: page.metaKeywords?.split(',').map((k) => k.trim()),
    robots: { index: true, follow: true },
    alternates: {
      canonical,
      languages: {
        cs: `${ORIGIN}/o-portalu`,
        sk: `${ORIGIN}/o-portalu?locale=sk`,
        en: `${ORIGIN}/o-portalu?locale=en`,
        de: `${ORIGIN}/o-portalu?locale=de`,
        pl: `${ORIGIN}/o-portalu?locale=pl`,
      },
    },
    openGraph: {
      type: 'website',
      locale: 'cs_CZ',
      url: canonical,
      siteName: 'XXREALIT',
      title: page.metaTitle,
      description: page.metaDescription,
      images: [{ url: ogImage, width: 512, height: 512, alt: 'XXREALIT' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.metaTitle,
      description: page.metaDescription,
      images: [ogImage],
    },
  };
}

function buildJsonLd(page: NonNullable<Awaited<ReturnType<typeof fetchPortalPresentation>>>) {
  const url = page.canonicalUrl ?? `${ORIGIN}/o-portalu`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.metaTitle,
        description: page.metaDescription,
        inLanguage: page.locale,
        isPartOf: { '@id': `${ORIGIN}/#website` },
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        url: ORIGIN,
        name: 'XXREALIT',
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'XXREALIT',
        url: ORIGIN,
        logo: page.ogImageUrl ?? `${ORIGIN}/icons/icon-512.png`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Domů', item: ORIGIN },
          { '@type': 'ListItem', position: 2, name: 'O portálu', item: url },
        ],
      },
      ...(page.faq.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: page.faq.map((f) => ({
                '@type': 'Question',
                name: f.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: f.answerHtml.replace(/<[^>]+>/g, ' '),
                },
              })),
            },
          ]
        : []),
    ],
  };
}

export default async function OPortaluPage() {
  const page = await fetchPortalPresentation('cs');
  if (!page) notFound();

  const jsonLd = buildJsonLd(page);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PresentationLanding page={page} />
    </>
  );
}
