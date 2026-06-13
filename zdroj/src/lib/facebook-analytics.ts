import { API_BASE_URL } from '@/lib/api';

export type FacebookAnalyticsEvent =
  | 'facebook_login_click'
  | 'facebook_register_click'
  | 'facebook_login_success'
  | 'facebook_login_error';

export function trackFacebookAnalytics(
  event: FacebookAnalyticsEvent,
  meta?: Record<string, unknown>,
) {
  const url = API_BASE_URL
    ? `${API_BASE_URL}/analytics/facebook-event`
    : '/api/analytics/facebook-event';
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, meta }),
    keepalive: true,
  }).catch(() => undefined);

  if (typeof window !== 'undefined' && 'gtag' in window) {
    try {
      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.('event', event, meta);
    } catch {
      /* ignore */
    }
  }
}
