'use client';

import { useEffect, useState } from 'react';
import { nestMessagesUnreadCount } from '@/lib/nest-client';

export const MESSAGES_CHANGED_EVENT = 'xxrealit:messages-changed';

export function dispatchMessagesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}

/**
 * Počet nepřečtených zpráv z Nest (`GET /conversations/unread-count`).
 */
export function useMessagesUnreadCount(token: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      void nestMessagesUnreadCount(token).then((n) => {
        if (!cancelled) setCount(n);
      });
    };
    load();
    const interval = window.setInterval(load, 45_000);
    const onChange = () => load();
    window.addEventListener(MESSAGES_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, onChange);
    };
  }, [token]);

  return count;
}
