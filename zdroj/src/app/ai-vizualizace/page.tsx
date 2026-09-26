import type { Metadata } from 'next';
import { AiVisualizationWizard } from '@/components/ai-visualization/AiVisualizationWizard';
import { PublicHeader } from '@/components/navigation/PublicHeader';

const SITE = 'https://www.xxrealit.cz';

export const metadata: Metadata = {
  title: 'AI vizualizace domu a bytu zdarma | XXREALIT',
  description:
    'Nahrajte fotografii domu, bytu nebo místnosti. AI vytvoří návrh po rekonstrukci, orientační rozpočet a umožní poptat stavební firmy.',
  alternates: { canonical: `${SITE}/ai-vizualizace` },
  openGraph: {
    title: 'AI vizualizace rekonstrukce zdarma | XXREALIT',
    description:
      'Nahrajte fotografii a podívejte se, jak může nemovitost vypadat po rekonstrukci. Orientační rozpočet a poptávka firem.',
    url: `${SITE}/ai-vizualizace`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI vizualizace domu a bytu zdarma | XXREALIT',
    description:
      'Nahrajte fotografii domu, bytu nebo místnosti. AI návrh rekonstrukce, orientační rozpočet a stavební firmy.',
  },
};

type PageProps = {
  searchParams: Promise<{ sourceImage?: string; viz?: string; location?: string }>;
};

export default async function AiVizualizacePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const prefilled = sp.sourceImage?.trim() || null;
  const initialVizId = sp.viz?.trim() || null;
  const initialLocation = sp.location?.trim() || null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'AI vizualizace rekonstrukce XXREALIT',
    url: `${SITE}/ai-vizualizace`,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CZK',
      description: 'Bezplatná AI vizualizace pro orientační návrh rekonstrukce',
    },
    description:
      'Nahrajte fotografii nemovitosti a získejte AI návrh po rekonstrukci, orientační rozpočet a možnost poptat stavební firmy.',
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-orange-50/80 via-white to-zinc-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicHeader activeSection="none" compact />
      <main className="mx-auto max-w-[100rem] px-4 py-6 md:px-6 md:py-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-600">✨ AI vizualizace</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 md:text-3xl">
            Podívejte se, jak může váš dům nebo byt vypadat po rekonstrukci
          </h1>
          <p className="mt-3 text-sm text-zinc-600 md:text-base">
            Nahrajte fotografii místnosti, domu nebo bytu a AI XXREALIT během chvíle vytvoří realistickou vizualizaci
            nové podoby.
          </p>
        </div>
        <div className="mt-8">
          <AiVisualizationWizard prefilledImageUrl={prefilled} initialVizId={initialVizId} initialLocation={initialLocation} />
        </div>
      </main>
    </div>
  );
}
