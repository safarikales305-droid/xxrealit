import type { UserRole } from '@prisma/client';
import { PROFESSIONAL_ROLES } from '../social/autopost/social-autopost.types';

export type ListingApprovalSettings = {
  /** Nové inzeráty musí schválit admin (výchozí: ano). */
  requireNewListingApproval: boolean;
  /** Po úpravě inzerátu znovu čeká na schválení. */
  requireEditApproval: boolean;
  /** Po vložení rovnou aktivovat (pokud neplatí výjimky). */
  autoPublishOnCreate: boolean;
  /** Auto-publikace jen pro ověřené profesionály. */
  autoPublishVerifiedUsersOnly: boolean;
  /** Auto-publikace jen pro profesionální role. */
  autoPublishProfessionalsOnly: boolean;
  /** Soukromé / uživatelské inzeráty vždy čekají na schválení. */
  privateListingsAlwaysPending: boolean;
};

export const DEFAULT_LISTING_APPROVAL_SETTINGS: ListingApprovalSettings = {
  requireNewListingApproval: true,
  requireEditApproval: false,
  autoPublishOnCreate: false,
  autoPublishVerifiedUsersOnly: false,
  autoPublishProfessionalsOnly: false,
  privateListingsAlwaysPending: true,
};

export type ListingApprovalUserContext = {
  role: UserRole;
  professionalVerificationStatus?: string | null;
  isOwnerListing?: boolean;
};

export type ListingApprovalDecision = {
  approved: boolean;
  status: 'PENDING' | 'ACTIVE' | 'APPROVED';
  requiresApproval: boolean;
};

export function isProfessionalRole(role: UserRole): boolean {
  return PROFESSIONAL_ROLES.includes(role);
}

export function isVerifiedProfessional(ctx: ListingApprovalUserContext): boolean {
  return ctx.professionalVerificationStatus === 'APPROVED';
}

export function isPrivateListingContext(ctx: ListingApprovalUserContext): boolean {
  if (ctx.isOwnerListing) return true;
  return ctx.role === 'USER';
}

export function resolveListingApprovalOnCreate(
  settings: ListingApprovalSettings,
  ctx: ListingApprovalUserContext,
): ListingApprovalDecision {
  if (!settings.requireNewListingApproval) {
    return { approved: true, status: 'ACTIVE', requiresApproval: false };
  }

  if (settings.privateListingsAlwaysPending && isPrivateListingContext(ctx)) {
    return { approved: false, status: 'PENDING', requiresApproval: true };
  }

  if (settings.autoPublishOnCreate) {
    if (settings.autoPublishProfessionalsOnly && !isProfessionalRole(ctx.role)) {
      return { approved: false, status: 'PENDING', requiresApproval: true };
    }
    if (settings.autoPublishVerifiedUsersOnly && !isVerifiedProfessional(ctx)) {
      return { approved: false, status: 'PENDING', requiresApproval: true };
    }
    return { approved: true, status: 'ACTIVE', requiresApproval: false };
  }

  return { approved: false, status: 'PENDING', requiresApproval: true };
}

export function resolveListingApprovalOnEdit(
  settings: ListingApprovalSettings,
  wasApproved: boolean,
): ListingApprovalDecision | null {
  if (!settings.requireEditApproval || !wasApproved) return null;
  return { approved: false, status: 'PENDING', requiresApproval: true };
}
