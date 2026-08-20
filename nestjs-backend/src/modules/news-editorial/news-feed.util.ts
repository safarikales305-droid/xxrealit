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

export async function fetchFeedText(url: string, timeoutMs = NEWS_FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'XXREALIT-NewsBot/1.0',
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
