const VIEWED_SHORTS_KEY = 'shorts_viewed_ids';
const SESSION_SHOWN_KEY = 'shorts_signup_popup_shown_session';
const DISMISS_KEY = 'shorts_signup_dismissed_at';
const COMPLETED_KEY = 'shorts_signup_completed';

function readViewedShorts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(VIEWED_SHORTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

export function markShortViewed(feedKey: string): number {
  if (typeof window === 'undefined' || !feedKey) return 0;
  const ids = readViewedShorts();
  ids.add(feedKey);
  sessionStorage.setItem(VIEWED_SHORTS_KEY, JSON.stringify([...ids]));
  return ids.size;
}

export function getUniqueShortsViewCount(): number {
  return readViewedShorts().size;
}

export function wasPopupShownThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_SHOWN_KEY) === '1';
}

export function markPopupShownThisSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_SHOWN_KEY, '1');
}

export function isSignupDismissed(cooldownDays: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    return Date.now() - ts < cooldownMs;
  } catch {
    return false;
  }
}

export function markSignupDismissed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function isSignupCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(COMPLETED_KEY) === '1';
}

export function markSignupCompleted(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COMPLETED_KEY, '1');
}

const PENDING_INTENT_KEY = 'shorts_signup_pending_intent';

export type ShortsSignupPendingIntent =
  | { intent: 'like'; postId: string }
  | { intent: 'comment'; postId: string; draft?: string };

export function saveSignupPendingIntent(intent: ShortsSignupPendingIntent): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
}

export function readSignupPendingIntent(): ShortsSignupPendingIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShortsSignupPendingIntent;
    if (parsed?.intent === 'like' && parsed.postId) return parsed;
    if (parsed?.intent === 'comment' && parsed.postId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearSignupPendingIntent(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PENDING_INTENT_KEY);
}

export function getAnonymousSessionId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'xx_anon_session';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return '';
  }
}
