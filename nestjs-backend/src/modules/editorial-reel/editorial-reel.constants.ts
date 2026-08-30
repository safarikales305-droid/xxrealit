export const EDITORIAL_REEL_SETTINGS_KEY = 'editorial_reel_settings';

export const DEFAULT_CONTENT_SOURCE_CATEGORIES: Array<{ slug: string; label: string; sortOrder: number }> = [
  { slug: 'makleri', label: 'Makléři', sortOrder: 10 },
  { slug: 'realitni-kancelare', label: 'Realitní kanceláře', sortOrder: 20 },
  { slug: 'developerske-projekty', label: 'Developerské projekty', sortOrder: 30 },
  { slug: 'stavebni-firmy', label: 'Stavební firmy', sortOrder: 40 },
  { slug: 'remeslnici', label: 'Řemeslníci', sortOrder: 50 },
  { slug: 'architektura', label: 'Architektura', sortOrder: 60 },
  { slug: 'interiery', label: 'Interiéry', sortOrder: 70 },
  { slug: 'rekonstrukce', label: 'Rekonstrukce', sortOrder: 80 },
  { slug: 'hypoteky-finance', label: 'Hypotéky a finance', sortOrder: 90 },
  { slug: 'investice', label: 'Investice', sortOrder: 100 },
  { slug: 'pravo-legislativa', label: 'Právo a legislativa', sortOrder: 110 },
  { slug: 'bydleni', label: 'Bydlení', sortOrder: 120 },
  { slug: 'ubytovani-cestovani', label: 'Ubytování a cestování', sortOrder: 130 },
  { slug: 'technologie-pro-reality', label: 'Technologie pro reality', sortOrder: 140 },
  { slug: 'ostatni', label: 'Ostatní', sortOrder: 999 },
];

export const EDITORIAL_REEL_WORKER_TICK_MS = Math.max(
  30_000,
  Number(process.env.EDITORIAL_REEL_WORKER_TICK_MS ?? 120_000) || 120_000,
);
