import {
  SEO_AI_LAYOUT_TYPES,
  type SeoAiContentBlock,
  type SeoAiLayoutTypeName,
  type SeoAiPageOutput,
} from './seo-ai-layout.types';

export type SeoAiBuildContext = {
  locationName: string;
  offerLabel: string;
  hasListings: boolean;
  intentSlug?: string;
  relatedLocations?: Array<{ name: string; slug: string }>;
};

export type SeoAiBuildLog = {
  aiFieldsReceived: string[];
  blocksFromAi: number;
  blocksAdded: Array<{ type: string; title: string; reason: string }>;
  finalBlockCount: number;
  finalBlockTypes: string[];
};

const FORBIDDEN_PATTERNS = [/<script/i, /javascript:/i, /on\w+\s*=/i];

const MIN_LAYOUT: Array<{ type: SeoAiContentBlock['type']; title: string }> = [
  { type: 'HERO', title: 'Hero' },
  { type: 'INTRO', title: 'Úvod' },
  { type: 'MAIN_CONTENT', title: 'Obsah' },
  { type: 'SURROUNDINGS', title: 'Zajímavosti' },
  { type: 'FAQ', title: 'Časté dotazy' },
  { type: 'CTA', title: 'Shrnutí a další krok' },
  { type: 'INTERNAL_LINKS', title: 'Související stránky' },
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function sanitize(value: string): string {
  let text = stripHtml(value);
  for (const pattern of FORBIDDEN_PATTERNS) {
    text = text.replace(pattern, '');
  }
  return text.trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = o[key];
    if (typeof val === 'string' && val.trim()) return sanitize(val);
  }
  return '';
}

function pickTextOrList(o: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = o[key];
    if (typeof val === 'string' && val.trim()) return sanitize(val);
    if (Array.isArray(val)) {
      const parts = val
        .map((item) => {
          if (typeof item === 'string') return sanitize(item);
          if (item && typeof item === 'object') {
            const row = item as Record<string, unknown>;
            const title = row.title ? sanitize(String(row.title)) : '';
            const text = sanitize(String(row.text ?? row.content ?? row.body ?? ''));
            return title && text ? `${title}: ${text}` : text || title;
          }
          return '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join('\n\n');
    }
  }
  return '';
}

function splitByHeadings(text: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = text.split(/\r?\n/);
  let currentTitle = '';
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content) sections.push({ title: currentTitle || 'Obsah', content });
    currentLines = [];
  };

  for (const line of lines) {
    const hMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (hMatch) {
      flush();
      currentTitle = hMatch[1]!.trim();
      continue;
    }
    currentLines.push(line);
  }
  flush();
  return sections;
}

function splitByParagraphs(text: string, minChunks = 2): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  if (paragraphs.length >= minChunks) return paragraphs;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 80) return paragraphs.length ? paragraphs : text.trim() ? [text.trim()] : [];
  const chunkSize = Math.ceil(words.length / Math.max(minChunks, 2));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks.filter((c) => c.length > 20);
}

function parseFaq(raw: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(raw)) return [];
  const faq: Array<{ question: string; answer: string }> = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const question = sanitize(String(row.question ?? row.q ?? ''));
    const answer = sanitize(String(row.answer ?? row.a ?? ''));
    if (question && answer) faq.push({ question, answer });
  }
  return faq;
}

function ensureFaq(
  faq: Array<{ question: string; answer: string }>,
  ctx: SeoAiBuildContext,
): Array<{ question: string; answer: string }> {
  if (faq.length >= 3) return faq;
  const defaults = [
    {
      question: `Je ${ctx.locationName} vhodná lokalita pro ${ctx.offerLabel.toLowerCase()}?`,
      answer:
        'Záleží na vašich prioritách — rozpočet, dostupnost služeb a typ bydlení. Projděte si sekce průvodce a ověřené informace na stránce.',
    },
    {
      question: 'Jak najdu aktuální nabídky?',
      answer: ctx.hasListings
        ? 'Aktuální nabídky najdete v sekci výsledků na této stránce nebo v katalogu portálu XXREALIT.'
        : 'Sledujte tuto stránku, nastavte hlídání nebo prozkoumejte okolní lokality na portálu XXREALIT.',
    },
    {
      question: 'Mohu vložit vlastní inzerát?',
      answer: 'Ano, vlastní inzerát můžete vložit přes portál XXREALIT a oslovit relevantní zájemce.',
    },
  ];
  const merged = [...faq];
  for (const item of defaults) {
    if (merged.length >= 3) break;
    if (!merged.some((m) => m.question === item.question)) merged.push(item);
  }
  return merged;
}

function buildInternalLinks(
  raw: unknown,
  ctx: SeoAiBuildContext,
): Array<{ label: string; path: string }> {
  const links: Array<{ label: string; path: string }> = [];
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const label = sanitize(String(row.label ?? row.name ?? ''));
      const path = String(row.path ?? row.url ?? '').trim();
      if (label && path.startsWith('/')) links.push({ label, path });
    }
  }
  if (links.length) return links;
  const intent = ctx.intentSlug ?? 'prodej-bytu';
  for (const loc of ctx.relatedLocations ?? []) {
    links.push({ label: `${ctx.offerLabel} ${loc.name}`, path: `/${intent}/${loc.slug}` });
  }
  if (!links.length && ctx.intentSlug) {
    links.push({
      label: `Další lokality – ${ctx.offerLabel}`,
      path: `/nemovitosti`,
    });
  }
  return links.slice(0, 8);
}

function parseLegacyBlocks(raw: unknown): SeoAiContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: SeoAiContentBlock[] = [];
  for (const item of raw.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? row.blockType ?? '').toUpperCase();
    const content = sanitize(String(row.content ?? row.text ?? row.body ?? ''));
    if (!type || !content) continue;
    blocks.push({
      type: type as SeoAiContentBlock['type'],
      title: row.title ? sanitize(String(row.title)) : undefined,
      content,
    });
  }
  return blocks;
}

/** Sestaví publikovatelnou SEO stránku z AI obsahu — nikdy nevyhodí chybu kvůli chybějícím blokům. */
export function buildSeoAiPageFromAi(
  raw: unknown,
  ctx: SeoAiBuildContext,
): { output: SeoAiPageOutput; log: SeoAiBuildLog; rawAiJson: unknown } {
  const o: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : { mainContent: String(raw ?? '') };

  const aiFieldsReceived = Object.keys(o).filter((k) => {
    const v = o[k];
    return v !== null && v !== undefined && v !== '';
  });

  const title = pickString(o, ['title', 'pageTitle']);
  const metaTitle = pickString(o, ['metaTitle', 'meta_title']) || title;
  const metaDescription = pickString(o, ['metaDescription', 'meta_description', 'description']);
  const h1 = pickString(o, ['h1', 'heading']) || title;
  const editorialTitle = pickString(o, ['editorialTitle', 'editorial_title']) || h1 || title;
  const subtitle = pickString(o, ['subtitle', 'heroSubtitle']);
  const introText = pickString(o, ['intro', 'introText', 'introduction', 'uvod']);
  const mainContent = pickString(o, ['mainContent', 'main_content', 'mainText', 'body', 'content', 'text']);
  const highlights = pickTextOrList(o, ['highlights', 'zajimavosti', 'zajímavosti', 'interesting', 'surroundings']);
  const tips = pickTextOrList(o, ['tips', 'tipy', 'buyerTips', 'buyer_tips', 'advice']);
  const slugSuggestion =
    pickString(o, ['slug', 'slugSuggestion', 'slug_suggestion']).replace(/^\/+/, '') ||
    slugify(ctx.locationName);

  const layoutRaw = String(o.layout ?? o.layoutType ?? 'LOCALITY_GUIDE').toUpperCase();
  const layout = (SEO_AI_LAYOUT_TYPES as readonly string[]).includes(layoutRaw)
    ? (layoutRaw as SeoAiLayoutTypeName)
    : 'LOCALITY_GUIDE';

  const faq = ensureFaq(parseFaq(o.faq), ctx);
  const internalLinks = buildInternalLinks(o.internalLinks, ctx);

  const ctaRaw = o.cta;
  let cta = {
    title: '',
    text: '',
    buttonLabel: 'Zjistit více',
    buttonPath: '/',
  };
  if (ctaRaw && typeof ctaRaw === 'object') {
    const c = ctaRaw as Record<string, unknown>;
    cta = {
      title: sanitize(String(c.title ?? '')),
      text: sanitize(String(c.text ?? c.description ?? '')),
      buttonLabel: sanitize(String(c.buttonLabel ?? c.button_label ?? 'Zjistit více')) || 'Zjistit více',
      buttonPath: String(c.buttonPath ?? c.button_path ?? '/').trim() || '/',
    };
  }
  if (!cta.title) cta.title = `Další krok v ${ctx.locationName}`;
  if (!cta.text) {
    cta.text = ctx.hasListings
      ? 'Projděte si průvodce, porovnejte nabídky a využijte nástroje portálu XXREALIT.'
      : 'Projděte si průvodce, nastavte hlídání nebo vložte vlastní inzerát na portálu XXREALIT.';
  }

  const sourceClaims: SeoAiPageOutput['sourceClaims'] = [];
  if (Array.isArray(o.sourceClaims)) {
    for (const item of o.sourceClaims.slice(0, 30)) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const claim = sanitize(String(row.claim ?? ''));
      if (!claim) continue;
      sourceClaims.push({
        claim,
        sourceType: String(row.sourceType ?? 'MANUAL') as SeoAiPageOutput['sourceClaims'][number]['sourceType'],
        sourceId: row.sourceId ? String(row.sourceId) : undefined,
        verified: Boolean(row.verified),
      });
    }
  }

  const resolvedMetaTitle =
    metaTitle ||
    `${ctx.offerLabel} ${ctx.locationName} – průvodce`.slice(0, 80);
  const resolvedMetaDescription =
    metaDescription ||
    introText ||
    mainContent.slice(0, 160) ||
    `Praktický průvodce ${ctx.offerLabel.toLowerCase()} v ${ctx.locationName} na portálu XXREALIT.`;
  const resolvedH1 = h1 || `${ctx.offerLabel} v ${ctx.locationName}`;
  const resolvedIntro =
    introText || mainContent.slice(0, 400) || `Průvodce ${ctx.offerLabel.toLowerCase()} v ${ctx.locationName}.`;
  const resolvedMain =
    mainContent || [resolvedIntro, highlights, tips].filter(Boolean).join('\n\n');

  const blocksAdded: SeoAiBuildLog['blocksAdded'] = [];
  const legacyBlocks = parseLegacyBlocks(o.blocks);
  const blocksFromAi = legacyBlocks.length;
  const blocks: SeoAiContentBlock[] = [...legacyBlocks];
  const hasType = (type: SeoAiContentBlock['type']) => blocks.some((b) => b.type === type);

  const addBlock = (
    type: SeoAiContentBlock['type'],
    title: string,
    content: string,
    reason: string,
  ) => {
    if (!content.trim()) return;
    if (blocks.some((b) => b.type === type && b.title === title)) return;
    blocks.push({ type, title, content });
    blocksAdded.push({ type, title, reason });
  };

  if (!hasType('HERO')) {
    addBlock(
      'HERO',
      `${ctx.locationName} – průvodce`,
      resolvedIntro.slice(0, 400),
      'doplněno z úvodu / hlavního textu',
    );
  }
  if (!hasType('INTRO')) {
    addBlock('INTRO', 'Úvod', resolvedIntro, 'doplněno z intro / hlavního textu');
  }

  const contentSections = splitByHeadings(resolvedMain);
  if (contentSections.length > 1) {
    if (!blocks.some((b) => b.type === 'MAIN_CONTENT')) {
      for (const section of contentSections) {
        addBlock('MAIN_CONTENT', section.title, section.content, 'rozděleno podle nadpisů v hlavním textu');
      }
    }
  } else {
    const paragraphs = splitByParagraphs(resolvedMain, 2);
    if (!blocks.some((b) => b.type === 'MAIN_CONTENT')) {
      paragraphs.forEach((para, idx) => {
        addBlock(
          'MAIN_CONTENT',
          idx === 0 ? 'Obsah' : `Obsah – část ${idx + 1}`,
          para,
          'rozděleno z hlavního textu',
        );
      });
    }
  }

  if (!hasType('SURROUNDINGS')) {
    addBlock(
      'SURROUNDINGS',
      `Zajímavosti v ${ctx.locationName}`,
      highlights || resolvedMain.slice(0, 500),
      highlights ? 'z AI pole highlights/zajímavosti' : 'doplněno z hlavního textu',
    );
  }

  if (!hasType('BUYER_TIPS') && tips) {
    addBlock('BUYER_TIPS', 'Tipy', tips, 'z AI pole tips/tipy');
  } else if (!hasType('BUYER_TIPS')) {
    addBlock(
      'BUYER_TIPS',
      'Praktické tipy',
      `Při ${ctx.offerLabel.toLowerCase()} v ${ctx.locationName} ověřte stav nemovitosti, náklady na provoz a dostupnost služeb.`,
      'automaticky doplněno',
    );
  }

  if (!hasType('FAQ')) {
    const faqPreview = faq.map((f) => `${f.question} ${f.answer}`).join(' ').slice(0, 600);
    addBlock('FAQ', 'Časté dotazy', faqPreview, 'sestaveno z pole FAQ');
  }

  if (!hasType('CTA')) {
    addBlock('CTA', cta.title, `${cta.text}`, 'doplněno z CTA / šablony');
  }

  if (!hasType('INTERNAL_LINKS') && internalLinks.length) {
    const linkText = internalLinks.map((l) => `${l.label}: ${l.path}`).join('\n');
    addBlock('INTERNAL_LINKS', 'Související stránky', linkText, 'doplněno z interních odkazů');
  }

  if (!ctx.hasListings && !hasType('NO_LISTINGS_GUIDE')) {
    addBlock(
      'NO_LISTINGS_GUIDE',
      'Aktuálně bez nabídek v databázi',
      'V tuto chvíli nemáme aktivní nabídky pro tuto kombinaci. Můžete nastavit hlídání, prohlédnout okolní lokality nebo vložit vlastní inzerát.',
      'bez aktivních inzerátů',
    );
  }

  for (const template of MIN_LAYOUT) {
    if (blocks.some((b) => b.type === template.type)) continue;
    const source = resolvedMain || resolvedIntro;
    addBlock(
      template.type,
      template.title,
      source.slice(0, 400) || `${template.title} – ${ctx.locationName}`,
      'minimální layout – automaticky doplněno',
    );
  }

  const log: SeoAiBuildLog = {
    aiFieldsReceived,
    blocksFromAi,
    blocksAdded,
    finalBlockCount: blocks.length,
    finalBlockTypes: blocks.map((b) => b.type),
  };

  const output: SeoAiPageOutput = {
    layout,
    slugSuggestion,
    editorialTitle: editorialTitle || resolvedH1,
    subtitle,
    metaTitle: resolvedMetaTitle.slice(0, 80),
    metaDescription: resolvedMetaDescription.slice(0, 200),
    h1: resolvedH1,
    introText: resolvedIntro,
    mainContent: resolvedMain,
    blocks: blocks.slice(0, 20),
    faq,
    internalLinks,
    cta,
    sourceClaims,
  };

  return { output, log, rawAiJson: raw };
}
