'use client';

import { useSyncExternalStore } from 'react';
import {
  getGuestRegistrationGateSnapshot,
  subscribeGuestRegistrationGate,
} from '@/lib/guest-registration-gate-store';
import { GuestRegistrationGateModal } from '@/components/registration/GuestRegistrationGateModal';

/** Jediné místo v DOM pro host výzvu — zabraňuje duplicitním modalům. */
export function GuestRegistrationGateHost() {
  const snapshot = useSyncExternalStore(
    subscribeGuestRegistrationGate,
    getGuestRegistrationGateSnapshot,
    () => ({ gateOpen: false, settings: null }),
  );

  if (!snapshot.gateOpen || !snapshot.settings) return null;
  return <GuestRegistrationGateModal settings={snapshot.settings} />;
}
