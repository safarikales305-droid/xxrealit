'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const VISITOR_KEY = 'xxr_visitor_id';
const SESSION_KEY = 'xxr_session_id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

function parseUtm(search: string) {
  const p = new URLSearchParams(search);
  return {
    utmSource: p.get('utm_source') ?? undefined,
    utmMedium: p.get('utm_medium') ?? undefined,
    utmCampaign: p.get('utm_campaign') ?? undefined,
  };
}

function sendPageview(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([json], { type: 'application/json' });
    if (navigator.sendBeacon('/api/analytics/pageview', blob)) return;
  }
  void fetch('/api/analytics/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
}

export function PortalAnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const prevPathRef = useRef<string | null>(null);
  const initialReferrer = useRef(
    typeof document !== 'undefined' ? document.referrer : '',
  );

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;

    const search = searchParams?.toString() ?? '';
    const path = search ? `${pathname}?${search}` : pathname;
    if (prevPathRef.current === path) return;

    const previousPath = prevPathRef.current;
    prevPathRef.current = path;

    const utm = parseUtm(search ? `?${search}` : '');
    const url = typeof window !== 'undefined' ? window.location.href : path;

    sendPageview({
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      url,
      path: pathname,
      title: typeof document !== 'undefined' ? document.title : '',
      referrer: previousPath ? undefined : initialReferrer.current || undefined,
      previousPath: previousPath ?? undefined,
      language: typeof navigator !== 'undefined' ? navigator.language : undefined,
      userId: user?.id,
      ...utm,
    });
  }, [pathname, searchParams, user?.id]);

  return null;
}
