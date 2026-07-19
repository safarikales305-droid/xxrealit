import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import {
  RUIAN_VFR_DAILY_ATOM_URL,
  RUIAN_VFR_MONTHLY_BASE_URL,
  RUIAN_VFR_STATE_FILE_TOKEN,
} from './ruian-vfr.official.constants';
import { sanitizeXmlInput } from './seo-location-import.util';

export type RuianVfrFileRef = {
  url: string;
  filename: string;
  kind: 'full' | 'delta';
  version: string;
  publishedAt?: string;
  datasetType: string;
  sizeLabel?: string;
};

/** Priorita stavových souborů pro kompletní import hierarchie. */
const FULL_STATE_PRIORITY = ['ST_UKSG', 'ST_UKSH', 'ST_UZSZ'] as const;

function formatYm(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseIndexEntries(html: string): Array<{ href: string; sizeLabel?: string }> {
  const entries: Array<{ href: string; sizeLabel?: string }> = [];
  const rowRe =
    /<tr>\s*<td[^>]*>([^<]*)<\/td>\s*<td><a href="([^"]+\.zip)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    entries.push({ sizeLabel: m[1]?.trim(), href: m[2]! });
  }
  if (entries.length) return entries;

  const linkRe = /href="([^"]+\.zip)"/gi;
  while ((m = linkRe.exec(html)) !== null) {
    entries.push({ href: m[1]! });
  }
  return entries;
}

function resolveZipUrl(href: string, indexUrl: string): string {
  if (href.startsWith('http')) return href;
  return new URL(href, indexUrl).toString();
}

function pickBestStateFile(
  entries: Array<{ href: string; sizeLabel?: string }>,
  indexUrl: string,
): RuianVfrFileRef | null {
  const candidates: Array<RuianVfrFileRef & { sortKey: string }> = [];

  for (const entry of entries) {
    const filename = entry.href.split('/').pop() ?? entry.href;
    const upper = filename.toUpperCase();
    if (!upper.includes(RUIAN_VFR_STATE_FILE_TOKEN) && !FULL_STATE_PRIORITY.some((t) => upper.includes(t))) {
      continue;
    }
    const datasetType =
      FULL_STATE_PRIORITY.find((t) => upper.includes(t)) ??
      (upper.includes(RUIAN_VFR_STATE_FILE_TOKEN) ? 'ST_UKSG' : 'UNKNOWN');
    const dateMatch = filename.match(/^(\d{8})/);
    const sortKey = dateMatch?.[1] ?? filename;
    candidates.push({
      url: resolveZipUrl(entry.href, indexUrl),
      filename,
      kind: 'full',
      version: sortKey.slice(0, 6),
      publishedAt: dateMatch?.[1] ?? undefined,
      datasetType,
      sizeLabel: entry.sizeLabel,
      sortKey,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const pa = FULL_STATE_PRIORITY.indexOf(a.datasetType as (typeof FULL_STATE_PRIORITY)[number]);
    const pb = FULL_STATE_PRIORITY.indexOf(b.datasetType as (typeof FULL_STATE_PRIORITY)[number]);
    const prioA = pa >= 0 ? pa : 99;
    const prioB = pb >= 0 ? pb : 99;
    if (prioA !== prioB) return prioA - prioB;
    return b.sortKey.localeCompare(a.sortKey);
  });

  const best = candidates[0]!;
  const { sortKey: _sk, ...rest } = best;
  return rest;
}

/** Najde nejnovější měsíční stavový ST_UKSG/ST_UKSH na services.cuzk.gov.cz/vfr/YYYYMM/ */
export async function discoverLatestMonthlyVfrFile(): Promise<RuianVfrFileRef | null> {
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
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
      const entries = parseIndexEntries(html);
      const picked = pickBestStateFile(entries, indexUrl);
      if (picked) return picked;
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
  const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];
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
    datasetType: 'ST_ZZSG',
  };
}

export async function discoverRuianVfrFile(mode: 'full' | 'delta'): Promise<RuianVfrFileRef | null> {
  return mode === 'full' ? discoverLatestMonthlyVfrFile() : discoverLatestDailyVfrFile();
}

export function isStateVfrFilename(name: string): boolean {
  const u = name.toUpperCase();
  return u.includes(RUIAN_VFR_STATE_FILE_TOKEN) || FULL_STATE_PRIORITY.some((t) => u.includes(t));
}

export function isDeltaVfrFilename(name: string): boolean {
  return /ZZSG|ZZSZ/i.test(name);
}
