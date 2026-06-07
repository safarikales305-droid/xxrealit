export const SHORTS_SOUND_STORAGE_KEY = 'shortsSoundEnabled';

export function isShortsSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SHORTS_SOUND_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setShortsSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHORTS_SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}
