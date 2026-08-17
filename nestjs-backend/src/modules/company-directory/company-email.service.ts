import { BadRequestException, Injectable } from '@nestjs/common';
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

  async notifyCompanyNewReview(companyId: string, reviewId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
    });
    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!company || !review) return;

    let recipient = company.verifiedBusinessEmail?.trim() || review.submittedBusinessEmail?.trim() || '';
    if (!recipient) {
      const discovered = await this.prisma.companyContact.findFirst({
        where: {
          companyId,
          status: {
            in: [
              CompanyContactStatus.FOUND_HIGH_CONFIDENCE,
              CompanyContactStatus.FOUND_MEDIUM_CONFIDENCE,
              CompanyContactStatus.VERIFIED,
            ],
          },
        },
        orderBy: { confidence: 'desc' },
      });
      recipient = discovered?.email?.trim() ?? '';
    }
    if (!recipient) {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.NO_COMPANY_EMAIL },
      });
      return;
    }

    if (!COMPANY_OUTREACH_ENABLED) {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.NOT_SENT },
      });
      return;
    }

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.QUEUED },
    });

    try {
      await this.sendAdminEmail({
        companyId,
        recipient,
        subject: `Na XXREALIT byla zveřejněna nová zkušenost s vaší firmou`,
        template: 'newReview',
        body: `Na profilu vaší firmy ${company.name} byla zveřejněna nová recenze (${review.rating}/5).`,
        variables: {
          reviewRating: String(review.rating),
          reviewPreview: review.body.slice(0, 160),
          reviewUrl: `${resolveFrontendUrl()}/firmy/${company.slug}#review-${reviewId}`,
          claimUrl: `${resolveFrontendUrl()}/firmy/${company.slug}#prevzit-profil`,
          mediaSummary: await this.reviewMediaSummary(reviewId),
        },
      });
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.SENT },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: { companyNotificationStatus: CompanyReviewCompanyNotificationStatus.FAILED },
      });
      this.audit.log({
        companyId,
        action: 'ADMIN_EMAIL_SEND',
        message: `Upozornění firmě o recenzi selhalo: ${message}`,
        meta: { reviewId },
      });
    }
  }

  private async reviewMediaSummary(reviewId: string): Promise<string> {
    const media = await this.prisma.companyReviewMedia.findMany({ where: { reviewId } });
    const images = media.filter((m) => m.type === 'IMAGE').length;
    const videos = media.filter((m) => m.type === 'VIDEO').length;
    if (images === 0 && videos === 0) return '';
    const parts: string[] = [];
    if (images > 0) parts.push(`${images} fotografií`);
    if (videos > 0) parts.push(`${videos} videí`);
    return `Recenze obsahuje ${parts.join(' a ')}.`;
  }
}
