/**
 * Konfigurace Reality.cz scraperu ukládaná v ImportSource.settingsJson (admin).
 * Klíče mají prefix scraper*, aby se nepletly s jinými zdroji.
 */

export type RealityCzScraperRequestLogEntry = {
  phase: 'list_page' | 'detail_page';
  url: string;
  attempt: number;
  status?: number;
  waitBeforeRetryMs?: number;
  note?: string;
};

export type RealityCzScraperRuntimeSettings = {
  requestDelayMs: number;
  maxRetries: number;
  backoffMultiplier: number;
  baseBackoffMsOn429: number;
  /** 0 = žádné HTTP na detail (bezpečný režim). */
  maxDetailFetchesPerRun: number;
  /** true = vynutit maxDetailFetchesPerRun = 0 (import jen z výpisové stránky). */
  listOnlyImport: boolean;
  /** Paralelní stažení detailů (dávky); mezi dávkovými bloky se drží requestDelayMs. */
  detailConcurrency: number;
};

const DEFAULTS: RealityCzScraperRuntimeSettings = {
  requestDelayMs: 2600,
  maxRetries: 6,
  backoffMultiplier: 2,
  baseBackoffMsOn429: 12_000,
  /** Počet detailních stránek za běh — má pokrýt celý výpis (listing jen jako zdroj URL). */
  maxDetailFetchesPerRun: 200,
  listOnlyImport: false,
  /** Nižší výchozí souběžnost = méně HTTP/2 a síťových chyb vůči Reality.cz / proxy. */
  detailConcurrency: 2,
};

function num(
  raw: Record<string, unknown> | null | undefined,
  key: string,
  def: number,
  min: number,
  max: number,
): number {
  if (!raw) return def;
  const v = raw[key];
  const x =
    typeof v === 'number' && Number.isFinite(v)
      ? v
      : typeof v === 'string'
        ? Number.parseFloat(v)
        : def;
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function floatInRange(
  raw: Record<string, unknown> | null | undefined,
  key: string,
  def: number,
  min: number,
  max: number,
): number {
  if (!raw) return def;
  const v = raw[key];
  const x =
    typeof v === 'number' && Number.isFinite(v)
      ? v
      : typeof v === 'string'
        ? Number.parseFloat(v)
        : def;
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, x));
}

function bool(raw: Record<string, unknown> | null | undefined, key: string, def: boolean): boolean {
  if (!raw) return def;
  const v = raw[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return def;
}

export function parseRealityCzScraperSettings(
  raw: Record<string, unknown> | null | undefined,
): RealityCzScraperRuntimeSettings {
  const listOnly = bool(raw, 'scraperListOnlyImport', DEFAULTS.listOnlyImport);
  const maxDetail = listOnly
    ? 0
    : num(raw, 'scraperMaxDetailFetchesPerRun', DEFAULTS.maxDetailFetchesPerRun, 0, 500);
  return {
    requestDelayMs: num(raw, 'scraperRequestDelayMs', DEFAULTS.requestDelayMs, 400, 60_000),
    maxRetries: num(raw, 'scraperMaxRetries', DEFAULTS.maxRetries, 1, 12),
    backoffMultiplier: floatInRange(
      raw,
      'scraperBackoffMultiplier',
      DEFAULTS.backoffMultiplier,
      1.25,
      4,
    ),
    baseBackoffMsOn429: num(
      raw,
      'scraperBaseBackoffMsOn429',
      DEFAULTS.baseBackoffMsOn429,
      2000,
      180_000,
    ),
    maxDetailFetchesPerRun: maxDetail,
    listOnlyImport: listOnly,
    detailConcurrency: num(raw, 'scraperDetailConcurrency', DEFAULTS.detailConcurrency, 1, 8),
  };
}

export function scraperSettingsForLog(s: RealityCzScraperRuntimeSettings): Record<string, unknown> {
  return { ...s };
}
