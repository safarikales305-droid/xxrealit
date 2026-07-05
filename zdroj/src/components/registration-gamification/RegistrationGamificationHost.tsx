'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestRegistrationGamificationEvent,
  nestRegistrationGamificationSettings,
} from '@/lib/nest-client';
import {
  canShowByFrequency,
  closeGamificationRegistrationPrompt,
  closeRegistrationGamification,
  getGamificationPagesVisited,
  getGamificationShortsViews,
  getGamificationVisitorKey,
  getRegistrationGamificationSnapshot,
  getSecondsOnSite,
  incrementGamificationPages,
  incrementGamificationShorts,
  isGamificationCompleted,
  isPageAllowed,
  lockPageScrollForGamification,
  openGamificationRegistrationPrompt,
  openRegistrationGamification,
  pageKindFromPath,
  setRegistrationGamificationSettings,
  subscribeRegistrationGamification,
  unlockPageScrollForGamification,
} from '@/lib/registration-gamification-store';
import { GamificationRegistrationPromptModal } from './GamificationRegistrationPromptModal';
import { RealEstateMagnateGame } from './RealEstateMagnateGame';

const AUTH_PATHS = ['/prihlaseni', '/registrace', '/login', '/register', '/admin'];

const EMPTY_SNAPSHOT = {
  open: false,
  settings: null,
  promptOpen: false,
  promptSettings: null,
} as const;

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
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const snap = useSyncExternalStore(
    subscribeRegistrationGamification,
    getRegistrationGamificationSnapshot,
    () => EMPTY_SNAPSHOT,
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

  const handleGameDismiss = useCallback(() => {
    const settings = getRegistrationGamificationSnapshot().settings;
    closeRegistrationGamification();
    unlockPageScrollForGamification();

    void nestRegistrationGamificationEvent({
      eventType: 'game_dismissed',
      visitorKey: getGamificationVisitorKey(),
      pagePath: pathname,
    });

    if (!settings || isAuthenticated) return;

    const action = settings.onCloseAction ?? 'OPEN_REGISTRATION_MODAL';
    if (action === 'OPEN_REGISTRATION_MODAL') {
      openGamificationRegistrationPrompt(settings);
      return;
    }
    if (action === 'REDIRECT_REGISTER') {
      const targetUrl = '/registrace?source=game';
      try {
        router.push(targetUrl);
      } catch {
        window.location.href = targetUrl;
      }
      return;
    }
    if (action === 'REDIRECT_LOGIN') {
      const targetUrl = '/prihlaseni?source=game';
      try {
        router.push(targetUrl);
      } catch {
        window.location.href = targetUrl;
      }
    }
  }, [isAuthenticated, pathname, router]);

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

  useEffect(() => {
    if (!snap.open && !snap.promptOpen) return;
    lockPageScrollForGamification();
    return () => {
      if (!getRegistrationGamificationSnapshot().open && !getRegistrationGamificationSnapshot().promptOpen) {
        unlockPageScrollForGamification();
      }
    };
  }, [snap.open, snap.promptOpen]);

  return (
    <>
      {snap.open && snap.settings ? (
        <RealEstateMagnateGame settings={snap.settings} onClose={handleGameDismiss} />
      ) : null}
      {snap.promptOpen && snap.promptSettings ? (
        <GamificationRegistrationPromptModal
          settings={snap.promptSettings}
          onClose={() => closeGamificationRegistrationPrompt()}
        />
      ) : null}
    </>
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
