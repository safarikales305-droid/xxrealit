'use client';

import Link from 'next/link';
import { trackAiVisualizationEvent } from '@/lib/ai-visualization-client';

type Props = {
  locationName: string;
  intentLabel?: string;
  locative?: string;
};

function buildAiVizHref(locationName: string): string {
  const params = new URLSearchParams({
    location: locationName,
    utm_source: 'seo',
    utm_medium: 'local_page',
    utm_campaign: 'ai_visualization',
  });
  return `/ai-vizualizace?${params.toString()}`;
}

function localizedIntro(locationName: string, intentLabel?: string, locative?: string): string {
  const place = locative ?? `v ${locationName}`;
  const subject =
    intentLabel?.toLowerCase().includes('chat') || intentLabel?.toLowerCase().includes('dům')
      ? 'domu nebo chaty'
      : intentLabel?.toLowerCase().includes('byt')
        ? 'bytu nebo domu'
        : 'domu, bytu nebo místnosti';
  return `Plánujete rekonstrukci ${subject} ${place}? Nahrajte fotografii a AI XXREALIT vám během chvíle ukáže možnou novou podobu. Následně můžete získat orientační rozpočet rekonstrukce a poptat firmy pro ${locationName} a okolí.`;
}

export function SeoAiVisualizationSection({ locationName, intentLabel, locative }: Props) {
  const href = buildAiVizHref(locationName);
  const intro = localizedIntro(locationName, intentLabel, locative);

  return (
    <section className="mt-10 overflow-hidden rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 via-white to-zinc-50 p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-orange-600">✨ AI vizualizace zdarma</p>
      <h2 className="mt-2 text-xl font-bold text-zinc-900 sm:text-2xl">Plánujete rekonstrukci?</h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-700 sm:text-base">{intro}</p>

      <ul className="mt-4 grid gap-2 text-sm text-zinc-800 sm:grid-cols-2">
        <li>📷 Nahrajte vlastní fotografii</li>
        <li>✨ AI vytvoří novou podobu</li>
        <li>💰 Získáte orientační rozpočet</li>
        <li>🏗 Můžete oslovit stavební firmy</li>
      </ul>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-center rounded-2xl bg-zinc-200/80 py-10 text-center text-xs font-semibold text-zinc-600">
          PŘED
          <span className="mx-2 text-zinc-400">|</span>
          PO
          <p className="mt-2 w-full text-[10px] font-normal text-zinc-500">Ukázka AI proměny</p>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <p className="text-sm text-zinc-600">Zkuste to s vlastní nemovitostí</p>
          <Link
            href={href}
            onClick={() =>
              void trackAiVisualizationEvent({
                eventName: 'ai_visualization_seo_cta_click',
                meta: { location: locationName },
              })
            }
            className="inline-flex w-full items-center justify-center rounded-2xl bg-orange-600 px-4 py-4 text-center text-sm font-bold text-white shadow-md hover:bg-orange-700 sm:text-base"
          >
            ✨ Vytvořit vizualizaci zdarma
          </Link>
          <Link
            href={href}
            className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900"
          >
            📷 Nahrát fotku a vyzkoušet AI
          </Link>
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Orientační AI odhad není závaznou cenovou nabídkou.{' '}
        <Link href="/ai-vizualizace" className="font-semibold text-orange-700 underline">
          AI vizualizace rekonstrukce
        </Link>
      </p>
    </section>
  );
}
