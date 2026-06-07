export const SHARE_GATE_SOUND_STORAGE_KEY = 'shareGateSoundEnabled';

/** Výchozí: zvuk zapnutý (pokud uživatel dříve nevolil jinak). */
export function isShareGateSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(SHARE_GATE_SOUND_STORAGE_KEY);
    if (v === null) return true;
    return v === 'true';
  } catch {
    return true;
  }
}

export function setShareGateSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHARE_GATE_SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}
