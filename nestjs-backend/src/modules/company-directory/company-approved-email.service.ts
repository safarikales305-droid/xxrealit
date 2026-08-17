import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompanyContactSourceType,
  CompanyContactStatus,
  CompanyReviewCompanyNotificationStatus,
  CompanyReviewStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { validateEmailAddress } from '../emails/email-validation.util';
import { CompanyAuditService } from './company-audit.service';
import { CompanyEmailService } from './company-email.service';

export type AttachApprovedEmailResult = {
  email: string;
  companyEmailUpdated: boolean;
  verifiedEmailSet: boolean;
  contactVerified: boolean;
  reviewId: string | null;
};

export type ReviewNotificationResult = {
  notificationQueued: boolean;
  notificationStatus: CompanyReviewCompanyNotificationStatus;
  reviewId: string | null;
};

@Injectable()
export class CompanyApprovedEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CompanyAuditService,
    private readonly companyEmail: CompanyEmailService,
  ) {}

  validateBusinessEmail(email: string): string {
    const result = validateEmailAddress(email);
    if (!result.ok) {
      throw new BadRequestException(`Neplatný firemní email: ${result.error}`);
    }
    return result.email;
  }

  async findLinkedReview(
    companyId: string,
    email: string,
    userId?: string | null,
  ) {
    const normalized = email.trim().toLowerCase();
    return this.prisma.companyReview.findFirst({
      where: {
        companyId,
        OR: [
          { submittedBusinessEmail: normalized },
          ...(userId ? [{ authorUserId: userId }] : []),
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async attachAdminApprovedEmail(
    input: {
      companyId: string;
      email: string;
      adminUserId?: string;
      claimRequestId?: string;
      reviewId?: string | null;
      forcePrimary?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<AttachApprovedEmailResult> {
    const db = tx ?? this.prisma;
    const normalized = this.validateBusinessEmail(input.email);

    const company = await db.companyDirectoryEntry.findUnique({
      where: { id: input.companyId },
    });
    if (!company) {
      throw new BadRequestException('Firma nenalezena.');
    }

    let reviewId = input.reviewId ?? null;
    if (!reviewId) {
      const review = await this.findLinkedReview(company.id, normalized);
      reviewId = review?.id ?? null;
    }

    let verifiedEmailSet = false;
    let companyEmailUpdated = false;
    const companyUpdate: Prisma.CompanyDirectoryEntryUpdateInput = {};

    const existingVerified = company.verifiedBusinessEmail?.trim().toLowerCase();

    if (!existingVerified) {
      companyUpdate.verifiedBusinessEmail = normalized;
      companyUpdate.email = normalized;
      companyUpdate.emailDiscoveredAt = company.emailDiscoveredAt ?? new Date();
      verifiedEmailSet = true;
      companyEmailUpdated = true;
    } else if (input.forcePrimary && existingVerified !== normalized) {
      companyUpdate.verifiedBusinessEmail = normalized;
      companyUpdate.email = normalized;
      verifiedEmailSet = true;
      companyEmailUpdated = true;
    } else if (!company.email) {
      companyUpdate.email = normalized;
      companyEmailUpdated = true;
    } else if (!company.discoveredEmail && !existingVerified) {
      companyUpdate.discoveredEmail = normalized;
      companyUpdate.emailDiscoveredAt = new Date();
      companyEmailUpdated = true;
    }

    if (Object.keys(companyUpdate).length > 0) {
      await db.companyDirectoryEntry.update({
        where: { id: company.id },
        data: companyUpdate,
      });
    }

    const matchingContacts = await db.companyContact.findMany({
      where: {
        companyId: company.id,
        email: normalized,
      },
    });

    let contactVerified = false;
    if (matchingContacts.length > 0) {
      await db.companyContact.updateMany({
        where: { companyId: company.id, email: normalized },
        data: {
          status: CompanyContactStatus.VERIFIED,
          verifiedAt: new Date(),
          sourceType: CompanyContactSourceType.USER_SUBMITTED,
        },
      });
      contactVerified = true;
    } else {
      await db.companyContact.create({
        data: {
          companyId: company.id,
          email: normalized,
          sourceType: CompanyContactSourceType.USER_SUBMITTED,
          status: CompanyContactStatus.VERIFIED,
          confidence: 1,
          verifiedAt: new Date(),
          sourceUrl: input.claimRequestId
            ? `claim-request:${input.claimRequestId}`
            : reviewId
              ? `review:${reviewId}`
              : null,
        },
      });
      contactVerified = true;
    }

    if (reviewId) {
      await db.companyReview.updateMany({
        where: { id: reviewId, companyId: company.id },
        data: { submittedEmailStatus: CompanyContactStatus.VERIFIED },
      });
    }

    if (!tx) {
      await this.audit.log({
        companyId: company.id,
        action: 'COMPANY_EMAIL_ATTACHED',
        message: `Admin schválil firemní email ${normalized}`,
        actorUserId: input.adminUserId,
        meta: {
          email: normalized,
          claimRequestId: input.claimRequestId ?? null,
          reviewId,
          verifiedEmailSet,
        },
      });
      if (verifiedEmailSet) {
        await this.audit.log({
          companyId: company.id,
          action: 'COMPANY_EMAIL_APPROVED',
          message: `Ověřený firemní email nastaven na ${normalized}`,
          actorUserId: input.adminUserId,
        });
      }
    }

    return {
      email: normalized,
      companyEmailUpdated,
      verifiedEmailSet,
      contactVerified,
      reviewId,
    };
  }

  async enqueueReviewNotificationIfEligible(
    companyId: string,
    reviewId: string,
    meta?: { claimRequestId?: string; adminUserId?: string },
  ): Promise<ReviewNotificationResult> {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
    });
    if (!review || review.companyId !== companyId) {
      return {
        notificationQueued: false,
        notificationStatus: CompanyReviewCompanyNotificationStatus.NOT_SENT,
        reviewId: null,
      };
    }

    if (review.status !== CompanyReviewStatus.PUBLISHED) {
      if (
        review.companyNotificationStatus !== CompanyReviewCompanyNotificationStatus.SENT &&
        review.companyNotificationStatus !== CompanyReviewCompanyNotificationStatus.ALREADY_SENT
      ) {
        await this.prisma.companyReview.update({
          where: { id: reviewId },
          data: {
            companyNotificationStatus:
              CompanyReviewCompanyNotificationStatus.WAITING_FOR_REVIEW_APPROVAL,
          },
        });
      }
      return {
        notificationQueued: false,
        notificationStatus: CompanyReviewCompanyNotificationStatus.WAITING_FOR_REVIEW_APPROVAL,
        reviewId,
      };
    }

    if (
      review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.SENT ||
      review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.ALREADY_SENT ||
      review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.QUEUED
    ) {
      return {
        notificationQueued: false,
        notificationStatus: CompanyReviewCompanyNotificationStatus.ALREADY_SENT,
        reviewId,
      };
    }

    const idempotencyKey = `COMPANY_REVIEW_NOTIFICATION:${reviewId}:${companyId}`;
    const existingLog = await this.prisma.companyAuditLog.findFirst({
      where: {
        companyId,
        action: 'COMPANY_REVIEW_NOTIFICATION_SENT',
        message: { contains: idempotencyKey },
      },
    });
    if (existingLog) {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.ALREADY_SENT },
      });
      return {
        notificationQueued: false,
        notificationStatus: CompanyReviewCompanyNotificationStatus.ALREADY_SENT,
        reviewId,
      };
    }

    await this.audit.log({
      companyId,
      action: 'COMPANY_REVIEW_NOTIFICATION_QUEUED',
      message: `Zařazeno upozornění firmě o recenzi ${reviewId}`,
      actorUserId: meta?.adminUserId,
      meta: { reviewId, claimRequestId: meta?.claimRequestId, idempotencyKey },
    });

    void this.companyEmail
      .notifyCompanyNewReview(companyId, reviewId, {
        idempotencyKey,
        adminUserId: meta?.adminUserId,
      })
      .catch(() => undefined);

    return {
      notificationQueued: true,
      notificationStatus: CompanyReviewCompanyNotificationStatus.QUEUED,
      reviewId,
    };
  }
}
