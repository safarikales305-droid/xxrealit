import { assignWindowLocation } from '@/lib/navigation-debug';
import { isPwaStandalone } from '@/lib/pwa-standalone';

export type PwaOAuthOpenResult = 'redirected' | 'external' | 'blocked';

/**
 * V PWA otevře OAuth v externím prohlížeči (popup / nová záložka).
 * V klasickém prohlížeči přesměruje stejné okno.
 */
export function openFacebookOAuthUrl(url: string): PwaOAuthOpenResult {
  const target = url.trim();
  if (!target) return 'blocked';

  if (!isPwaStandalone()) {
    assignWindowLocation(target, 'pwa-oauth:browser');
    return 'redirected';
  }

  const popup = window.open(target, '_blank', 'noopener,noreferrer');
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      /* ignore */
    }
    return 'external';
  }

  assignWindowLocation(target, 'pwa-oauth:pwa-fallback');
  return 'redirected';
}

export function canUseExternalOAuth(): boolean {
  return typeof window !== 'undefined';
}
