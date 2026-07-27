import {
  SEO_AI_BLOCK_TYPES,
  SEO_AI_LAYOUT_TYPES,
  type SeoAiPageOutput,
} from './seo-ai-layout.types';

const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /https?:\/\//i,
  /www\./i,
];

const FABRICATED_PATTERNS = [
  /\d+\s*aktivních?\s+nabídek/i,
  /\d+\s*inzerátů/i,
  /průměrná\s+cena/i,
  /\d+\s*obyvatel/i,
  /\d+\s*minut\s+(do|k)\s+/i,
  /nejlepší\s+škola/i,
  /garance\s+výnosu/i,
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function isSafeText(value: string): boolean {
  return !FORBIDDEN_PATTERNS.some((p) => p.test(value));
}

function hasFabricatedClaims(text: string, allowListings: boolean): boolean {
  if (allowListings) {
    return FABRICATED_PATTERNS.filter((p) => !/inzerát|nabídek/i.test(p.source)).some((p) =>
      p.test(text),
    );
  }
  return FABRICATED_PATTERNS.some((p) => p.test(text));
}

export function parseSeoAiPageJson(text: string): unknown {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = jsonBlock ? jsonBlock[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export function validateSeoAiPageOutput(
  raw: unknown,
  opts?: { hasListings?: boolean },
): { ok: true; data: SeoAiPageOutput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Výstup není platný JSON objekt.'] };
  }
  const o = raw as Record<string, unknown>;

  const layout = String(o.layout ?? '');
  if (!SEO_AI_LAYOUT_TYPES.includes(layout as (typeof SEO_AI_LAYOUT_TYPES)[number])) {
    errors.push('Neplatný layout.');
  }

  const metaTitle = stripHtml(String(o.metaTitle ?? ''));
  const metaDescription = stripHtml(String(o.metaDescription ?? ''));
  const h1 = stripHtml(String(o.h1 ?? ''));
  const editorialTitle = stripHtml(String(o.editorialTitle ?? ''));
  const subtitle = stripHtml(String(o.subtitle ?? ''));
  const introText = stripHtml(String(o.introText ?? ''));
  const mainContent = stripHtml(String(o.mainContent ?? ''));
  const slugSuggestion = String(o.slugSuggestion ?? '').trim().replace(/^\/+/, '');

  if (!metaTitle || metaTitle.length < 20) errors.push('Meta title je příliš krátký.');
  if (metaTitle.length > 70) errors.push('Meta title je příliš dlouhý.');
  if (!metaDescription || metaDescription.length < 80) errors.push('Meta description je příliš krátký.');
  if (metaDescription.length > 170) errors.push('Meta description je příliš dlouhý.');
  if (!h1.trim()) errors.push('Chybí H1.');
  if (metaTitle.trim().toLowerCase() === h1.trim().toLowerCase()) {
    errors.push('H1 se nesmí shodovat s meta title.');
  }
  if (!editorialTitle || editorialTitle.length < 15) errors.push('Chybí redakční titulek.');
  if (!introText || introText.length < 80) errors.push('Úvod je příliš krátký.');
  if (!mainContent || mainContent.length < 300) errors.push('Hlavní obsah je příliš krátký.');

  for (const field of [metaTitle, metaDescription, h1, editorialTitle, subtitle, introText, mainContent]) {
    if (field && !isSafeText(field)) errors.push('Text obsahuje nepovolené prvky.');
    if (field && hasFabricatedClaims(field, Boolean(opts?.hasListings))) {
      errors.push('Text obsahuje potenciálně neověřená číselná tvrzení.');
    }
  }

  const blocksRaw = o.blocks;
  const blocks: SeoAiPageOutput['blocks'] = [];
  if (!Array.isArray(blocksRaw) || blocksRaw.length < 4) {
    errors.push('Stránka musí obsahovat alespoň 4 obsahové bloky.');
  } else {
    for (const item of blocksRaw.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      const b = item as Record<string, unknown>;
      const type = String(b.type ?? '');
      if (!SEO_AI_BLOCK_TYPES.includes(type as (typeof SEO_AI_BLOCK_TYPES)[number])) continue;
      const content = stripHtml(String(b.content ?? ''));
      if (!content) continue;
      blocks.push({
        type: type as SeoAiPageOutput['blocks'][number]['type'],
        title: b.title ? stripHtml(String(b.title)) : undefined,
        content,
      });
    }
  }
  if (blocks.length < 4) errors.push('Neplatné obsahové bloky.');

  const faq: Array<{ question: string; answer: string }> = [];
  if (Array.isArray(o.faq)) {
    for (const item of o.faq.slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const q = stripHtml(String((item as { question?: string }).question ?? ''));
      const a = stripHtml(String((item as { answer?: string }).answer ?? ''));
      if (q && a) faq.push({ question: q, answer: a });
    }
  }
  if (faq.length < 3) errors.push('FAQ musí obsahovat alespoň 3 položky.');

  const internalLinks: Array<{ label: string; path: string }> = [];
  if (Array.isArray(o.internalLinks)) {
    for (const item of o.internalLinks.slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const label = stripHtml(String((item as { label?: string }).label ?? ''));
      const path = String((item as { path?: string }).path ?? '').trim();
      if (label && path.startsWith('/')) internalLinks.push({ label, path });
    }
  }

  const ctaRaw = o.cta;
  let cta = { title: '', text: '', buttonLabel: '', buttonPath: '/' };
  if (ctaRaw && typeof ctaRaw === 'object') {
    const c = ctaRaw as Record<string, unknown>;
    cta = {
      title: stripHtml(String(c.title ?? '')),
      text: stripHtml(String(c.text ?? '')),
      buttonLabel: stripHtml(String(c.buttonLabel ?? 'Zjistit více')),
      buttonPath: String(c.buttonPath ?? '/').trim() || '/',
    };
  }

  const sourceClaims: SeoAiPageOutput['sourceClaims'] = [];
  if (Array.isArray(o.sourceClaims)) {
    for (const item of o.sourceClaims.slice(0, 30)) {
      if (!item || typeof item !== 'object') continue;
      const claim = stripHtml(String((item as { claim?: string }).claim ?? ''));
      if (!claim) continue;
      sourceClaims.push({
        claim,
        sourceType: String((item as { sourceType?: string }).sourceType ?? 'MANUAL') as SeoAiPageOutput['sourceClaims'][number]['sourceType'],
        sourceId: (item as { sourceId?: string }).sourceId,
        verified: Boolean((item as { verified?: boolean }).verified),
      });
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  return {
    ok: true,
    data: {
      layout: layout as SeoAiPageOutput['layout'],
      slugSuggestion,
      editorialTitle,
      subtitle,
      metaTitle,
      metaDescription,
      h1,
      introText,
      mainContent,
      blocks,
      faq,
      internalLinks,
      cta,
      sourceClaims,
    },
  };
}
