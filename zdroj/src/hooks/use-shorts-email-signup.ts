'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import {
  isSignupCompleted,
  isSignupDismissed,
  markPopupShownThisSession,
  markShortViewed,
  markSignupCompleted,
  markSignupDismissed,
  saveSignupPendingIntent,
  wasPopupShownThisSession,
  type ShortsSignupPendingIntent,
} from '@/lib/shorts-email-signup-storage';
import { trackShortsSignupEvent } from '@/lib/shorts-email-signup-analytics';

export type EmailSignupPublicSettings = {
  enabled: boolean;
  afterViews: number;
  title: string;
  description: string;
  buttonText: string;
  dismissText: string;
  dismissCooldownDays: number;
  variantId?: string;
};

type StoreState = {
  open: boolean;
  settings: EmailSignupPublicSettings | null;
  successMessage: string | null;
  signupSource?: string;
};

let state: StoreState = { open: false, settings: null, successMessage: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function closeShortsEmailSignup() {
  state = { ...state, open: false, successMessage: null };
  emit();
}

export function openShortsEmailSignup(settings: EmailSignupPublicSettings, signupSource = 'SHORTS_10_VIEWS') {
  if (wasPopupShownThisSession() && signupSource === 'SHORTS_10_VIEWS') return;
  if (signupSource === 'SHORTS_10_VIEWS') markPopupShownThisSession();
  trackShortsSignupEvent('shorts_signup_popup_shown', {
    triggerViewCount: settings.afterViews,
    variantId: settings.variantId,
    shortType: signupSource,
  });
  state = { ...state, open: true, settings, successMessage: null, signupSource };
  emit();
}

export function openShortsEmailSignupForInteraction(
  settings: EmailSignupPublicSettings,
  pending: ShortsSignupPendingIntent,
) {
  const signupSource = pending.intent === 'like' ? 'YOUTUBE_LIKE' : 'YOUTUBE_COMMENT';
  saveSignupPendingIntent(pending);
  openShortsEmailSignup(settings, signupSource);
}

export function dismissShortsEmailSignup() {
  trackShortsSignupEvent('shorts_signup_dismissed');
  markSignupDismissed();
  closeShortsEmailSignup();
}

export function completeShortsEmailSignup(message: string) {
  markSignupCompleted();
  state = { ...state, successMessage: message };
  emit();
}

export function useShortsEmailSignup() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => ({
    open: false,
    settings: null,
    successMessage: null,
    signupSource: undefined,
  }));
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (!API_BASE_URL) return;
    const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
    void fetch(`${base}/registration-gate/email-signup-settings`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.enabled) {
          state = { ...state, settings: data as EmailSignupPublicSettings };
          emit();
        }
      })
      .catch(() => undefined);
  }, [isAuthenticated, isLoading]);

  const reportShortViewed = useCallback(
    (feedKey: string, shortType?: string) => {
      if (isLoading || isAuthenticated) return;
      const settings = state.settings;
      if (!settings?.enabled) return;
      if (isSignupCompleted()) return;
      if (isSignupDismissed(settings.dismissCooldownDays)) return;
      if (wasPopupShownThisSession()) return;
      if (snapshot.open) return;

      const count = markShortViewed(feedKey);
      if (count >= settings.afterViews) {
        trackShortsSignupEvent('shorts_signup_eligible', {
          triggerViewCount: count,
          shortType,
          variantId: settings.variantId,
        });
        openShortsEmailSignup(settings);
      }
    },
    [isAuthenticated, isLoading, snapshot.open],
  );

  return { ...snapshot, reportShortViewed, signupSource: snapshot.signupSource };
}
