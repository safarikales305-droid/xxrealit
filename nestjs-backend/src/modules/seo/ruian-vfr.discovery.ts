import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import {
  RUIAN_VFR_DAILY_ATOM_URL,
  RUIAN_VFR_MONTHLY_BASE_URL,
  RUIAN_VFR_STATE_FILE_TOKEN,
  RUIAN_VFR_DELTA_FILE_TOKEN,
} from './ruian-vfr.official.constants';
import { sanitizeXmlInput } from './seo-location-import.util';

export type RuianVfrFileRef = {
  url: string;
  filename: string;
  kind: 'full' | 'delta';
  version: string;
  publishedAt?: string;
};

function formatYm(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Najde nejnovější měsíční stavový ST_UKSG na services.cuzk.gov.cz/vfr/YYYYMM/ */
export async function discoverLatestMonthlyVfrFile(): Promise<RuianVfrFileRef | null> {
  const now = new Date();
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = formatYm(d);
    const indexUrl = `${RUIAN_VFR_MONTHLY_BASE_URL}/${ym}/`;
    try {
      const res = await axios.get(indexUrl, {
        timeout: 30000,
        responseType: 'text',
        validateStatus: (s: number) => s < 500,
      });
      if (res.status >= 400) continue;
      const html = String(res.data);
      const re = new RegExp(`href="([^"]*${RUIAN_VFR_STATE_FILE_TOKEN}[^"]*\\.zip)"`, 'i');
      const match = html.match(re);
      if (match?.[1]) {
        const href = match[1];
        const url = href.startsWith('http') ? href : new URL(href, indexUrl).toString();
        const filename = url.split('/').pop() ?? href;
        return {
          url,
          filename,
          kind: 'full',
          version: ym,
          publishedAt: `${ym}01`,
        };
      }
    } catch {
      /* try previous month */
    }
  }
  return null;
}

/** Parsuje ATOM feed denních změn RÚIAN-S-K-Z */
export async function discoverLatestDailyVfrFile(): Promise<RuianVfrFileRef | null> {
  const res = await axios.get(RUIAN_VFR_DAILY_ATOM_URL, {
    timeout: 30000,
    responseType: 'text',
  });
  const safe = sanitizeXmlInput(String(res.data));
  const parsed = await parseStringPromise(safe, { explicitArray: false, trim: true });
  const feed = parsed.feed ?? parsed['atom:feed'];
  if (!feed) return null;
  const entries = feed.entry
    ? Array.isArray(feed.entry)
      ? feed.entry
      : [feed.entry]
    : [];
  const sorted = entries
    .map((e: Record<string, unknown>) => {
      const link = e.link as
        | { $?: { href?: string }; href?: string }
        | Array<{ $?: { href?: string }; href?: string }>
        | undefined;
      const first = Array.isArray(link) ? link[0] : link;
      const href = first?.$?.href ?? first?.href;
      const updated = String(e.updated ?? e.published ?? '');
      const title = String(e.title ?? '');
      return { href, updated, title };
    })
    .filter((e: { href?: string; updated: string; title: string }) => e.href && /ZZSG|ZZSZ/i.test(e.title + e.href))
    .sort((a: { updated: string }, b: { updated: string }) => (a.updated < b.updated ? 1 : -1));
  const top = sorted[0];
  if (!top?.href) return null;
  const filename = top.href.split('/').pop() ?? 'delta.zip';
  return {
    url: top.href,
    filename,
    kind: 'delta',
    version: top.updated.slice(0, 10),
    publishedAt: top.updated,
  };
}

export async function discoverRuianVfrFile(mode: 'full' | 'delta'): Promise<RuianVfrFileRef | null> {
  return mode === 'full' ? discoverLatestMonthlyVfrFile() : discoverLatestDailyVfrFile();
}

export function isStateVfrFilename(name: string): boolean {
  return name.toUpperCase().includes(RUIAN_VFR_STATE_FILE_TOKEN);
}

export function isDeltaVfrFilename(name: string): boolean {
  return /ZZSG|ZZSZ/i.test(name);
}
