const DISMISS_KEY = 'xxrealit_pwa_push_onboarding_dismissed_at';
const FIRST_LAUNCH_KEY = 'xxrealit_pwa_first_launch_done';
const REMIND_MS = 7 * 24 * 60 * 60 * 1000;

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function markPwaFirstLaunchDone(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FIRST_LAUNCH_KEY, '1');
}

export function isPwaFirstLaunchPending(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(FIRST_LAUNCH_KEY) !== '1';
}

export function dismissPwaPushOnboarding(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function shouldShowPwaPushOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isRunningAsInstalledPwa()) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return false;

  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
  if (!dismissedAt) return true;
  return Date.now() - dismissedAt >= REMIND_MS;
}

export function clearPwaPushOnboardingDismiss(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DISMISS_KEY);
}
