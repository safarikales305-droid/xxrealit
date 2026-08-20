import { NewsSourceType } from '@prisma/client';

export const NEWS_EDITORIAL_ENABLED =
  (process.env.NEWS_EDITORIAL_ENABLED ?? 'true').toLowerCase() === 'true';

export const NEWS_WORKER_TICK_MS = Math.max(
  15_000,
  Number(process.env.NEWS_WORKER_TICK_MS ?? 60_000) || 60_000,
);

export const NEWS_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.NEWS_FETCH_TIMEOUT_MS ?? 20_000) || 20_000,
);

export const NEWS_FETCH_RETRY_DELAYS_MS = [2000, 5000, 15_000, 30_000, 60_000];

export const NEWS_MAX_FETCH_FAILURES = 5;

export const NEWS_SETTINGS_KEY = 'news_automation_settings';

export const NEWS_TITLE_SIMILARITY_THRESHOLD = 0.82;

export const NEWS_ARTICLE_CATEGORIES = [
  'reality',
  'hypoteky',
  'bydleni',
  'ceny-nemovitosti',
  'najmy',
  'stavebnictvi',
  'development',
  'katastr',
  'legislativa',
  'energetika',
  'rekonstrukce',
  'investice',
  'trh',
  'regiony',
  'ubytovani',
] as const;

export type NewsArticleCategory = (typeof NEWS_ARTICLE_CATEGORIES)[number];

export const NEWS_CATEGORY_LABELS: Record<NewsArticleCategory, string> = {
  reality: 'Reality',
  hypoteky: 'Hypotéky',
  bydleni: 'Bydlení',
  'ceny-nemovitosti': 'Ceny nemovitostí',
  najmy: 'Nájmy',
  stavebnictvi: 'Stavebnictví',
  development: 'Development',
  katastr: 'Katastr nemovitostí',
  legislativa: 'Legislativa',
  energetika: 'Energetika',
  rekonstrukce: 'Rekonstrukce',
  investice: 'Investice',
  trh: 'Realitní trh',
  regiony: 'Regionální informace',
  ubytovani: 'Ubytování',
};

export const NEWS_IGNORE_KEYWORDS = [
  'sport',
  'fotbal',
  'hokej',
  'tenis',
  'celebrity',
  'zahraniční politika',
  'volby',
  'kriminalita',
  'dopravní nehoda',
  'požár',
  'počasí',
  'horoskop',
  'křížovka',
];

export type DefaultNewsSourceSeed = {
  name: string;
  url: string;
  type: NewsSourceType;
  category: NewsArticleCategory;
  enabled: boolean;
  trustScore: number;
  priority: number;
  checkIntervalMinutes: number;
  note?: string;
};

export const LEGACY_NEWS_SOURCE_URL_FIXES: Record<string, string> = {
  'https://www.cnb.cz/cs/novinky-a-media/rss/':
    'https://www.cnb.cz/cs/.content/rss-feed/rss-feed_tz.rss',
  'https://www.czso.cz/csu/czso/rss': 'https://www.hypoindex.cz/feed',
  'https://mmr.gov.cz/rss': 'https://www.e15.cz/rss/bydleni',
};

export const DEFAULT_NEWS_SOURCES: DefaultNewsSourceSeed[] = [
  {
    name: 'ČNB – Tiskové zprávy',
    url: 'https://www.cnb.cz/cs/.content/rss-feed/rss-feed_tz.rss',
    type: NewsSourceType.RSS,
    category: 'hypoteky',
    enabled: true,
    trustScore: 95,
    priority: 90,
    checkIntervalMinutes: 30,
    note: 'Úrokové sazby, měnová politika — oficiální RSS ČNB',
  },
  {
    name: 'Hypoindex',
    url: 'https://www.hypoindex.cz/feed',
    type: NewsSourceType.RSS,
    category: 'hypoteky',
    enabled: true,
    trustScore: 85,
    priority: 75,
    checkIntervalMinutes: 60,
    note: 'Hypoteční sazby a trh',
  },
  {
    name: 'E15 – Bydlení',
    url: 'https://www.e15.cz/rss/bydleni',
    type: NewsSourceType.RSS,
    category: 'bydleni',
    enabled: true,
    trustScore: 80,
    priority: 65,
    checkIntervalMinutes: 60,
    note: 'Bydlení, reality a stavebnictví',
  },
];
