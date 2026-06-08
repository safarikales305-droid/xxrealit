const VIEWS_KEY = 'guestShortsViews';
const VIEWED_IDS_KEY = 'guestShortsViewedIds';
const GATE_SHOWN_KEY = 'guestShortsGateShown';

function readViewedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(VIEWED_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writeViewedIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(VIEWED_IDS_KEY, JSON.stringify([...ids]));
    sessionStorage.setItem(VIEWS_KEY, String(ids.size));
  } catch {
    /* ignore */
  }
}

export function getGuestShortsViews(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number.parseInt(sessionStorage.getItem(VIEWS_KEY) ?? '0', 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

/** Započte zhlédnutí Shorts (1× na video ID v session). Vrací nový počet. */
export function registerGuestShortsView(videoId: string): number {
  const id = videoId.trim();
  if (!id || typeof window === 'undefined') return getGuestShortsViews();
  const ids = readViewedIds();
  if (ids.has(id)) return ids.size;
  ids.add(id);
  writeViewedIds(ids);
  return ids.size;
}

export function isGuestShortsGateShown(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(GATE_SHOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGuestShortsGateShown(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(GATE_SHOWN_KEY, 'true');
  } catch {
    /* ignore */
  }
}
