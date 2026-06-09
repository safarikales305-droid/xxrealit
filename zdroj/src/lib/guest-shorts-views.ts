const VIEWS_KEY = 'guestShortsViews';

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
