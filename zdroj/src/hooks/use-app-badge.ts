'use client';

import { useEffect } from 'react';

type NavigatorBadge = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function setAppBadgeCount(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorBadge;
  const safe = Math.max(0, Math.min(99, Math.floor(count)));
  if (safe <= 0) {
    void nav.clearAppBadge?.();
    return;
  }
  void nav.setAppBadge?.(safe);
}

export function clearAppBadgeCount(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorBadge;
  void nav.clearAppBadge?.();
}

export function supportsAppBadge(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorBadge;
  return typeof nav.setAppBadge === 'function';
}

/** Synchronizuje badge na ikoně PWA s celkovým počtem nepřečtených položek. */
export function useAppBadgeSync(totalUnread: number) {
  useEffect(() => {
    if (!supportsAppBadge()) return;
    if (totalUnread <= 0) {
      clearAppBadgeCount();
      return;
    }
    setAppBadgeCount(totalUnread);
  }, [totalUnread]);
}
