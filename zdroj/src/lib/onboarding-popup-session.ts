const SESSION_KEY = 'xxrealit_profile_onboarding_shown';
const LOGIN_FLAG_KEY = 'xxrealit_just_logged_in';
const REGISTER_FLAG_KEY = 'xxrealit_just_registered';

export function markJustLoggedIn(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(LOGIN_FLAG_KEY, '1');
}

export function markJustRegistered(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(REGISTER_FLAG_KEY, '1');
  sessionStorage.setItem(LOGIN_FLAG_KEY, '1');
}

export function consumeJustLoggedIn(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const v = sessionStorage.getItem(LOGIN_FLAG_KEY) === '1';
  sessionStorage.removeItem(LOGIN_FLAG_KEY);
  return v;
}

export function consumeJustRegistered(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const v = sessionStorage.getItem(REGISTER_FLAG_KEY) === '1';
  sessionStorage.removeItem(REGISTER_FLAG_KEY);
  return v;
}

export function isProfileOnboardingShownThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function markProfileOnboardingShownThisSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function clearProfileOnboardingSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LOGIN_FLAG_KEY);
  sessionStorage.removeItem(REGISTER_FLAG_KEY);
}

const ADMIN_POPUP_DISMISS_PREFIX = 'xxrealit_popup_dismiss_';

export function isAdminPopupDismissedThisSession(popupId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(`${ADMIN_POPUP_DISMISS_PREFIX}${popupId}`) === '1';
}

export function dismissAdminPopupThisSession(popupId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`${ADMIN_POPUP_DISMISS_PREFIX}${popupId}`, '1');
}

export function clearAdminPopupDismissals(): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(ADMIN_POPUP_DISMISS_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
}
