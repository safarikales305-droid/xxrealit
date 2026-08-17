import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyClaimRequestStatus,
  CompanyDirectoryProfileStatus,
  CompanyDirectoryVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyApprovedEmailService } from './company-approved-email.service';
import { CompanyAuditService } from './company-audit.service';

export type ClaimApproveResult = {
  ok: true;
  status: 'APPROVED' | 'REJECTED';
  alreadyApproved?: boolean;
  companyEmailUpdated?: boolean;
  verifiedEmailSet?: boolean;
  notificationQueued?: boolean;
  notificationStatus?: string;
  reviewId?: string | null;
  linkedReviewId?: string | null;
  message?: string;
};

@Injectable()
export class CompanyClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvedEmail: CompanyApprovedEmailService,
    private readonly audit: CompanyAuditService,
  ) {}

  async submitClaim(input: {
    companyId?: string;
    slug?: string;
    ico: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    userId?: string;
  }) {
    const normalizedIco = input.ico.replace(/\D/g, '').padStart(8, '0');
    if (normalizedIco.length !== 8) {
      throw new BadRequestException('IČO musí mít 8 číslic.');
    }

    const company = input.companyId
      ? await this.prisma.companyDirectoryEntry.findUnique({ where: { id: input.companyId } })
      : input.slug
        ? await this.prisma.companyDirectoryEntry.findFirst({
            where: { OR: [{ slug: input.slug }, { ico: normalizedIco }] },
          })
        : await this.prisma.companyDirectoryEntry.findUnique({ where: { ico: normalizedIco } });

    if (!company) {
      throw new NotFoundException('Firemní profil pro převzetí nebyl nalezen.');
    }

    if (company.ico !== normalizedIco) {
      throw new BadRequestException('Zadané IČO neodpovídá profilu firmy.');
    }

    if (
      company.profileStatus === CompanyDirectoryProfileStatus.CLAIMED ||
      company.profileStatus === CompanyDirectoryProfileStatus.VERIFIED
    ) {
      throw new BadRequestException('Tento profil již byl převzat.');
    }

    const pending = await this.prisma.companyClaimRequest.findFirst({
      where: {
        companyId: company.id,
        status: { in: [CompanyClaimRequestStatus.PENDING, CompanyClaimRequestStatus.UNDER_REVIEW] },
      },
    });
    if (pending) {
      throw new BadRequestException('Žádost o převzetí tohoto profilu již čeká na vyřízení.');
    }

    return this.prisma.companyClaimRequest.create({
      data: {
        companyId: company.id,
        userId: input.userId ?? null,
        ico: normalizedIco,
        contactName: input.contactName.trim(),
        contactEmail: input.contactEmail.trim().toLowerCase(),
        contactPhone: input.contactPhone?.trim() || null,
        status: CompanyClaimRequestStatus.PENDING,
      },
    });
  }

  async listClaims(status?: string) {
    return this.prisma.companyClaimRequest.findMany({
      where: status
        ? { status: status as CompanyClaimRequestStatus }
        : undefined,
      include: {
        company: { select: { id: true, name: true, slug: true, ico: true, verifiedBusinessEmail: true, email: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async reviewClaim(
    claimId: string,
    action: 'approve' | 'reject',
    adminNote?: string,
    adminUserId?: string,
    options?: { forcePrimaryEmail?: boolean },
  ): Promise<ClaimApproveResult> {
    if (action === 'approve') {
      return this.approveCompanyClaimRequest(claimId, adminUserId, adminNote, options);
    }
    return this.rejectCompanyClaimRequest(claimId, adminNote, adminUserId);
  }

  async approveCompanyClaimRequest(
    claimId: string,
    adminUserId?: string,
    adminNote?: string,
    options?: { forcePrimaryEmail?: boolean },
  ): Promise<ClaimApproveResult> {
    const claim = await this.prisma.companyClaimRequest.findUnique({
      where: { id: claimId },
      include: { company: true },
    });
    if (!claim) throw new NotFoundException('Žádost nenalezena.');

    if (claim.status === CompanyClaimRequestStatus.APPROVED) {
      const reviewId = claim.linkedReviewId;
      return {
        ok: true,
        status: 'APPROVED',
        alreadyApproved: true,
        companyEmailUpdated: claim.companyEmailAttached,
        notificationQueued: false,
        notificationStatus: 'ALREADY_SENT',
        reviewId,
        linkedReviewId: reviewId,
        message: 'Žádost již byla dříve schválena.',
      };
    }

    if (claim.status === CompanyClaimRequestStatus.REJECTED) {
      throw new BadRequestException('Zamítnutou žádost nelze schválit.');
    }

    const normalizedEmail = this.approvedEmail.validateBusinessEmail(claim.contactEmail);
    const linkedReview = await this.approvedEmail.findLinkedReview(
      claim.companyId,
      normalizedEmail,
      claim.userId,
    );

    let attachResult: Awaited<ReturnType<CompanyApprovedEmailService['attachAdminApprovedEmail']>>;
    await this.prisma.$transaction(async (tx) => {
      await tx.companyClaimRequest.update({
        where: { id: claimId },
        data: {
          status: CompanyClaimRequestStatus.APPROVED,
          adminNote: adminNote ?? null,
          approvedAt: new Date(),
          approvedByAdminId: adminUserId ?? null,
          linkedReviewId: linkedReview?.id ?? null,
        },
      });

      await tx.companyDirectoryEntry.update({
        where: { id: claim.companyId },
        data: {
          profileStatus: CompanyDirectoryProfileStatus.CLAIMED,
          verificationStatus: CompanyDirectoryVerificationStatus.PENDING,
          claimedAt: new Date(),
          claimedByUserId: claim.userId,
        },
      });

      await tx.companyEngagementCampaign.updateMany({
        where: { companyId: claim.companyId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: {
          status: 'STOPPED',
          stoppedReason: 'claimed',
          completedAt: new Date(),
          nextSendAt: null,
        },
      });

      attachResult = await this.approvedEmail.attachAdminApprovedEmail(
        {
          companyId: claim.companyId,
          email: normalizedEmail,
          adminUserId,
          claimRequestId: claimId,
          reviewId: linkedReview?.id ?? null,
          forcePrimary: options?.forcePrimaryEmail,
        },
        tx,
      );

      await tx.companyClaimRequest.update({
        where: { id: claimId },
        data: { companyEmailAttached: attachResult.companyEmailUpdated || attachResult.verifiedEmailSet },
      });
    });

    await this.audit.log({
      companyId: claim.companyId,
      action: 'CLAIM_REQUEST_APPROVED',
      message: `Claim request ${claimId} schválen, email ${normalizedEmail}`,
      actorUserId: adminUserId,
      meta: {
        claimRequestId: claimId,
        reviewId: linkedReview?.id ?? null,
        email: normalizedEmail,
      },
    });

    let notificationResult: Awaited<
      ReturnType<CompanyApprovedEmailService['enqueueReviewNotificationIfEligible']>
    > | null = null;

    if (linkedReview?.id) {
      notificationResult = await this.approvedEmail.enqueueReviewNotificationIfEligible(
        claim.companyId,
        linkedReview.id,
        { claimRequestId: claimId, adminUserId },
      );
    }

    return {
      ok: true,
      status: 'APPROVED',
      companyEmailUpdated: attachResult!.companyEmailUpdated || attachResult!.verifiedEmailSet,
      verifiedEmailSet: attachResult!.verifiedEmailSet,
      notificationQueued: notificationResult?.notificationQueued ?? false,
      notificationStatus: notificationResult?.notificationStatus ?? 'NOT_SENT',
      reviewId: linkedReview?.id ?? null,
      linkedReviewId: linkedReview?.id ?? null,
      message: linkedReview?.id
        ? notificationResult?.notificationQueued
          ? 'Claim schválen, email uložen, upozornění firmě zařazeno.'
          : linkedReview.status === 'PUBLISHED'
            ? 'Claim schválen a email uložen.'
            : 'Claim schválen a email uložen. Notifikace odejde po schválení recenze.'
        : 'Claim schválen a email uložen. Navázaná recenze nebyla nalezena.',
    };
  }

  private async rejectCompanyClaimRequest(
    claimId: string,
    adminNote?: string,
    adminUserId?: string,
  ): Promise<ClaimApproveResult> {
    const claim = await this.prisma.companyClaimRequest.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Žádost nenalezena.');

    await this.prisma.companyClaimRequest.update({
      where: { id: claimId },
      data: {
        status: CompanyClaimRequestStatus.REJECTED,
        adminNote: adminNote ?? null,
      },
    });

    await this.audit.log({
      companyId: claim.companyId,
      action: 'MODERATION',
      message: `Claim request ${claimId} zamítnut`,
      actorUserId: adminUserId,
    });

    return { ok: true, status: 'REJECTED' };
  }
}
