import { parseStringPromise } from 'xml2js';
import { NEWS_FETCH_TIMEOUT_MS } from './news-editorial.constants';

export type ParsedFeedItem = {
  externalId: string | null;
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
  author: string | null;
  imageUrl: string | null;
};

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0].trim() || null;
  if (v && typeof v === 'object' && '_' in (v as Record<string, unknown>)) {
    const inner = (v as { _: unknown })._;
    return typeof inner === 'string' ? inner.trim() || null : null;
  }
  return null;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function itemLink(item: Record<string, unknown>): string | null {
  const link = item.link;
  if (typeof link === 'string') return link.trim() || null;
  if (Array.isArray(link)) {
    for (const entry of link) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim();
      if (entry && typeof entry === 'object') {
        const href = (entry as Record<string, unknown>).$;
        if (href && typeof href === 'object' && 'href' in (href as Record<string, unknown>)) {
          const u = (href as { href?: unknown }).href;
          if (typeof u === 'string' && u.trim()) return u.trim();
        }
      }
    }
  }
  if (link && typeof link === 'object' && '$' in link) {
    const href = (link as { $?: { href?: unknown } }).$?.href;
    if (typeof href === 'string' && href.trim()) return href.trim();
  }
  const id = firstString(item.id);
  if (id?.startsWith('http')) return id;
  return null;
}

function itemSummary(item: Record<string, unknown>): string | null {
  return (
    firstString(item.summary) ??
    firstString(item.description) ??
    firstString(item.content)
  );
}

function itemImage(item: Record<string, unknown>): string | null {
  const enclosure = item.enclosure;
  if (Array.isArray(enclosure)) {
    for (const enc of enclosure) {
      if (enc && typeof enc === 'object') {
        const rec = enc as Record<string, unknown>;
        const attrs = rec.$ as Record<string, unknown> | undefined;
        const url = attrs?.url;
        if (typeof url === 'string' && url.trim()) return url.trim();
      }
    }
  } else if (enclosure && typeof enclosure === 'object') {
    const rec = enclosure as Record<string, unknown>;
    const attrs = rec.$ as Record<string, unknown> | undefined;
    const url = attrs?.url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  const media = item['media:content'] ?? item['media:thumbnail'];
  if (Array.isArray(media) && media[0] && typeof media[0] === 'object') {
    const attrs = (media[0] as Record<string, unknown>).$ as Record<string, unknown> | undefined;
    const url = attrs?.url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return null;
}

function parseRssItems(channel: Record<string, unknown>): ParsedFeedItem[] {
  const rawItems = channel.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return items
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;
      const title = firstString(item.title);
      const link = itemLink(item);
      if (!title || !link) return null;
      return {
        externalId: firstString(item.guid) ?? firstString(item.id),
        title,
        link,
        summary: itemSummary(item),
        publishedAt: parseDate(firstString(item.pubDate) ?? firstString(item.published)),
        author: firstString(item.author) ?? firstString(item['dc:creator']),
        imageUrl: itemImage(item),
      } satisfies ParsedFeedItem;
    })
    .filter((x) => x != null) as ParsedFeedItem[];
}

function parseAtomEntries(feed: Record<string, unknown>): ParsedFeedItem[] {
  const rawEntries = feed.entry;
  const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
  return entries
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const entry = raw as Record<string, unknown>;
      const title = firstString(entry.title);
      const link = itemLink(entry);
      if (!title || !link) return null;
      return {
        externalId: firstString(entry.id),
        title,
        link,
        summary: itemSummary(entry),
        publishedAt: parseDate(
          firstString(entry.updated) ?? firstString(entry.published),
        ),
        author: firstString(entry.author),
        imageUrl: itemImage(entry),
      } satisfies ParsedFeedItem;
    })
    .filter((x) => x != null) as ParsedFeedItem[];
}

export async function parseFeedXml(xml: string): Promise<ParsedFeedItem[]> {
  const parsed = (await parseStringPromise(xml, {
    explicitArray: true,
    trim: true,
    mergeAttrs: false,
  })) as Record<string, unknown>;

  if (parsed.rss && typeof parsed.rss === 'object') {
    const rss = parsed.rss as Record<string, unknown>;
    const channel = rss.channel;
    if (Array.isArray(channel) && channel[0] && typeof channel[0] === 'object') {
      return parseRssItems(channel[0] as Record<string, unknown>);
    }
    if (channel && typeof channel === 'object') {
      return parseRssItems(channel as Record<string, unknown>);
    }
  }

  if (parsed.feed && typeof parsed.feed === 'object') {
    return parseAtomEntries(parsed.feed as Record<string, unknown>);
  }

  return [];
}

export const NEWS_FETCH_USER_AGENT =
  'XXREALIT-NewsBot/1.0 (+https://www.xxrealit.cz)';

export type FeedFetchErrorCode =
  | 'DNS_ERROR'
  | 'TIMEOUT'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_500'
  | 'HTTP_ERROR'
  | 'INVALID_XML'
  | 'INVALID_RSS'
  | 'EMPTY_FEED'
  | 'UNSUPPORTED_ENCODING'
  | 'REDIRECT_LOOP'
  | 'UNKNOWN';

export type FeedFetchDiagnostics = {
  ok: boolean;
  errorCode?: FeedFetchErrorCode;
  errorMessage?: string;
  requestedUrl: string;
  finalUrl: string;
  httpStatus?: number;
  contentType?: string | null;
  responseTimeMs: number;
  encoding?: string | null;
  feedTitle?: string | null;
  itemCount: number;
  latestItem?: {
    title: string;
    url: string;
    publishedAt: string | null;
  } | null;
  parserOk: boolean;
  items: ParsedFeedItem[];
  previewItems: Array<{
    title: string;
    url: string;
    publishedAt: string | null;
  }>;
};

function classifyFetchError(err: unknown, httpStatus?: number): FeedFetchErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('abort') || lower.includes('timeout')) return 'TIMEOUT';
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) return 'DNS_ERROR';
  if (lower.includes('redirect loop')) return 'REDIRECT_LOOP';
  if (lower.includes('invalid xml') || lower.includes('non-whitespace')) return 'INVALID_XML';
  if (httpStatus === 403) return 'HTTP_403';
  if (httpStatus === 404) return 'HTTP_404';
  if (httpStatus != null && httpStatus >= 500) return 'HTTP_500';
  if (httpStatus != null && httpStatus >= 400) return 'HTTP_ERROR';
  return 'UNKNOWN';
}

function extractFeedTitle(xml: string): string | null {
  const match =
    /<title[^>]*>([^<]+)<\/title>/i.exec(xml) ??
    /<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i.exec(xml);
  return match?.[1]?.trim() || null;
}

export async function fetchFeedDiagnostics(
  url: string,
  timeoutMs = NEWS_FETCH_TIMEOUT_MS,
): Promise<FeedFetchDiagnostics> {
  const requestedUrl = url.trim();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(requestedUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': NEWS_FETCH_USER_AGENT,
      },
    });
    const finalUrl = res.url || requestedUrl;
    const contentType = res.headers.get('content-type');
    const responseTimeMs = Date.now() - started;

    if (!res.ok) {
      const code = classifyFetchError(new Error(`HTTP ${res.status}`), res.status);
      return {
        ok: false,
        errorCode: code,
        errorMessage: `Server dostal HTTP ${res.status} od zdroje.`,
        requestedUrl,
        finalUrl,
        httpStatus: res.status,
        contentType,
        responseTimeMs,
        itemCount: 0,
        parserOk: false,
        items: [],
        previewItems: [],
      };
    }

    const xml = await res.text();
    const feedTitle = extractFeedTitle(xml);
    let items: ParsedFeedItem[] = [];
    let parserOk = true;
    let errorCode: FeedFetchErrorCode | undefined;
    let errorMessage: string | undefined;

    try {
      items = await parseFeedXml(xml);
      if (!items.length) {
        errorCode = 'EMPTY_FEED';
        errorMessage = 'Feed neobsahuje žádné položky.';
        parserOk = true;
      }
    } catch (err) {
      parserOk = false;
      errorCode = 'INVALID_RSS';
      errorMessage = err instanceof Error ? err.message : 'Parser selhal.';
    }

    const sorted = [...items].sort((a, b) => {
      const ta = a.publishedAt?.getTime() ?? 0;
      const tb = b.publishedAt?.getTime() ?? 0;
      return tb - ta;
    });
    const latest = sorted[0];
    const previewItems = sorted.slice(0, 5).map((item) => ({
      title: item.title,
      url: item.link,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    }));

    return {
      ok: parserOk && items.length > 0,
      errorCode: items.length ? errorCode : errorCode ?? 'EMPTY_FEED',
      errorMessage,
      requestedUrl,
      finalUrl,
      httpStatus: res.status,
      contentType,
      responseTimeMs,
      encoding: 'UTF-8',
      feedTitle,
      itemCount: items.length,
      latestItem: latest
        ? {
            title: latest.title,
            url: latest.link,
            publishedAt: latest.publishedAt?.toISOString() ?? null,
          }
        : null,
      parserOk,
      items,
      previewItems,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - started;
    const errorCode = classifyFetchError(err);
    const errorMessage =
      errorCode === 'TIMEOUT'
        ? 'Vypršel timeout při stahování RSS.'
        : errorCode === 'DNS_ERROR'
          ? 'DNS lookup selhal — server nedokázal najít hostitele.'
          : err instanceof Error
            ? err.message
            : String(err);
    return {
      ok: false,
      errorCode,
      errorMessage,
      requestedUrl,
      finalUrl: requestedUrl,
      responseTimeMs,
      itemCount: 0,
      parserOk: false,
      items: [],
      previewItems: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeedText(url: string, timeoutMs = NEWS_FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': NEWS_FETCH_USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
