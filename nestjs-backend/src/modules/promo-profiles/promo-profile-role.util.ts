import { UserRole } from '@prisma/client';

export const PROMO_PROFILE_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.INVESTOR,
  UserRole.COMPANY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.CRAFTSMAN,
  UserRole.AGENCY,
];

export const PROMO_ROLE_LABELS: Record<string, string> = {
  AGENT: 'Makléř',
  INVESTOR: 'Investor',
  COMPANY: 'Stavební firma',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  CRAFTSMAN: 'Řemeslník',
  AGENCY: 'RK',
  USER: 'Uživatel',
  PRIVATE_SELLER: 'Soukromý prodejce',
  DEVELOPER: 'Stavební firma',
};

export const PORTAL_CAROUSEL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.INVESTOR,
  UserRole.COMPANY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.CRAFTSMAN,
  UserRole.AGENCY,
  UserRole.USER,
];

export function promoRoleLabel(role: string): string {
  return PROMO_ROLE_LABELS[role] ?? role;
}

export function isPromoProfileRole(role: string): role is UserRole {
  return PROMO_PROFILE_ROLES.includes(role as UserRole);
}

const FIRST_NAMES = [
  'Jan',
  'Petr',
  'Martin',
  'Tomáš',
  'Jakub',
  'Lukáš',
  'David',
  'Michal',
  'Pavel',
  'Jiří',
  'Anna',
  'Eva',
  'Lucie',
  'Kateřina',
  'Marie',
  'Jana',
  'Petra',
  'Veronika',
  'Tereza',
  'Barbora',
  'Alena',
  'Hana',
  'Lenka',
  'Markéta',
];

const LAST_NAMES = [
  'Novák',
  'Svoboda',
  'Novotný',
  'Dvořák',
  'Černý',
  'Procházka',
  'Kučera',
  'Veselý',
  'Horák',
  'Němec',
  'Marek',
  'Pospíšil',
  'Král',
  'Růžička',
  'Beneš',
  'Fiala',
  'Sedláček',
  'Urban',
  'Kříž',
  'Holub',
  'Vávra',
  'Šimek',
  'Kovář',
  'Bláha',
];

export function generatePromoProfileName(): { firstName: string; lastName: string } {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]!;
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]!;
  return { firstName, lastName };
}

export function composePromoDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
