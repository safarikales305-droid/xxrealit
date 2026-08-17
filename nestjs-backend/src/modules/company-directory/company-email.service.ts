import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CompanyContactStatus,
  CompanyEmailLogStatus,
  CompanyReviewCompanyNotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { CompanyAuditService } from './company-audit.service';
import { COMPANY_OUTREACH_ENABLED } from './company-directory.constants';
import { buildCompanyReviewEmailBody } from './company-review-social.util';

const TEMPLATE_KEYS = {
  profileCreated: 'company_profile_created',
  claimProfile: 'company_claim_profile',
  newReview: 'company_new_review',
  dataReviewRequest: 'company_data_review_request',
  reportResponse: 'company_report_response',
} as const;

@Injectable()
export class CompanyEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly audit: CompanyAuditService,
  ) {}

  async sendAdminEmail(input: {
    companyId: string;
    recipient: string;
    subject: string;
    template: keyof typeof TEMPLATE_KEYS | string;
    body: string;
    adminUserId?: string;
    variables?: Record<string, string>;
  }) {
    if (!COMPANY_OUTREACH_ENABLED) {
      throw new BadRequestException('Odesílání emailů firmám je vypnuté (COMPANY_OUTREACH_ENABLED=false).');
    }

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: input.companyId },
    });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const log = await this.prisma.companyEmailLog.create({
      data: {
        companyId: input.companyId,
        recipient: input.recipient.trim().toLowerCase(),
        subject: input.subject.trim(),
        template: input.template,
        bodyPreview: input.body.slice(0, 500),
        status: CompanyEmailLogStatus.QUEUED,
        sentByAdminId: input.adminUserId ?? null,
      },
    });

    try {
      const templateKey =
        input.template in TEMPLATE_KEYS
          ? TEMPLATE_KEYS[input.template as keyof typeof TEMPLATE_KEYS]
          : 'custom_message';

      await this.emails.sendTemplatedEmail({
        type: 'company_outreach',
        to: input.recipient,
        templateKey: templateKey === 'custom_message' ? 'custom_message' : templateKey,
        variables: {
          companyName: company.name,
          companyUrl: `${resolveFrontendUrl()}/firmy/${company.slug}`,
          subject: input.subject,
          bodyHtml: input.body.replace(/\n/g, '<br/>'),
          bodyText: input.body,
          message: input.body,
          portalName: 'XXREALIT',
          ...(input.variables ?? {}),
        },
      });

      await this.prisma.companyEmailLog.update({
        where: { id: log.id },
        data: { status: CompanyEmailLogStatus.SENT, sentAt: new Date() },
      });

      await this.audit.log({
        companyId: company.id,
        action: 'ADMIN_EMAIL_SEND',
        message: `Admin email odeslán na ${input.recipient}`,
        actorUserId: input.adminUserId,
      });

      return { ok: true, logId: log.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.companyEmailLog.update({
        where: { id: log.id },
        data: { status: CompanyEmailLogStatus.FAILED, error: message },
      });
      throw new BadRequestException(`Odeslání emailu selhalo: ${message}`);
    }
  }

  async resolveCompanyNotificationEmail(companyId: string, reviewId?: string): Promise<string | null> {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    const verified = company.verifiedBusinessEmail?.trim().toLowerCase();
    if (verified) return verified;

    if (reviewId) {
      const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
      const submitted = review?.submittedBusinessEmail?.trim().toLowerCase();
      if (submitted && review?.submittedEmailStatus === CompanyContactStatus.VERIFIED) {
        return submitted;
      }
    }

    const approvedContact = await this.prisma.companyContact.findFirst({
      where: {
        companyId,
        status: CompanyContactStatus.VERIFIED,
        sourceType: 'USER_SUBMITTED',
      },
      orderBy: { verifiedAt: 'desc' },
    });
    if (approvedContact?.email) return approvedContact.email.trim().toLowerCase();

    const discovered = await this.prisma.companyContact.findFirst({
      where: {
        companyId,
        status: {
          in: [CompanyContactStatus.FOUND_HIGH_CONFIDENCE, CompanyContactStatus.VERIFIED],
        },
      },
      orderBy: [{ confidence: 'desc' }, { discoveredAt: 'desc' }],
    });
    if (discovered?.email) return discovered.email.trim().toLowerCase();

    if (company.discoveredEmail?.trim()) return company.discoveredEmail.trim().toLowerCase();
    if (company.email?.trim()) return company.email.trim().toLowerCase();

    return null;
  }

  async notifyCompanyNewReview(
    companyId: string,
    reviewId: string,
    opts?: { idempotencyKey?: string; adminUserId?: string; force?: boolean },
  ) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
    });
    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!company || !review) return { ok: false, reason: 'NOT_FOUND' as const };

    if (
      !opts?.force &&
      (review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.SENT ||
        review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.ALREADY_SENT)
    ) {
      return { ok: false, reason: 'ALREADY_SENT' as const };
    }

    if (
      !opts?.force &&
      review.companyNotificationStatus === CompanyReviewCompanyNotificationStatus.QUEUED
    ) {
      const queuedAgeMs = Date.now() - review.updatedAt.getTime();
      if (queuedAgeMs < 120_000) {
        throw new ConflictException('Upozornění firmě je právě ve frontě. Zkuste to za chvíli.');
      }
    }

    const recipient = await this.resolveCompanyNotificationEmail(companyId, reviewId);
    if (!recipient) {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          companyNotificationStatus: CompanyReviewCompanyNotificationStatus.NO_COMPANY_EMAIL,
          companyNotificationError: 'Nenalezen žádný použitelný email firmy.',
        },
      });
      return { ok: false, reason: 'NO_EMAIL' as const };
    }

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        companyNotificationStatus: CompanyReviewCompanyNotificationStatus.QUEUED,
        companyNotificationError: null,
        companyNotificationEmailUsed: recipient,
      },
    });

    const base = resolveFrontendUrl().replace(/\/+$/, '');
    const companyProfileUrl = `${base}/firmy/${company.slug}`;
    const reviewUrl = `${companyProfileUrl}#review-${reviewId}`;
    const reviewExcerpt = review.body.trim().slice(0, 220);
    const isClaimed = Boolean(company.claimedByUserId);

    const bodyText = buildCompanyReviewEmailBody({
      companyName: company.name,
      companyProfileUrl,
      reviewUrl,
      claimUrl: `${companyProfileUrl}#prevzit-profil`,
      manageUrl: `${companyProfileUrl}#sprava-profilu`,
      reviewExcerpt,
      averageRating: company.xxrealitRatingAverage,
      reviewCount: company.xxrealitReviewCount ?? 0,
      singleReviewRating: review.rating,
      sentiment: review.sentiment,
      isClaimed,
    });

    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const avg = (company.xxrealitRatingAverage ?? review.rating).toFixed(1);

    try {
      const sendResult = await this.emails.sendTemplatedEmail({
        type: 'company_review_notification',
        templateKey: 'company_new_review',
        to: recipient,
        variables: {
          companyName: company.name,
          companyUrl: companyProfileUrl,
          companyProfileUrl,
          reviewRating: String(review.rating),
          reviewAverage: avg,
          reviewStars: stars,
          reviewCount: String(company.xxrealitReviewCount ?? 0),
          reviewPreview: reviewExcerpt,
          reviewExcerpt,
          reviewUrl,
          claimUrl: `${companyProfileUrl}#prevzit-profil`,
          manageUrl: `${companyProfileUrl}#sprava-profilu`,
          ctaUrl: reviewUrl,
          secondaryCtaUrl: isClaimed ? `${companyProfileUrl}#sprava-profilu` : `${companyProfileUrl}#prevzit-profil`,
          secondaryCtaLabel: isClaimed ? 'Spravovat profil' : 'Převzít / upravit profil firmy',
          sentiment: review.sentiment,
          portalName: 'XXREALIT',
          bodyHtml: bodyText.replace(/\n/g, '<br/>'),
          bodyText,
        },
        metadata: {
          companyId,
          reviewId,
          idempotencyKey: opts?.idempotencyKey ?? null,
          provider: 'resend',
        },
      });

      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          companyNotificationStatus: CompanyReviewCompanyNotificationStatus.SENT,
          companyNotificationSentAt: new Date(),
          companyNotificationError: null,
          companyNotificationMessageId: sendResult.providerMessageId ?? null,
          companyNotificationEmailUsed: recipient,
        },
      });
      await this.audit.log({
        companyId,
        action: 'COMPANY_REVIEW_NOTIFICATION_SENT',
        message: opts?.idempotencyKey
          ? `${opts.idempotencyKey} → ${recipient}`
          : `Upozornění o recenzi ${reviewId} odesláno na ${recipient}`,
        actorUserId: opts?.adminUserId,
        meta: {
          reviewId,
          recipient,
          providerMessageId: sendResult.providerMessageId ?? null,
          forced: Boolean(opts?.force),
        },
      });
      return {
        ok: true,
        recipient,
        providerMessageId: sendResult.providerMessageId ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          companyNotificationStatus: CompanyReviewCompanyNotificationStatus.FAILED,
          companyNotificationError: message.slice(0, 2000),
        },
      });
      await this.audit.log({
        companyId,
        action: 'COMPANY_REVIEW_NOTIFICATION_FAILED',
        message: `Upozornění firmě o recenzi selhalo: ${message}`,
        meta: { reviewId, recipient },
      });
      return { ok: false, reason: 'FAILED' as const, error: message };
    }
  }
}
