'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  clearGuestListingReported,
  hasGuestListingBeenReported,
  incrementGuestShortsView,
  markGuestListingReported,
  resetGuestShortsViews,
} from '@/lib/guest-shorts-views';
import {
  getGuestRegistrationGateSnapshot,
  openGuestRegistrationGate,
  resetGuestRegistrationGate,
  setGuestRegistrationGateSettings,
  subscribeGuestRegistrationGate,
} from '@/lib/guest-registration-gate-store';
import { fetchRegistrationGateSettings } from '@/lib/registration-gate';

/**
 * Sdílená logika výzvy k registraci pro hosty (Shorts i Klasik).
 * Modal vykresluje {@link GuestRegistrationGateHost} v root layoutu.
 */
export function useGuestRegistrationGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const gateSnapshot = useSyncExternalStore(
    subscribeGuestRegistrationGate,
    getGuestRegistrationGateSnapshot,
    () => ({ gateOpen: false, settings: null }),
  );

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      resetGuestRegistrationGate();
      resetGuestShortsViews();
      clearGuestListingReported();
      return;
    }

    let cancelled = false;
    void fetchRegistrationGateSettings().then((settings) => {
      if (cancelled) return;
      setGuestRegistrationGateSettings(settings);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  const reportGuestListingViewed = useCallback(
    (listingId: string) => {
      if (isLoading || isAuthenticated) return;

      const { gateOpen, settings } = getGuestRegistrationGateSnapshot();
      if (gateOpen || !settings?.shortsGateEnabled) return;
      if (!listingId || hasGuestListingBeenReported(listingId)) return;

      markGuestListingReported(listingId);
      const gateEvery = settings.shortsGateAfterViews || 4;
      const views = incrementGuestShortsView();

      if (views >= gateEvery) {
        resetGuestShortsViews();
        openGuestRegistrationGate(settings);
      }
    },
    [isAuthenticated, isLoading],
  );

  return { reportGuestListingViewed, gateOpen: gateSnapshot.gateOpen };
}
