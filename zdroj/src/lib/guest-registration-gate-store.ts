import type { PublicRegistrationGateSettings } from '@/lib/registration-gate';

export type GuestRegistrationGateSnapshot = {
  gateOpen: boolean;
  settings: PublicRegistrationGateSettings | null;
};

const CLOSED: GuestRegistrationGateSnapshot = { gateOpen: false, settings: null };

let snapshot: GuestRegistrationGateSnapshot = CLOSED;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeGuestRegistrationGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGuestRegistrationGateSnapshot(): GuestRegistrationGateSnapshot {
  return snapshot;
}

export function setGuestRegistrationGateSettings(
  settings: PublicRegistrationGateSettings | null,
): void {
  snapshot = { ...snapshot, settings };
  notify();
}

export function openGuestRegistrationGate(settings?: PublicRegistrationGateSettings): void {
  if (snapshot.gateOpen) return;
  snapshot = {
    gateOpen: true,
    settings: settings ?? snapshot.settings,
  };
  notify();
}

export function closeGuestRegistrationGate(): void {
  if (!snapshot.gateOpen) return;
  snapshot = { ...snapshot, gateOpen: false };
  notify();
}

export function resetGuestRegistrationGate(): void {
  snapshot = CLOSED;
  notify();
}
