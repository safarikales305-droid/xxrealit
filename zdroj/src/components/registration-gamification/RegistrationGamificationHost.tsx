'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestRegistrationGamificationSettings } from '@/lib/nest-client';
import {
  canShowByFrequency,
  closeRegistrationGamification,
  getGamificationPagesVisited,
  getGamificationShortsViews,
  getRegistrationGamificationSnapshot,
  getSecondsOnSite,
  incrementGamificationPages,
  incrementGamificationShorts,
  isGamificationCompleted,
  isPageAllowed,
  openRegistrationGamification,
  pageKindFromPath,
  setRegistrationGamificationSettings,
  subscribeRegistrationGamification,
} from '@/lib/registration-gamification-store';
import { RealEstateMagnateGame } from './RealEstateMagnateGame';

const AUTH_PATHS = ['/prihlaseni', '/registrace', '/login', '/register', '/admin'];

function audienceMatches(
  audience: string,
  isAuthenticated: boolean,
): boolean {
  if (audience === 'ALL') return true;
  if (audience === 'UNAUTHENTICATED') return !isAuthenticated;
  if (audience === 'GUESTS_ONLY') return !isAuthenticated;
  return !isAuthenticated;
}

function triggerMet(
  settings: NonNullable<ReturnType<typeof getRegistrationGamificationSnapshot>['settings']>,
): boolean {
  if (settings.triggerType === 'SHORTS_VIEWS') {
    return getGamificationShortsViews() >= settings.triggerShortsViews;
  }
  if (settings.triggerType === 'SECONDS_ON_SITE') {
    return getSecondsOnSite() >= settings.triggerSecondsOnSite;
  }
  if (settings.triggerType === 'PAGES_VISITED') {
    return getGamificationPagesVisited() >= settings.triggerPagesVisited;
  }
  return false;
}

export function RegistrationGamificationHost() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const snap = useSyncExternalStore(
    subscribeRegistrationGamification,
    getRegistrationGamificationSnapshot,
    () => ({ open: false, settings: null }),
  );

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    void nestRegistrationGamificationSettings().then((settings) => {
      if (!cancelled) setRegistrationGamificationSettings(settings);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || !snap.settings) return;
    if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return;
    incrementGamificationPages();
  }, [pathname, isLoading, snap.settings]);

  const tryOpen = useCallback(() => {
    const settings = getRegistrationGamificationSnapshot().settings;
    if (!settings?.enabled) return;
    if (!audienceMatches(settings.audience, isAuthenticated)) return;
    if (!canShowByFrequency(settings.frequency)) return;
    if (settings.frequency === 'ONCE' && isGamificationCompleted()) return;
    const kind = pageKindFromPath(pathname);
    if (!isPageAllowed(settings, kind)) return;
    if (!triggerMet(settings)) return;
    if (getRegistrationGamificationSnapshot().open) return;
    openRegistrationGamification();
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (isLoading || !snap.settings) return;
    tryOpen();
  }, [isLoading, snap.settings, pathname, tryOpen]);

  useEffect(() => {
    if (!snap.settings || snap.settings.triggerType !== 'SECONDS_ON_SITE') return;
    const t = window.setInterval(() => {
      tryOpen();
    }, 5000);
    return () => window.clearInterval(t);
  }, [snap.settings, tryOpen]);

  if (!snap.open || !snap.settings) return null;

  return (
    <RealEstateMagnateGame
      settings={snap.settings}
      onClose={() => closeRegistrationGamification()}
    />
  );
}

/** Volat po zobrazení Shorts (např. z feedu). */
export function reportGamificationShortsView() {
  incrementGamificationShorts();
  const settings = getRegistrationGamificationSnapshot().settings;
  if (!settings || settings.triggerType !== 'SHORTS_VIEWS') return;
  if (getGamificationShortsViews() >= settings.triggerShortsViews) {
    openRegistrationGamification();
  }
}
