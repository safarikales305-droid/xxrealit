import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCampaignStatus, EmailLogStatus, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import {
  normalizePublicEmailUrl,
  resolveFrontendUrl,
} from '../../common/resolve-frontend-url';

import {
  DEFAULT_EMAIL_TEMPLATES,
  getTemplateVariables,
} from './email-template-defaults';

type TemplateInput = {
  key: string;
  name: string;
  category: string;
  subject: string;
  htmlContent: string;
  textContent: string;
};

type SendTemplatedEmailInput = {
  type: string;
  templateKey: string;
  to: string;
  variables: Record<string, string | number | null | undefined>;
  senderName?: string | null;
  senderEmail?: string | null;
  metadata?: Record<string, unknown>;
};

const PORTAL_NAME = 'XXrealit.cz';

@Injectable()
export class EmailsService implements OnModuleInit {
  private readonly logger = new Logger(EmailsService.name);
  private readonly shareRateMap = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultTemplates();
  }

  private appUrl(): string {
    return resolveFrontendUrl(this.config, this.logger);
  }

  private normalizePublicUrl(url: string): string {
    return normalizePublicEmailUrl(url, this.config, this.logger);
  }

  private senderAddress(): string {
    return this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || 'xxrealit <reset@mail.xxrealit.cz>';
  }

  private render(content: string, variables: Record<string, unknown>): string {
    return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      const value = variables[key];
      return value == null ? '' : String(value);
    });
  }

  private buildLayout(innerHtml: string, ctaUrl?: string): string {
    const ctaButton = ctaUrl
      ? `<p style="margin:24px 0"><a href="${ctaUrl}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Otevřít xxrealit</a></p>`
      : '';
    return `
      <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
          <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#111827;color:#fff;font-weight:700">
            xxrealit.cz
          </div>
          <div style="padding:24px">${innerHtml}${ctaButton}</div>
          <div style="padding:16px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">
            Tento e-mail byl odeslán automaticky portálem xxrealit.cz.
          </div>
        </div>
      </div>
    `;
  }

  async ensureDefaultTemplates() {
    for (const t of DEFAULT_EMAIL_TEMPLATES) {
      const existing = await this.prisma.emailTemplate.findUnique({ where: { key: t.key } });
      if (!existing) {
        await this.prisma.emailTemplate.create({
          data: {
            key: t.key,
            name: t.name,
            category: t.category,
            subject: t.subject,
            htmlContent: t.htmlContent,
            textContent: t.textContent,
          },
        });
      }
    }
  }

  getTemplateCatalog() {
    return DEFAULT_EMAIL_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      category: t.category,
      variables: t.variables,
    }));
  }

  async getLog(id: string) {
    return this.prisma.emailLog.findUnique({ where: { id } });
  }

  async listLogsForRecipient(email: string, limit = 50) {
    return this.prisma.emailLog.findMany({
      where: { recipientEmail: email.trim().toLowerCase() },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    });
  }

  supportEmail(): string {
    return this.config.get<string>('SUPPORT_EMAIL')?.trim() || 'podpora@xxrealit.cz';
  }

  portalName(): string {
    return PORTAL_NAME;
  }

  loginUrl(): string {
    return `${this.appUrl()}/login`;
  }

  async listLogs(limit = 200) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(1000, limit)),
    });
  }

  async listTemplates() {
    const rows = await this.prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } });
    return rows.map((row) => ({
      ...row,
      variables: getTemplateVariables(row.key),
    }));
  }

  async updateTemplate(
    id: string,
    dto: Partial<{
      subject: string;
      htmlContent: string;
      textContent: string;
      isActive: boolean;
      name: string;
    }>,
  ) {
    const data: Prisma.EmailTemplateUpdateInput = {};
    if (typeof dto.subject === 'string') data.subject = dto.subject;
    if (typeof dto.htmlContent === 'string') data.htmlContent = dto.htmlContent;
    if (typeof dto.textContent === 'string') data.textContent = dto.textContent;
    if (typeof dto.name === 'string') data.name = dto.name;
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;
    return this.prisma.emailTemplate.update({ where: { id }, data });
  }

  async createCampaign(dto: {
    type: string;
    title: string;
    subject: string;
    templateKey?: string;
    htmlContent: string;
    scheduledAt?: string;
  }) {
    return this.prisma.emailCampaign.create({
      data: {
        type: dto.type,
        title: dto.title,
        subject: dto.subject,
        templateKey: dto.templateKey ?? null,
        htmlContent: dto.htmlContent,
        status: EmailCampaignStatus.draft,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
  }

  async listCampaigns() {
    return this.prisma.emailCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async sendRawEmail(input: {
    type: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  }) {
    const payloadJson =
      input.metadata == null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);

    const log = await this.prisma.emailLog.create({
      data: {
        type: input.type,
        subject: input.subject,
        recipientEmail: input.to,
        status: EmailLogStatus.queued,
        provider: 'resend',
        payloadJson,
      },
    });

    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.failed, errorMessage: 'Missing RESEND_API_KEY' },
      });
      throw new Error('Missing RESEND_API_KEY');
    }
    const resend = new Resend(apiKey);
    try {
      const response = await resend.emails.send({
        from: this.senderAddress(),
        to: input.to,
        subject: input.subject,
        html: this.buildLayout(input.html, ''),
        text: input.text,
      });
      if (response.error) {
        const msg = response.error.message || 'Unknown resend error';
        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: { status: EmailLogStatus.failed, errorMessage: msg },
        });
        throw new Error(msg);
      }
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: EmailLogStatus.sent,
          sentAt: new Date(),
          providerMessageId: response.data?.id ?? null,
        },
      });
      return { ok: true, logId: log.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.failed, errorMessage: msg },
      });
      throw error;
    }
  }

  async sendTemplatedEmail(input: SendTemplatedEmailInput) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { key: input.templateKey },
    });
    if (!template || !template.isActive) {
      throw new Error(`Email template "${input.templateKey}" not found or inactive.`);
    }

    const normalizedVariables: Record<string, string | number | null | undefined> = {
      ...input.variables,
      ctaUrl:
        typeof input.variables.ctaUrl === 'string'
          ? this.normalizePublicUrl(input.variables.ctaUrl)
          : input.variables.ctaUrl,
      resetUrl:
        typeof input.variables.resetUrl === 'string'
          ? this.normalizePublicUrl(input.variables.resetUrl)
          : input.variables.resetUrl,
      listingUrl:
        typeof input.variables.listingUrl === 'string'
          ? this.normalizePublicUrl(input.variables.listingUrl)
          : input.variables.listingUrl,
    };

    const subject = this.render(template.subject, normalizedVariables);
    const htmlBody = this.render(template.htmlContent, normalizedVariables);
    const textBody = this.render(template.textContent, normalizedVariables);
    const html = this.buildLayout(htmlBody, String(normalizedVariables.ctaUrl ?? ''));

    const payloadJson =
      input.metadata == null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);

    const log = await this.prisma.emailLog.create({
      data: {
        type: input.type,
        templateKey: input.templateKey,
        subject,
        recipientEmail: input.to,
        senderEmail: input.senderEmail ?? null,
        senderName: input.senderName ?? null,
        status: EmailLogStatus.queued,
        provider: 'resend',
        payloadJson,
      },
    });

    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.failed, errorMessage: 'Missing RESEND_API_KEY' },
      });
      throw new Error('Missing RESEND_API_KEY');
    }
    const resend = new Resend(apiKey);
    try {
      const response = await resend.emails.send({
        from: this.senderAddress(),
        to: input.to,
        subject,
        html,
        text: textBody,
      });
      if (response.error) {
        const msg = response.error.message || 'Unknown resend error';
        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: { status: EmailLogStatus.failed, errorMessage: msg },
        });
        throw new Error(msg);
      }
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: EmailLogStatus.sent,
          sentAt: new Date(),
          providerMessageId: response.data?.id ?? null,
        },
      });
      return { ok: true, logId: log.id, providerMessageId: response.data?.id ?? null };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.failed, errorMessage: msg },
      });
      throw error;
    }
  }

  async sendWelcomeEmail(user: { email: string; name?: string | null }) {
    const ctaUrl = `${this.appUrl()}/profil`;
    return this.sendTemplatedEmail({
      type: 'welcome',
      templateKey: 'welcome_email',
      to: user.email,
      variables: {
        userName: user.name || 'uživateli',
        ctaUrl,
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
      },
      metadata: { userEmail: user.email },
    });
  }

  async sendWorkerClientInvitationEmail(input: {
    email: string;
    clientName: string;
    workerName: string;
    completionUrl: string;
    preregistrationId?: string;
    workerId?: string;
  }) {
    const completeRegistrationUrl = this.normalizePublicUrl(input.completionUrl);
    const setPasswordUrl = completeRegistrationUrl;
    return this.sendTemplatedEmail({
      type: 'worker_client_invitation',
      templateKey: 'worker_client_invitation',
      to: input.email,
      variables: {
        clientName: input.clientName,
        workerName: input.workerName,
        portalName: this.portalName(),
        completeRegistrationUrl,
        setPasswordUrl,
        loginUrl: this.loginUrl(),
        supportEmail: this.supportEmail(),
        ctaUrl: completeRegistrationUrl,
      },
      metadata: {
        preregistrationId: input.preregistrationId ?? null,
        workerId: input.workerId ?? null,
      },
    });
  }

  async sendProfileOnboardingReminderEmail(user: { email: string; name?: string | null }) {
    const profileUrl = `${this.appUrl()}/profil/dashboard?tab=settings`;
    return this.sendTemplatedEmail({
      type: 'profile_onboarding_reminder',
      templateKey: 'profile_onboarding_reminder',
      to: user.email,
      variables: {
        userName: user.name || 'uživateli',
        profileUrl: this.normalizePublicUrl(profileUrl),
        ctaUrl: this.normalizePublicUrl(profileUrl),
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
      },
      metadata: { userEmail: user.email },
    });
  }

  async sendPasswordResetEmail(input: { email: string; resetUrl: string }) {
    const safeResetUrl = this.normalizePublicUrl(input.resetUrl);
    return this.sendTemplatedEmail({
      type: 'password_reset',
      templateKey: 'password_reset',
      to: input.email,
      variables: {
        resetUrl: safeResetUrl,
        ctaUrl: safeResetUrl,
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
      },
      metadata: { resetUrl: safeResetUrl },
    });
  }

  async sendEmailVerificationEmail(input: { email: string; verifyUrl: string }) {
    const safeVerifyUrl = this.normalizePublicUrl(input.verifyUrl);
    return this.sendTemplatedEmail({
      type: 'email_verification',
      templateKey: 'email_verification',
      to: input.email,
      variables: {
        verifyUrl: safeVerifyUrl,
        ctaUrl: safeVerifyUrl,
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
      },
      metadata: { verifyUrl: safeVerifyUrl },
    });
  }

  async shareListingByEmail(input: {
    propertyId: string;
    recipientEmail: string;
    recipientName?: string;
    senderName?: string;
    senderEmail?: string;
    senderMessage?: string;
    requesterKey?: string;
  }) {
    const now = Date.now();
    const key = `${input.requesterKey ?? 'anon'}:${input.recipientEmail.toLowerCase()}:${input.propertyId}`;
    const previous = this.shareRateMap.get(key) ?? 0;
    if (previous > now - 60_000) {
      throw new HttpException(
        'Sdílení je dočasně omezeno, zkuste to za chvíli.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.shareRateMap.set(key, now);

    const property = await this.prisma.property.findUnique({
      where: { id: input.propertyId },
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        propertyType: true,
        subType: true,
        price: true,
        images: true,
        area: true,
      },
    });
    if (!property) {
      throw new Error('Inzerát nebyl nalezen.');
    }
    const listingUrl = this.normalizePublicUrl(
      `${this.appUrl()}/nemovitost/${encodeURIComponent(property.id)}`,
    );
    const imageUrl = property.images?.[0]
      ? this.normalizePublicUrl(
          `${this.appUrl()}${property.images[0].startsWith('/') ? '' : '/'}${property.images[0]}`,
        )
      : '';
    const senderMessage = (input.senderMessage ?? '').trim();
    const priceLabel =
      property.price != null && property.price > 0
        ? `${new Intl.NumberFormat('cs-CZ').format(property.price)} Kč`
        : 'Cena na dotaz';
    const paramsLine = [
      property.propertyType,
      property.city,
      priceLabel,
      property.area ? `${property.area} m²` : '',
    ]
      .filter(Boolean)
      .join(' • ');
    const contentMessage = senderMessage || 'Bez doplňující zprávy.';

    return this.sendTemplatedEmail({
      type: 'listing_shared',
      templateKey: 'listing_shared',
      to: input.recipientEmail.trim().toLowerCase(),
      senderEmail: input.senderEmail ?? null,
      senderName: input.senderName ?? null,
      variables: {
        recipientName: input.recipientName ?? '',
        listingTitle: property.title,
        listingLocation: property.city,
        listingPrice: priceLabel,
        listingType: property.propertyType,
        listingParams: paramsLine,
        listingDescription: property.description.slice(0, 400),
        listingUrl,
        listingImageUrl: imageUrl,
        senderMessage: contentMessage,
        ctaUrl: listingUrl,
        portalName: this.portalName(),
      },
      metadata: {
        propertyId: property.id,
        senderEmail: input.senderEmail ?? null,
        senderName: input.senderName ?? null,
      },
    });
  }

  async sendContactLeadEmail(input: {
    to: string;
    ownerName: string;
    listingTitle: string;
    listingUrl: string;
    leadName: string;
    leadEmail: string;
    leadPhone: string;
    date: string;
    time: string;
  }) {
    const listingUrl = this.normalizePublicUrl(input.listingUrl);
    return this.sendTemplatedEmail({
      type: 'contact_lead',
      templateKey: 'contact_lead',
      to: input.to,
      variables: {
        ownerName: input.ownerName,
        listingTitle: input.listingTitle,
        listingUrl,
        leadName: input.leadName,
        leadEmail: input.leadEmail,
        leadPhone: input.leadPhone,
        date: input.date,
        time: input.time,
        portalName: this.portalName(),
        ctaUrl: listingUrl,
      },
      metadata: { listingTitle: input.listingTitle },
    });
  }

  async sendContactLeadWaitingCreditEmail(input: {
    to: string;
    ownerName: string;
    listingTitle: string;
    listingUrl: string;
  }) {
    const listingUrl = this.normalizePublicUrl(input.listingUrl);
    return this.sendTemplatedEmail({
      type: 'contact_lead_low_credit',
      templateKey: 'contact_lead_low_credit',
      to: input.to,
      variables: {
        ownerName: input.ownerName,
        listingTitle: input.listingTitle,
        listingUrl,
        ctaUrl: listingUrl,
        portalName: this.portalName(),
      },
      metadata: { listingTitle: input.listingTitle },
    });
  }

  async sendCreditTopUpConfirmedEmail(input: {
    to: string;
    userName: string;
    amount: number;
    invoiceNumber: string;
  }) {
    return this.sendTemplatedEmail({
      type: 'credit_top_up_confirmed',
      templateKey: 'credit_top_up_confirmed',
      to: input.to,
      variables: {
        userName: input.userName,
        amount: `${new Intl.NumberFormat('cs-CZ').format(input.amount)}`,
        invoiceNumber: input.invoiceNumber,
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
        ctaUrl: this.loginUrl(),
      },
      metadata: { invoiceNumber: input.invoiceNumber, amount: input.amount },
    });
  }

  async sendWorkerBonusCreditGiftEmail(input: {
    email: string;
    clientName: string;
    amount: number;
    workerName: string;
    clientUserId: string;
    workerId: string;
  }) {
    const portalUrl = this.loginUrl();
    const amountFormatted = new Intl.NumberFormat('cs-CZ').format(input.amount);
    return this.sendTemplatedEmail({
      type: 'worker_bonus_credit_gift',
      templateKey: 'worker_bonus_credit_gift',
      to: input.email,
      variables: {
        clientName: input.clientName,
        amount: amountFormatted,
        workerName: input.workerName,
        portalUrl: this.normalizePublicUrl(portalUrl),
        portalName: this.portalName(),
        ctaUrl: this.normalizePublicUrl(portalUrl),
      },
      metadata: {
        clientUserId: input.clientUserId,
        workerId: input.workerId,
        amount: input.amount,
      },
    });
  }

  private formatAmount(amount: number) {
    return new Intl.NumberFormat('cs-CZ').format(amount);
  }

  private tiparPayoutEmailVars(input: {
    userName: string;
    amount: number;
    adminNote?: string | null;
  }) {
    return {
      userName: input.userName,
      amount: this.formatAmount(input.amount),
      adminNote: input.adminNote?.trim() || '',
      portalName: this.portalName(),
      loginUrl: this.loginUrl(),
      ctaUrl: this.loginUrl(),
    };
  }

  async sendTiparPayoutRequestReceivedEmail(input: {
    to: string;
    userName: string;
    amount: number;
    userId: string;
    requestId: string;
  }) {
    return this.sendTemplatedEmail({
      type: 'tipar_payout_request_received',
      templateKey: 'tipar_payout_request_received',
      to: input.to,
      variables: this.tiparPayoutEmailVars(input),
      metadata: { userId: input.userId, requestId: input.requestId, amount: input.amount },
    });
  }

  async sendTiparPayoutApprovedEmail(input: {
    to: string;
    userName: string;
    amount: number;
    userId: string;
    requestId: string;
    adminNote?: string | null;
  }) {
    return this.sendTemplatedEmail({
      type: 'tipar_payout_approved',
      templateKey: 'tipar_payout_approved',
      to: input.to,
      variables: this.tiparPayoutEmailVars(input),
      metadata: { userId: input.userId, requestId: input.requestId, amount: input.amount },
    });
  }

  async sendTiparPayoutRejectedEmail(input: {
    to: string;
    userName: string;
    amount: number;
    userId: string;
    requestId: string;
    adminNote?: string | null;
  }) {
    return this.sendTemplatedEmail({
      type: 'tipar_payout_rejected',
      templateKey: 'tipar_payout_rejected',
      to: input.to,
      variables: this.tiparPayoutEmailVars(input),
      metadata: { userId: input.userId, requestId: input.requestId, amount: input.amount },
    });
  }

  async sendTiparPayoutPaidEmail(input: {
    to: string;
    userName: string;
    amount: number;
    userId: string;
    requestId: string;
    adminNote?: string | null;
  }) {
    return this.sendTemplatedEmail({
      type: 'tipar_payout_paid',
      templateKey: 'tipar_payout_paid',
      to: input.to,
      variables: this.tiparPayoutEmailVars(input),
      metadata: { userId: input.userId, requestId: input.requestId, amount: input.amount },
    });
  }

  async sendWorkerInternalMessageNotificationEmail(input: {
    to: string;
    workerName: string;
    messageUrl: string;
    workerId: string;
  }) {
    const messageUrl = this.normalizePublicUrl(input.messageUrl);
    return this.sendTemplatedEmail({
      type: 'worker_internal_message',
      templateKey: 'worker_internal_message',
      to: input.to,
      variables: {
        workerName: input.workerName,
        portalName: this.portalName(),
        messageUrl,
        ctaUrl: messageUrl,
      },
      metadata: { workerId: input.workerId },
    });
  }

  async sendWorkerBulkMessageNotificationEmail(input: {
    to: string;
    workerName: string;
    messageUrl: string;
    workerId: string;
    bulkMessageId: string;
  }) {
    const messageUrl = this.normalizePublicUrl(input.messageUrl);
    return this.sendTemplatedEmail({
      type: 'worker_bulk_message',
      templateKey: 'worker_bulk_message',
      to: input.to,
      variables: {
        workerName: input.workerName,
        portalName: this.portalName(),
        messageUrl,
        ctaUrl: messageUrl,
      },
      metadata: { workerId: input.workerId, bulkMessageId: input.bulkMessageId },
    });
  }

  async sendWorkerProfileCompletionReminderEmail(input: {
    to: string;
    workerName: string;
    profileUrl: string;
    workerId: string;
  }) {
    const profileUrl = this.normalizePublicUrl(input.profileUrl);
    return this.sendTemplatedEmail({
      type: 'worker_profile_completion_reminder',
      templateKey: 'worker_profile_completion_reminder',
      to: input.to,
      variables: {
        workerName: input.workerName,
        portalName: this.portalName(),
        profileUrl,
        ctaUrl: profileUrl,
      },
      metadata: { workerId: input.workerId },
    });
  }

  async sendWorkerCooperationCancelConfirmationEmail(input: {
    to: string;
    workerName: string;
    workerId: string;
  }) {
    return this.sendTemplatedEmail({
      type: 'worker_cooperation_cancel_confirmation',
      templateKey: 'worker_cooperation_cancel_confirmation',
      to: input.to,
      variables: {
        workerName: input.workerName,
        portalName: this.portalName(),
        loginUrl: this.loginUrl(),
      },
      metadata: { workerId: input.workerId },
    });
  }

  async sendWorkerRecruitmentTargetEmail(input: {
    to: string;
    workerName: string;
    targetName: string;
    workerId: string;
    targetId: string;
  }) {
    const workerPanelUrl = this.normalizePublicUrl(`${this.appUrl()}/pracovnik`);
    return this.sendTemplatedEmail({
      type: 'worker_recruitment_target',
      templateKey: 'worker_recruitment_target',
      to: input.to,
      variables: {
        workerName: input.workerName,
        targetName: input.targetName,
        portalName: this.portalName(),
        workerPanelUrl,
        ctaUrl: workerPanelUrl,
      },
      metadata: { workerId: input.workerId, targetId: input.targetId },
    });
  }

  postPublicUrl(postId: string): string {
    return this.normalizePublicUrl(
      `${this.appUrl()}/?view=posts&post=${encodeURIComponent(postId)}`,
    );
  }

  async sendPostLikeNotificationEmail(input: {
    to: string;
    authorName: string;
    actorName: string;
    postPreview: string;
    postId: string;
    authorUserId: string;
    actorUserId: string;
  }) {
    const postUrl = this.postPublicUrl(input.postId);
    return this.sendTemplatedEmail({
      type: 'post_like_notification',
      templateKey: 'post_like_notification',
      to: input.to.trim().toLowerCase(),
      variables: {
        authorName: input.authorName,
        actorName: input.actorName,
        postPreview: input.postPreview.slice(0, 200),
        postUrl,
        ctaUrl: postUrl,
        portalName: this.portalName(),
      },
      metadata: {
        postId: input.postId,
        authorUserId: input.authorUserId,
        actorUserId: input.actorUserId,
      },
    });
  }

  async sendPostCommentNotificationEmail(input: {
    to: string;
    authorName: string;
    actorName: string;
    postPreview: string;
    commentPreview: string;
    postId: string;
    authorUserId: string;
    actorUserId: string;
    commentId: string;
  }) {
    const postUrl = this.postPublicUrl(input.postId);
    return this.sendTemplatedEmail({
      type: 'post_comment_notification',
      templateKey: 'post_comment_notification',
      to: input.to.trim().toLowerCase(),
      variables: {
        authorName: input.authorName,
        actorName: input.actorName,
        postPreview: input.postPreview.slice(0, 200),
        commentPreview: input.commentPreview.slice(0, 300),
        postUrl,
        ctaUrl: postUrl,
        portalName: this.portalName(),
      },
      metadata: {
        postId: input.postId,
        commentId: input.commentId,
        authorUserId: input.authorUserId,
        actorUserId: input.actorUserId,
      },
    });
  }
}
