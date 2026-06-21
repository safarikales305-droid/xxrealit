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
 * Veřejný portál — pouze aktivní zveřejněné inzeráty.
 * published = approved, status = ACTIVE (nebo APPROVED z admin schválení), deletedAt = null.
 */
export function publiclyActiveListingWhere(
  now: Date = new Date(),
): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    approved: true,
    isActive: true,
    isVisible: true,
    AND: [
      {
        OR: [
          { status: { equals: 'ACTIVE', mode: 'insensitive' } },
          { status: { equals: 'APPROVED', mode: 'insensitive' } },
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
  status?: string | null;
};

function normalizeListingStatus(status?: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

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

  const statusNorm = normalizeListingStatus(p.status);
  if (
    statusNorm &&
    statusNorm !== 'ACTIVE' &&
    statusNorm !== 'APPROVED'
  ) {
    if (statusNorm === 'PENDING') return 'PENDING_APPROVAL';
    return 'INACTIVE';
  }

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
