import type { Prisma } from '@prisma/client';

export const TIPSTER_EXCLUDE_ROLES = [
  'ADMIN',
  'PORTAL_WORKER',
  'AGENT',
  'AGENCY',
  'COMPANY',
  'DEVELOPER',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'TIPSTER',
] as const;

export type SystemPopupSeed = {
  slug: string;
  name: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  buttons: Array<{ label: string; href: string }>;
  linkUrl?: string | null;
  targetRoles: string[];
  excludeRoles: string[];
  triggers: string[];
  profileTriggers: string[];
  isEnabled: boolean;
  sortOrder: number;
  maxViewsPerUser: number;
  repeatAfterDays: number | null;
  variant: string;
  config?: Prisma.InputJsonValue;
};

export const SYSTEM_MARKETING_POPUPS: SystemPopupSeed[] = [
  {
    slug: 'profile-onboarding',
    name: 'Dokončení profilu',
    title: 'Dokončete profil pro plné využití portálu',
    body: 'Aby vám fungovaly kredity, leady, tipaření a upozornění, doplňte prosím tyto kroky.',
    buttons: [
      { label: 'Ověřit WhatsApp číslo', href: '/profil/dashboard?tab=settings#whatsapp-verify' },
      { label: 'Ověřit e-mail', href: '/profil/dashboard?tab=settings#profile-details-form' },
      { label: 'Doplnit údaje profilu', href: '/profil/dashboard?tab=settings#profile-details-form' },
    ],
    targetRoles: [],
    excludeRoles: ['ADMIN', 'PORTAL_WORKER'],
    triggers: ['MISSING_EMAIL', 'MISSING_WHATSAPP', 'MISSING_PROFILE'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 10,
    maxViewsPerUser: 3,
    repeatAfterDays: 7,
    variant: 'profile_checklist',
  },
  {
    slug: 'tipster-offer',
    name: 'Staňte se tipařem',
    title: 'Staňte se tipařem a vydělávejte',
    body: 'Zaregistrujte se jako tipař a získejte provize za doporučené kontakty na nemovitosti.',
    buttons: [{ label: 'Stát se tipařem a vydělávat na kontaktech', href: '/profil#tipar' }],
    linkUrl: '/profil#tipar',
    targetRoles: [],
    excludeRoles: [...TIPSTER_EXCLUDE_ROLES],
    triggers: ['TIPSTER_OFFER'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 20,
    maxViewsPerUser: 5,
    repeatAfterDays: 14,
    variant: 'modal',
  },
  {
    slug: 'portal-worker-onboarding',
    name: 'Onboarding pracovníka portálu',
    title: 'Vítejte v pracovním panelu',
    body: 'Než začnete pracovat s klienty, dokončete prosím základní nastavení účtu pracovníka portálu.',
    buttons: [
      { label: 'Doplnit telefon', href: '/pracovnik/nastaveni' },
      { label: 'Ověřit e-mail', href: '/pracovnik/nastaveni' },
      { label: 'Ověřit WhatsApp', href: '/pracovnik/nastaveni' },
      { label: 'Nahrát profilovou fotku', href: '/pracovnik/nastaveni' },
      { label: 'Jak pracovat s klienty', href: '/pracovnik/klienti' },
    ],
    linkUrl: '/pracovnik/nastaveni',
    targetRoles: ['PORTAL_WORKER'],
    excludeRoles: [],
    triggers: ['PORTAL_WORKER_PANEL', 'AFTER_LOGIN'],
    profileTriggers: ['phone', 'email', 'whatsapp', 'avatar', 'clients_intro'],
    isEnabled: true,
    sortOrder: 5,
    maxViewsPerUser: 10,
    repeatAfterDays: 3,
    variant: 'worker_checklist',
  },
  {
    slug: 'pwa-install',
    name: 'Instalace PWA aplikace',
    title: 'Nainstalujte si XXrealit do telefonu',
    body: 'Přidejte si portál na plochu a mějte rychlý přístup k inzerátům, zprávám a upozorněním.',
    buttons: [{ label: 'Nainstalovat aplikaci', href: '#' }],
    targetRoles: [],
    excludeRoles: ['ADMIN'],
    triggers: ['PWA_INSTALL'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 100,
    maxViewsPerUser: 3,
    repeatAfterDays: 30,
    variant: 'pwa_install',
  },
  {
    slug: 'pwa-push',
    name: 'PWA push notifikace',
    title: 'Zapněte upozornění',
    body: 'Zapněte upozornění a dostávejte okamžité informace o nových zprávách, zájemcích, nabídkách a marketingových akcích.',
    buttons: [{ label: 'Zapnout upozornění', href: '#' }],
    targetRoles: [],
    excludeRoles: ['ADMIN'],
    triggers: ['PWA_PUSH'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 101,
    maxViewsPerUser: 3,
    repeatAfterDays: 7,
    variant: 'pwa_push',
  },
  {
    slug: 'guest-shorts-gate',
    name: 'Guest registrační brána (shorts)',
    title: 'Pokračujte po registraci',
    body: 'Pro sledování dalšího obsahu se zaregistrujte nebo přihlaste. Registrace je zdarma.',
    buttons: [
      { label: 'Registrovat se', href: '/registrace' },
      { label: 'Přihlásit se', href: '/login' },
    ],
    targetRoles: [],
    excludeRoles: [],
    triggers: ['GUEST_SHORTS_GATE'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 200,
    maxViewsPerUser: 999,
    repeatAfterDays: null,
    variant: 'guest_gate',
  },
  {
    slug: 'posts-login-overlay',
    name: 'Přihlášení — záložka Příspěvky',
    title: 'Přihlaste se',
    body: 'Pro zobrazení příspěvků od sledovaných profilů se přihlaste nebo zaregistrujte.',
    buttons: [
      { label: 'Přihlásit se', href: '/login' },
      { label: 'Registrovat se', href: '/registrace' },
    ],
    targetRoles: [],
    excludeRoles: [],
    triggers: ['GUEST_POSTS_TAB'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 210,
    maxViewsPerUser: 999,
    repeatAfterDays: null,
    variant: 'inline_overlay',
  },
  {
    slug: 'share-gate',
    name: 'Share gate — promo video',
    title: 'Podívejte se na XXrealit',
    body: 'Než pokračujete k detailu, podívejte se na krátké představení portálu.',
    buttons: [{ label: 'Pokračovat', href: '#' }],
    targetRoles: [],
    excludeRoles: [],
    triggers: ['SHARE_GATE'],
    profileTriggers: [],
    isEnabled: true,
    sortOrder: 220,
    maxViewsPerUser: 1,
    repeatAfterDays: null,
    variant: 'share_gate',
  },
];
