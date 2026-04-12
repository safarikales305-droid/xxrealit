/** Po „Nechci instalovat“ — při dalším přihlášení znovu (klíč se maže při loginu / logoutu). */
export const PWA_INSTALL_DISMISSED_KEY = 'xxrealit_pwa_install_dismissed';

export function isPwaInstallDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPwaInstallDismissed(): void {
  try {
    window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearPwaInstallDismissed(): void {
  try {
    window.localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}
