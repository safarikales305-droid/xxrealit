'use client';

import type { RegistrationGamificationPublicSettings } from '@/lib/nest-client';

const KEYS = {
  visitor: 'rgam_visitor_key',
  lastShown: 'rgam_last_shown_at',
  completed: 'rgam_completed',
  pages: 'rgam_pages_visited',
  shorts: 'rgam_shorts_views',
  sessionStart: 'rgam_session_start',
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();

export type GamificationStoreSnapshot = {
  open: boolean;
  settings: RegistrationGamificationPublicSettings | null;
};

let snapshot: GamificationStoreSnapshot = { open: false, settings: null };

function emit() {
  for (const l of listeners) l();
}

export function subscribeRegistrationGamification(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRegistrationGamificationSnapshot(): GamificationStoreSnapshot {
  return snapshot;
}

export function setRegistrationGamificationSettings(settings: RegistrationGamificationPublicSettings | null) {
  snapshot = { ...snapshot, settings };
  emit();
}

function unlockPageScroll() {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.documentElement.style.overflow = '';
}

export function unlockPageScrollForGamification() {
  unlockPageScroll();
}

export function lockPageScrollForGamification() {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = 'hidden';
}

export function openRegistrationGamification() {
  lockPageScrollForGamification();
  snapshot = { ...snapshot, open: true };
  markShown();
  emit();
}

export function closeRegistrationGamification() {
  unlockPageScroll();
  snapshot = { ...snapshot, open: false };
  emit();
}

function storageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getGamificationVisitorKey(): string {
  const existing = storageGet(KEYS.visitor);
  if (existing) return existing;
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  storageSet(KEYS.visitor, key);
  return key;
}

export function getGamificationSessionId(): string {
  return getGamificationVisitorKey();
}

function ensureSessionStart() {
  if (!storageGet(KEYS.sessionStart)) {
    storageSet(KEYS.sessionStart, String(Date.now()));
  }
}

export function getSecondsOnSite(): number {
  ensureSessionStart();
  const start = Number(storageGet(KEYS.sessionStart));
  if (!Number.isFinite(start)) return 0;
  return Math.floor((Date.now() - start) / 1000);
}

export function incrementGamificationPages(): number {
  const cur = Number(storageGet(KEYS.pages) ?? '0');
  const next = cur + 1;
  storageSet(KEYS.pages, String(next));
  return next;
}

export function incrementGamificationShorts(): number {
  const cur = Number(storageGet(KEYS.shorts) ?? '0');
  const next = cur + 1;
  storageSet(KEYS.shorts, String(next));
  return next;
}

export function getGamificationShortsViews(): number {
  return Number(storageGet(KEYS.shorts) ?? '0');
}

export function getGamificationPagesVisited(): number {
  return Number(storageGet(KEYS.pages) ?? '0');
}

export function isGamificationCompleted(): boolean {
  return storageGet(KEYS.completed) === '1';
}

export function markGamificationCompleted() {
  storageSet(KEYS.completed, '1');
}

function markShown() {
  storageSet(KEYS.lastShown, String(Date.now()));
}

export function canShowByFrequency(frequency: string): boolean {
  if (frequency === 'EVERY_VISIT') return true;
  if (isGamificationCompleted() && frequency === 'ONCE') return false;
  const last = Number(storageGet(KEYS.lastShown));
  if (!Number.isFinite(last) || last <= 0) return true;
  const elapsed = Date.now() - last;
  if (frequency === 'ONCE') return false;
  if (frequency === 'DAILY') return elapsed > 24 * 60 * 60 * 1000;
  if (frequency === 'WEEKLY') return elapsed > 7 * 24 * 60 * 60 * 1000;
  return true;
}

export function getUtmAndReferer() {
  if (typeof window === 'undefined') {
    return {
      landingPage: '',
      referer: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: '',
      utmTerm: '',
    };
  }
  const sp = new URLSearchParams(window.location.search);
  return {
    landingPage: window.location.pathname + window.location.search,
    referer: document.referrer || '',
    utmSource: sp.get('utm_source') ?? '',
    utmMedium: sp.get('utm_medium') ?? '',
    utmCampaign: sp.get('utm_campaign') ?? '',
    utmContent: sp.get('utm_content') ?? '',
    utmTerm: sp.get('utm_term') ?? '',
  };
}

export type GamificationPageKind = 'home' | 'shorts' | 'classic' | 'posts' | 'profile';

export function pageKindFromPath(pathname: string): GamificationPageKind | null {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/shorts')) return 'shorts';
  if (pathname.startsWith('/nemovitost') || pathname.startsWith('/inzerat')) return 'classic';
  if (pathname.startsWith('/prispevky') || pathname.startsWith('/posts') || pathname.startsWith('/prispevek')) {
    return 'posts';
  }
  if (
    pathname.startsWith('/makler') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/profil')
  ) {
    return 'profile';
  }
  return null;
}

export function isPageAllowed(settings: RegistrationGamificationPublicSettings, kind: GamificationPageKind | null): boolean {
  if (!kind) return false;
  if (kind === 'home') return settings.showOnHome;
  if (kind === 'shorts') return settings.showOnShorts;
  if (kind === 'classic') return settings.showOnClassic;
  if (kind === 'posts') return settings.showOnPosts;
  if (kind === 'profile') return settings.showOnProfessionalProfile;
  return false;
}
