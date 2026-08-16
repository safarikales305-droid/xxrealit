import type { Metadata } from 'next';
import { PublicDirectoryJsonLd } from '@/components/directory/PublicDirectoryJsonLd';
import { PublicProfileDirectoryView } from '@/components/directory/PublicProfileDirectoryView';

export const metadata: Metadata = {
  title: 'Profesionálové a firmy | XXREALIT',
  description:
    'Veřejný katalog makléřů, investorů, stavebních firem, realitních kanceláří a dalších profesionálů na XXREALIT.',
  alternates: { canonical: '/profesionalove' },
  openGraph: {
    title: 'Profesionálové a firmy | XXREALIT',
    description: 'Najděte ověřené profesionály a firmy ve vašem regionu.',
    type: 'website',
  },
};

type PageProps = {
  searchParams: Promise<{ filter?: string; kraj?: string; region?: string }>;
};

export default async function ProfesionalovePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const region = params.kraj ?? params.region ?? '';
  return (
    <>
      <PublicDirectoryJsonLd />
      <PublicProfileDirectoryView initialFilter={params.filter ?? 'all'} initialRegion={region} />
    </>
  );
}
