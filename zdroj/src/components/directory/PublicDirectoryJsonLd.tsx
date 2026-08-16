import { getServerSideApiBaseUrl } from '@/lib/api';
import { getAppOrigin } from '@/lib/app-url';

type Stats = {
  totalPublicProfiles: number;
  companies: number;
  professionals: number;
  categories: number;
  regions: number;
};

async function fetchStats(): Promise<Stats | null> {
  const base = getServerSideApiBaseUrl();
  if (!base) return null;
  const res = await fetch(`${base}/company-directory/public/directory/stats`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as Stats;
}

export async function PublicDirectoryJsonLd() {
  const stats = await fetchStats();
  const origin = getAppOrigin();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Lidé a firmy na XXREALIT',
    description:
      'Veřejný katalog makléřů, investorů, stavebních firem, realitních kanceláří a dalších profesionálů.',
    url: `${origin}/profesionalove`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'XXREALIT',
      url: origin,
    },
    ...(stats
      ? {
          about: {
            '@type': 'ItemList',
            numberOfItems: stats.totalPublicProfiles,
            description: `${stats.companies} firem, ${stats.professionals} profesionálů, ${stats.categories} kategorií`,
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
