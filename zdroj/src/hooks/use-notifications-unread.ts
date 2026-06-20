'use client';

import { useEffect, useState } from 'react';
import { nestNotificationsUnreadCount } from '@/lib/nest-client';

export const NOTIFICATIONS_CHANGED_EVENT = 'xxrealit:notifications-changed';

export function dispatchNotificationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function useNotificationsUnreadCount(token: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      void nestNotificationsUnreadCount(token).then((n) => {
        if (!cancelled) setCount(n);
      });
    };
    load();
    const interval = window.setInterval(load, 60_000);
    const onChange = () => load();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    };
  }, [token]);

  return count;
}
