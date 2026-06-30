const VISITOR_ID_KEY = 'xxrealit_visitor_id';

function randomVisitorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromStorage = window.localStorage.getItem(VISITOR_ID_KEY)?.trim();
    if (fromStorage) return fromStorage;
    const fromCookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${VISITOR_ID_KEY}=`))
      ?.split('=')[1]
      ?.trim();
    if (fromCookie) {
      window.localStorage.setItem(VISITOR_ID_KEY, fromCookie);
      return fromCookie;
    }
    const id = randomVisitorId();
    window.localStorage.setItem(VISITOR_ID_KEY, id);
    document.cookie = `${VISITOR_ID_KEY}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
    return id;
  } catch {
    return randomVisitorId();
  }
}
