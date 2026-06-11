const VIEWS_KEY = 'guestShortsViews';
const REPORTED_LISTING_IDS_KEY = 'guestGateReportedListingIds';

function readReportedListingIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(REPORTED_LISTING_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

/** Zabrání dvojímu počítání stejného inzerátu (feed + detail). */
export function hasGuestListingBeenReported(listingId: string): boolean {
  return readReportedListingIds().has(listingId);
}

export function markGuestListingReported(listingId: string): void {
  if (typeof window === 'undefined' || !listingId) return;
  try {
    const ids = readReportedListingIds();
    ids.add(listingId);
    sessionStorage.setItem(REPORTED_LISTING_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function clearGuestListingReported(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(REPORTED_LISTING_IDS_KEY);
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

/** Zvýší počítadlo zhlédnutých Shorts a vrátí novou hodnotu. */
export function incrementGuestShortsView(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const views = getGuestShortsViews() + 1;
    sessionStorage.setItem(VIEWS_KEY, String(views));
    return views;
  } catch {
    return 0;
  }
}

/** Reset po zobrazení výzvy (nebo po registraci / přihlášení). */
export function resetGuestShortsViews(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(VIEWS_KEY, '0');
  } catch {
    /* ignore */
  }
}
