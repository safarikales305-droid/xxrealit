export type MarketingReelContext = {
  hasEstimate: boolean;
  estimateMin: number | null;
  estimateMax: number | null;
  contractorCount: number;
  showEstimate: boolean;
  showContractors: boolean;
  ctaUrl: string;
};

export function resolveCopyVariant(ctx: MarketingReelContext): 'A' | 'B' | 'C' {
  if (ctx.contractorCount > 0) return 'C';
  if (ctx.hasEstimate) return 'B';
  return 'A';
}

export function formatCzkRange(min: number, max: number): string {
  const fmt = (n: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n);
  return `${fmt(min)} – ${fmt(max)} Kč`;
}

export function buildFacebookReelCaption(ctx: MarketingReelContext): string {
  const variant = resolveCopyVariant(ctx);
  const lines: string[] = ['🏠 Další AI proměna vytvořená na XXREALIT', ''];

  lines.push('Podívejte se, jak může nemovitost vypadat po rekonstrukci.', '');

  if (variant === 'C') {
    lines.push(`Poptávka odeslána ${ctx.contractorCount} stavebním firmám.`, '');
  } else if (variant === 'B' && ctx.hasEstimate && ctx.showEstimate && ctx.estimateMin != null && ctx.estimateMax != null) {
    lines.push(`AI odhad rekonstrukce od ${formatCzkRange(ctx.estimateMin, ctx.estimateMax)}`, '');
  }

  lines.push(
    '✨ AI vizualizace',
    '💰 orientační rozpočet rekonstrukce',
    '🏗️ možnost oslovit stavební firmy',
    '',
    `Vyzkoušejte zdarma:`,
    ctx.ctaUrl,
    '',
    '#XXREALIT #rekonstrukce #nemovitosti #AIvizualizace',
  );

  return lines.join('\n');
}

export type ReelSlideCopy = {
  headline: string;
  subline?: string;
};

export function buildReelSlideCopy(ctx: MarketingReelContext): {
  hook: ReelSlideCopy;
  transform: ReelSlideCopy;
  result: ReelSlideCopy;
  contractors: ReelSlideCopy;
  outro: ReelSlideCopy;
} {
  const hook: ReelSlideCopy = {
    headline: '🏠 DALŠÍ AI PROMĚNA NA XXREALIT',
  };
  const transform: ReelSlideCopy = {
    headline: '✨ Takhle může nemovitost vypadat po rekonstrukci',
  };

  let resultHeadline = '💰 Můžete si nechat spočítat i orientační cenu rekonstrukce';
  if (ctx.hasEstimate && ctx.showEstimate && ctx.estimateMin != null && ctx.estimateMax != null) {
    resultHeadline = `💰 AI odhad rekonstrukce\n${formatCzkRange(ctx.estimateMin, ctx.estimateMax)}`;
  }

  let contractorsHeadline = '🏗️ Můžete rovnou oslovit stavební firmy';
  if (ctx.contractorCount > 0 && ctx.showContractors) {
    contractorsHeadline = `🏗️ Poptávka odeslána ${ctx.contractorCount} stavebním firmám`;
  }

  return {
    hook,
    transform,
    result: { headline: resultHeadline },
    contractors: { headline: contractorsHeadline },
    outro: {
      headline: 'VYZKOUŠET ZDARMA',
      subline: 'XXREALIT.cz/ai-vizualizace',
    },
  };
}

export function buildMarketingCtaUrl(baseFrontendUrl: string, marketingReelId: string, ctaPath = '/ai-vizualizace'): string {
  const base = baseFrontendUrl.replace(/\/+$/, '');
  const path = ctaPath.startsWith('/') ? ctaPath : `/${ctaPath}`;
  const url = new URL(`${base}${path}`);
  url.searchParams.set('utm_source', 'facebook');
  url.searchParams.set('utm_medium', 'reel');
  url.searchParams.set('utm_campaign', 'ai_visualization');
  url.searchParams.set('utm_content', marketingReelId);
  return url.toString();
}
