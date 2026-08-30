import { API_BASE_URL } from '@/lib/api';
import { getAnonymousSessionId } from '@/lib/shorts-email-signup-storage';

export type ShortsSignupEventName =
  | 'shorts_signup_eligible'
  | 'shorts_signup_popup_shown'
  | 'shorts_signup_email_started'
  | 'shorts_signup_submitted'
  | 'shorts_signup_success'
  | 'shorts_signup_existing_email'
  | 'shorts_signup_failed'
  | 'shorts_signup_dismissed'
  | 'shorts_signup_closed'
  | 'shorts_signup_password_email_sent'
  | 'shorts_signup_password_set';

export function trackShortsSignupEvent(
  eventName: ShortsSignupEventName,
  meta?: {
    triggerViewCount?: number;
    shortType?: string;
    variantId?: string;
  },
) {
  if (!API_BASE_URL || typeof window === 'undefined') return;
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const params = new URLSearchParams(window.location.search);
  void fetch(`${base}/registration-gate/shorts-signup/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      eventName,
      anonymousSessionId: getAnonymousSessionId(),
      triggerViewCount: meta?.triggerViewCount,
      shortType: meta?.shortType,
      variantId: meta?.variantId,
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
      referrer: document.referrer?.slice(0, 500) || undefined,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function submitShortsEmailSignup(
  email: string,
  signupSource?: string,
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!API_BASE_URL) {
    return { success: false, message: 'Služba není dostupná.' };
  }
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const params = new URLSearchParams(window.location.search);
  const res = await fetch(`${base}/auth/email-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
      referrer: document.referrer?.slice(0, 500) || undefined,
      signupSource: signupSource ?? undefined,
    }),
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!res.ok || !data) {
    return { success: false, message: 'Nepodařilo se registraci dokončit. Zkuste to prosím znovu.' };
  }
  return { success: Boolean(data.success), message: data.message ?? '' };
}
