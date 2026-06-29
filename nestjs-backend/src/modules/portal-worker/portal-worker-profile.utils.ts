import type { User } from '@prisma/client';

export type WorkerProfileField =
  | 'emailVerified'
  | 'phoneVerified'
  | 'avatar'
  | 'name'
  | 'location'
  | 'termsAccepted';

export const WORKER_PROFILE_FIELD_LABELS: Record<WorkerProfileField, string> = {
  emailVerified: 'Ověřený e-mail',
  phoneVerified: 'Ověřené telefonní číslo',
  avatar: 'Profilová fotka',
  name: 'Jméno',
  location: 'Lokalita / kraj',
  termsAccepted: 'Souhlas s podmínkami spolupráce',
};

export type WorkerProfileAssessment = {
  complete: boolean;
  missing: string[];
  missingFields: WorkerProfileField[];
};

type WorkerProfileUser = Pick<
  User,
  'emailVerified' | 'phoneVerified' | 'avatar' | 'firstName' | 'lastName' | 'name' | 'city' | 'brokerRegionLabel' | 'termsAccepted'
>;

export function assessWorkerProfileCompleteness(user: WorkerProfileUser): WorkerProfileAssessment {
  const missingFields: WorkerProfileField[] = [];

  if (!user.emailVerified) missingFields.push('emailVerified');
  if (!user.phoneVerified) missingFields.push('phoneVerified');
  if (!String(user.avatar ?? '').trim()) missingFields.push('avatar');

  const displayName =
    [user.firstName, user.lastName].map((p) => String(p ?? '').trim()).filter(Boolean).join(' ') ||
    String(user.name ?? '').trim();
  if (!displayName) missingFields.push('name');

  const location = String(user.city ?? '').trim() || String(user.brokerRegionLabel ?? '').trim();
  if (!location) missingFields.push('location');

  if (!user.termsAccepted) missingFields.push('termsAccepted');

  return {
    complete: missingFields.length === 0,
    missing: missingFields.map((f) => WORKER_PROFILE_FIELD_LABELS[f]),
    missingFields,
  };
}
