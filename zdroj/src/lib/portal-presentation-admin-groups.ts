import type { PortalPresentationSection } from '@/lib/portal-presentation';

export type PageFieldDef = {
  key:
    | 'metaTitle'
    | 'metaDescription'
    | 'metaKeywords'
    | 'ogImageUrl'
    | 'canonicalUrl'
    | 'heroBadgeText'
    | 'heroTitle'
    | 'heroSubtitle'
    | 'heroCtaLabel'
    | 'heroCtaUrl'
    | 'heroSecondaryCtaLabel'
    | 'heroSecondaryCtaUrl'
    | 'contactEmail'
    | 'contactPhone'
    | 'contactAddress'
    | 'faqTitle';
  label: string;
  multiline?: boolean;
};

export type PresentationAdminGroup = {
  id: string;
  label: string;
  description?: string;
  pageFields?: PageFieldDef[];
  sectionAnchors?: string[];
  kind?: 'faq' | 'sections' | 'page';
};

/** Skupiny pro administraci textů stránky /o-portalu */
export const PORTAL_PRESENTATION_ADMIN_GROUPS: PresentationAdminGroup[] = [
  {
    id: 'hero',
    label: '1. Hero sekce',
    description: 'Úvodní obrazovka stránky — nadpisy, popis a tlačítka.',
    kind: 'page',
    pageFields: [
      { key: 'heroBadgeText', label: 'Malý nadpis nad titulkem' },
      { key: 'heroTitle', label: 'Hlavní nadpis' },
      { key: 'heroSubtitle', label: 'Podnadpis / úvodní text', multiline: true },
      { key: 'heroCtaLabel', label: 'Text primárního tlačítka' },
      { key: 'heroCtaUrl', label: 'URL primárního tlačítka' },
      { key: 'heroSecondaryCtaLabel', label: 'Text sekundárního tlačítka' },
      { key: 'heroSecondaryCtaUrl', label: 'URL sekundárního tlačítka' },
    ],
  },
  {
    id: 'audience',
    label: '2. Pro koho je portál',
    description: 'Úvod, popis portálu a důvod vzniku.',
    kind: 'sections',
    sectionAnchors: ['uvod', 'o-portalu', 'proc-vznikl'],
  },
  {
    id: 'features',
    label: '3. Funkce portálu',
    description: 'Shorts, inzerce, sociální síť, marketplace a další funkce.',
    kind: 'sections',
    sectionAnchors: [
      'shorts',
      'klasicka-inzerce',
      'socialni-sit',
      'marketplace',
      'whatsapp-centrum',
      'email-centrum',
      'import-inzeratu',
      'administrace',
      'statistiky',
      'reklama',
      'kreditni-system',
      'mobilni-aplikace',
      'bezpecnost',
      'budouci-rozvoj',
    ],
  },
  {
    id: 'benefits',
    label: '4. Výhody portálu',
    description: 'Hlavní výhody a benefity pro soukromé osoby.',
    kind: 'sections',
    sectionAnchors: ['hlavni-vyhody', 'vyhody-soukrome-osoby', 'platba-za-zajemce'],
  },
  {
    id: 'tipsters',
    label: '5. Tipaři',
    description: 'Tipařský program a postup krok za krokem.',
    kind: 'sections',
    sectionAnchors: ['tipari', 'tipar-proces'],
  },
  {
    id: 'free-listing',
    label: '6. Inzerce zdarma',
    description: 'Texty o bezplatné inzerci.',
    kind: 'sections',
    sectionAnchors: ['inzerce-zdarma'],
  },
  {
    id: 'professionals',
    label: '7. Profesionálové',
    description: 'Profesionální účty, profily a výhody podle role.',
    kind: 'sections',
    sectionAnchors: [
      'profesionalni-ucty',
      'verejne-profily',
      'hodnoceni',
      'vyhody-makleri',
      'vyhody-rk',
      'vyhody-developeri',
      'vyhody-stavebni-firmy',
      'vyhody-investori',
      'vyhody-financni-poradci',
    ],
  },
  {
    id: 'cta',
    label: '8. Kontakt / výzva k akci',
    description: 'Kontaktní údaje a závěrečná výzva k registraci.',
    kind: 'sections',
    sectionAnchors: ['kontakt', 'cta'],
    pageFields: [
      { key: 'contactEmail', label: 'Kontaktní e-mail' },
      { key: 'contactPhone', label: 'Kontaktní telefon' },
      { key: 'contactAddress', label: 'Kontaktní adresa / popis', multiline: true },
    ],
  },
  {
    id: 'seo',
    label: '9. SEO nastavení',
    description: 'Titulek a popis pro vyhledávače a sociální sítě.',
    kind: 'page',
    pageFields: [
      { key: 'metaTitle', label: 'SEO titulek (title)' },
      { key: 'metaDescription', label: 'SEO popis (description)', multiline: true },
      { key: 'metaKeywords', label: 'SEO klíčová slova', multiline: true },
      { key: 'canonicalUrl', label: 'Canonical URL' },
      { key: 'ogImageUrl', label: 'OG obrázek URL' },
    ],
  },
  {
    id: 'faq',
    label: 'Časté dotazy (FAQ)',
    description: 'Otázky a odpovědi na konci stránky.',
    kind: 'faq',
    pageFields: [{ key: 'faqTitle', label: 'Nadpis sekce FAQ' }],
  },
];

export function sectionsForGroup(
  group: PresentationAdminGroup,
  sections: PortalPresentationSection[],
): PortalPresentationSection[] {
  if (!group.sectionAnchors?.length) return [];
  const byAnchor = new Map(sections.map((s) => [s.anchor, s]));
  return group.sectionAnchors
    .map((anchor) => byAnchor.get(anchor))
    .filter((s): s is PortalPresentationSection => Boolean(s));
}

export function ungroupedSections(
  sections: PortalPresentationSection[],
): PortalPresentationSection[] {
  const assigned = new Set(
    PORTAL_PRESENTATION_ADMIN_GROUPS.flatMap((g) => g.sectionAnchors ?? []),
  );
  return [...sections]
    .filter((s) => !assigned.has(s.anchor))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sectionTypeLabel(type: string): string {
  switch (type) {
    case 'intro':
      return 'Úvodní sekce';
    case 'feature':
      return 'Popis funkce';
    case 'benefits-grid':
      return 'Výhody (odrážky)';
    case 'process':
      return 'Kroky procesu (JSON)';
    case 'cta-grid':
      return 'Mřížka tlačítek (JSON)';
    default:
      return type;
  }
}

export function bodyUsesRichEditor(sectionType: string): boolean {
  return sectionType === 'feature' || sectionType === 'intro' || sectionType === 'benefits-grid';
}
