/**
 * Mapování importní větve (categoryKey) ↔ očekávané cesty a výchozí start URL Reality.cz.
 */

export const DEFAULT_REALITY_BYTY_START_URL = 'https://www.reality.cz/prodej/byty/?strana=1';

function normBranchKey(branchKey: string): string {
  return (branchKey || '')
    .toLowerCase()
    .trim()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '');
}

/**
 * Segmenty cesty, které musí URL obsahovat pro danou větev (prodej i pronájem).
 */
export function getExpectedRealityPathForBranch(branchKey: string): string[] {
  const k = normBranchKey(branchKey);
  switch (k) {
    case 'byty':
      return ['/prodej/byty/', '/pronajem/byty/'];
    case 'domy':
      return ['/prodej/domy/', '/pronajem/domy/'];
    case 'pozemky':
      return ['/prodej/pozemky/', '/pronajem/pozemky/'];
    case 'garaze':
      return ['/prodej/garaze/', '/pronajem/garaze/'];
    case 'komercni':
      return ['/prodej/komercni/', '/pronajem/komercni/'];
    case 'chaty-chalupy':
      return [
        '/prodej/chaty/',
        '/prodej/chalupy/',
        '/prodej/chaty-a-chalupy/',
        '/pronajem/chaty/',
        '/pronajem/chalupy/',
        '/pronajem/chaty-a-chalupy/',
      ];
    default:
      return ['/prodej/'];
  }
}

/** Výchozí výpisová URL pro známou kategorii; null = bez automatické náhrady (např. ostatní / SOAP). */
export function getDefaultRealityStartUrlForCategoryKey(categoryKey: string): string | null {
  const k = normBranchKey(categoryKey);
  switch (k) {
    case 'byty':
      return 'https://www.reality.cz/prodej/byty/?strana=1';
    case 'domy':
      return 'https://www.reality.cz/prodej/domy/?strana=1';
    case 'pozemky':
      return 'https://www.reality.cz/prodej/pozemky/?strana=1';
    case 'garaze':
      return 'https://www.reality.cz/prodej/garaze/?strana=1';
    case 'komercni':
      return 'https://www.reality.cz/prodej/komercni/?strana=1';
    case 'chaty-chalupy':
      return 'https://www.reality.cz/prodej/chaty/?strana=1';
    default:
      return null;
  }
}

/**
 * true, pokud start URL odpovídá kategorii větve (např. domy nesmí mít /byty/).
 */
export function realityStartUrlMatchesBranchCategory(
  startUrl: string,
  categoryKey: string,
): boolean {
  const t = (startUrl ?? '').trim();
  if (!t) return false;
  if (!/^https?:\/\/(www\.)?reality\.cz\/(prodej|pronajem)\//i.test(t)) return false;
  const low = t.toLowerCase();
  const k = normBranchKey(categoryKey);
  if (k === 'soap-main' || k === 'obecne' || k === 'ostatni' || k === '') {
    return true;
  }

  const expected = getExpectedRealityPathForBranch(k);

  if (k === 'domy' && low.includes('/byty/')) return false;
  if (k === 'garaze' && low.includes('/byty/')) return false;
  if (k === 'pozemky' && low.includes('/byty/') && !low.includes('/pozemky/')) return false;
  if (k === 'byty' && low.includes('/domy/') && !low.includes('/byty/')) return false;
  if (k === 'komercni' && low.includes('/byty/') && !low.includes('/komercni/')) return false;
  if (k === 'chaty-chalupy') {
    if (low.includes('/byty/') && !expected.some((p) => low.includes(p))) return false;
  }

  if (expected.length === 1 && expected[0] === '/prodej/') {
    return /reality\.cz\/(prodej|pronajem)\//i.test(t);
  }
  return expected.some((p) => low.includes(p));
}

/** Sjednotí start URL s categoryKey (oprava špatných výchozích /byty/ u větve Domy atd.). */
export function resolveRealityScraperStartUrlForCategory(
  candidateUrl: string,
  categoryKey: string,
): string {
  const trimmed = (candidateUrl ?? '').trim();
  const cat = normBranchKey(categoryKey);
  const validListing =
    /^https?:\/\/(www\.)?reality\.cz\/(prodej|pronajem)\//i.test(trimmed) && trimmed.length > 12;
  const base = validListing ? trimmed : (getDefaultRealityStartUrlForCategoryKey(cat) ?? DEFAULT_REALITY_BYTY_START_URL);
  if (!realityStartUrlMatchesBranchCategory(base, cat)) {
    return getDefaultRealityStartUrlForCategoryKey(cat) ?? DEFAULT_REALITY_BYTY_START_URL;
  }
  return base;
}
