import type { Metadata } from 'next';
import { AiVisualizationWizard } from '@/components/ai-visualization/AiVisualizationWizard';
import { PublicHeader } from '@/components/navigation/PublicHeader';

export const metadata: Metadata = {
  title: 'AI vizualizace rekonstrukce domu a bytu | XXREALIT',
  description:
    'Nahrajte fotografii místnosti, domu nebo bytu a AI XXREALIT během chvíle vytvoří realistickou vizualizaci nové podoby.',
  openGraph: {
    title: 'AI vizualizace rekonstrukce | XXREALIT',
    description: 'Podívejte se, jak může váš dům nebo byt vypadat po rekonstrukci.',
  },
};

type PageProps = {
  searchParams: Promise<{ sourceImage?: string }>;
};

export default async function AiVizualizacePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const prefilled = sp.sourceImage?.trim() || null;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-orange-50/80 via-white to-zinc-50">
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
          <AiVisualizationWizard prefilledImageUrl={prefilled} />
        </div>
      </main>
    </div>
  );
}
