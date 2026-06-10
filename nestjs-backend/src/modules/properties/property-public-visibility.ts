import { Prisma } from '@prisma/client';

/** Veřejný výpis: není smazaný, zapnutý, v časovém okně. Schválení řeší volající dotaz. */
export function publiclyVisiblePropertyWhere(
  now: Date = new Date(),
): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    isActive: true,
    isVisible: true,
    AND: [
      { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
      { OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] },
    ],
  };
}

/**
 * Stejné podmínky jako admin filtr status=ACTIVE (listingStatus ACTIVE v /admin/inzeraty).
 * Podporuje approved=true i status APPROVED/ACTIVE (různé zápisy v DB).
 */
export function publiclyActiveListingWhere(
  now: Date = new Date(),
): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    isActive: true,
    isVisible: true,
    AND: [
      {
        OR: [
          { approved: true },
          { status: { equals: 'APPROVED', mode: 'insensitive' } },
          { status: { equals: 'ACTIVE', mode: 'insensitive' } },
        ],
      },
      { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
      { OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] },
    ],
  };
}

export type ListingLifecycleFields = {
  deletedAt: Date | null;
  isActive: boolean;
  isVisible: boolean;
  activeFrom: Date | null;
  activeUntil: Date | null;
  approved: boolean;
};

export function computeListingPublicStatus(
  p: ListingLifecycleFields,
  now: Date = new Date(),
):
  | 'DELETED'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'SCHEDULED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE' {
  if (p.deletedAt) return 'DELETED';
  if (!p.approved) return 'PENDING_APPROVAL';
  if (!p.isActive) return 'INACTIVE';
  if (!p.isVisible) return 'INACTIVE';
  if (p.activeUntil && p.activeUntil < now) return 'EXPIRED';
  if (p.activeFrom && p.activeFrom > now) return 'SCHEDULED';
  return 'ACTIVE';
}

export function isPropertyPubliclyListed(
  p: ListingLifecycleFields,
  now: Date = new Date(),
): boolean {
  return computeListingPublicStatus(p, now) === 'ACTIVE';
}
