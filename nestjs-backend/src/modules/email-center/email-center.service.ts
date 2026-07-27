import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailInboundStatus, EmailLogStatus, EmailSenderPurpose, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { EmailSettingsService } from '../emails/email-settings.service';
import { extractDomain, validateEmailAddress } from '../emails/email-validation.util';

@Injectable()
export class EmailCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSettings: EmailSettingsService,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  async getSettingsOverview() {
    const settings = await this.emailSettings.getSettings();
    const provider = this.emailSettings.getProviderInfo();
    const senders = await this.prisma.emailSenderIdentity.count({ where: { active: true } });
    const signatures = await this.prisma.emailSignature.count({ where: { active: true } });
    const templates = await this.prisma.emailTemplate.count({ where: { isActive: true } });
    const logsToday = await this.prisma.emailLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    const inboundNew = await this.prisma.emailInboundReply.count({
      where: { status: EmailInboundStatus.NEW },
    });
    return {
      settings,
      provider,
      counts: { senders, signatures, templates, logsToday, inboundNew },
    };
  }

  async listSenders() {
    const rows = await this.prisma.emailSenderIdentity.findMany({ orderBy: { email: 'asc' } });
    return rows.map((r) => ({
      ...r,
      providerInfo: this.emailSettings.getProviderInfo(),
      usage: this.senderUsageLabel(r.purpose),
    }));
  }

  private senderUsageLabel(purpose: EmailSenderPurpose): string {
    const map: Record<EmailSenderPurpose, string> = {
      DEFAULT: 'Výchozí systémové e-maily',
      SALES: 'AI obchodník, obchodní nabídky',
      SUPPORT: 'Podpora, tickety',
      BILLING: 'Fakturace',
      SYSTEM: 'Systémové notifikace',
      REGISTRATION: 'Registrace',
      LEADS: 'Leady z inzerátů',
      CONTACT_FORM: 'Kontaktní formuláře',
    };
    return map[purpose] ?? purpose;
  }

  async createSender(dto: {
    name: string;
    email: string;
    purpose?: EmailSenderPurpose;
    active?: boolean;
  }) {
    const v = validateEmailAddress(dto.email);
    if (!v.ok) throw new BadRequestException(v.error);
    return this.prisma.emailSenderIdentity.create({
      data: {
        name: dto.name.trim(),
        email: v.email,
        domain: extractDomain(v.email),
        purpose: dto.purpose ?? EmailSenderPurpose.DEFAULT,
        active: dto.active ?? true,
        provider: 'resend',
      },
    });
  }

  async updateSender(
    id: string,
    dto: Partial<{
      name: string;
      email: string;
      purpose: EmailSenderPurpose;
      active: boolean;
      verified: boolean;
    }>,
  ) {
    const data: Prisma.EmailSenderIdentityUpdateInput = {};
    if (typeof dto.name === 'string') data.name = dto.name.trim();
    if (typeof dto.email === 'string') {
      const v = validateEmailAddress(dto.email);
      if (!v.ok) throw new BadRequestException(v.error);
      data.email = v.email;
      data.domain = extractDomain(v.email);
    }
    if (dto.purpose) data.purpose = dto.purpose;
    if (typeof dto.active === 'boolean') data.active = dto.active;
    if (typeof dto.verified === 'boolean') data.verified = dto.verified;
    return this.prisma.emailSenderIdentity.update({ where: { id }, data });
  }

  async testSender(id: string, toEmail: string) {
    const sender = await this.prisma.emailSenderIdentity.findUnique({ where: { id } });
    if (!sender) throw new BadRequestException('Odesílatel nenalezen.');
    const v = validateEmailAddress(toEmail);
    if (!v.ok) throw new BadRequestException(v.error);
    const result = await this.emails.sendRawEmail({
      type: 'email_center_sender_test',
      to: v.email,
      subject: `[TEST] XXREALIT – ověření odesílatele ${sender.email}`,
      html: `<p>Test odesílatele <strong>${sender.name}</strong> &lt;${sender.email}&gt;</p>`,
      text: `Test odesílatele ${sender.name} <${sender.email}>`,
      from: `${sender.name} <${sender.email}>`,
      metadata: { senderId: id },
    });
    await this.prisma.emailSenderIdentity.update({
      where: { id },
      data: { lastTestAt: new Date(), lastTestSuccess: true },
    });
    return result;
  }

  async listSignatures() {
    return this.prisma.emailSignature.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  }

  async createSignature(dto: Prisma.EmailSignatureCreateInput) {
    return this.prisma.emailSignature.create({ data: dto });
  }

  async updateSignature(id: string, dto: Prisma.EmailSignatureUpdateInput) {
    return this.prisma.emailSignature.update({ where: { id }, data: dto });
  }

  async deleteSignature(id: string) {
    await this.prisma.emailSignature.delete({ where: { id } });
    return { success: true };
  }

  async listTemplates() {
    return this.emails.listTemplates();
  }

  async getTemplate(id: string) {
    return this.prisma.emailTemplate.findUnique({ where: { id } });
  }

  async updateTemplate(id: string, dto: Parameters<EmailsService['updateTemplate']>[1]) {
    return this.emails.updateTemplate(id, dto);
  }

  async listLogs(limit = 200) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(1000, Math.max(1, limit)),
    });
  }

  async listInbound(limit = 100) {
    return this.prisma.emailInboundReply.findMany({
      orderBy: { receivedAt: 'desc' },
      take: Math.min(500, Math.max(1, limit)),
    });
  }

  async getAiSalesEmailConfig() {
    const settings = await this.emailSettings.getSettings();
    const ai = await this.prisma.aiSalesSettings.findUnique({ where: { id: 'default' } });
    const salesSender = await this.emailSettings.getSalesSender();
    const replyTo = await this.emailSettings.getAiSalesReplyTo();
    const footer = await this.emailSettings.getFooterContactEmail();
    const signature = await this.emailSettings.getSignature();
    return {
      sender: salesSender,
      replyTo,
      footerContactEmail: footer,
      signature,
      defaultCtaUrl: ai?.defaultCtaUrl ?? 'https://www.xxrealit.cz',
      testModeEnabled: ai?.testModeEnabled ?? true,
      realSendingEnabled: ai?.realSendingEnabled ?? false,
      requireManualApproval: ai?.requireManualApproval ?? true,
      maxRecipientsPerOffer: ai?.maxRecipientsPerOffer ?? 5,
      dailyFirstOutreachLimit: ai?.dailyFirstOutreachLimit ?? 20,
    };
  }

  async getDiagnostics() {
    const provider = this.emailSettings.getProviderInfo();
    const settings = await this.emailSettings.getSettings();
    const recentFailed = await this.prisma.emailLog.findMany({
      where: { status: EmailLogStatus.failed },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      provider,
      settingsActive: settings.active,
      resendFromEnv: Boolean(this.config.get<string>('RESEND_FROM_EMAIL')?.trim()),
      recentFailures: recentFailed,
    };
  }

  async sendCenterTest(input: {
    toEmail: string;
    senderType?: 'default' | 'sales';
    replyTo?: string;
    signatureId?: string;
    templateId?: string;
  }) {
    const v = validateEmailAddress(input.toEmail);
    if (!v.ok) throw new BadRequestException(v.error);

    const sender =
      input.senderType === 'default'
        ? await this.emailSettings.getDefaultSender()
        : await this.emailSettings.getSalesSender();
    const replyTo = await this.emailSettings.resolveReplyTo({
      messageReplyTo: input.replyTo,
    });
    const footer = await this.emailSettings.getFooterContactEmail();
    const signature = await this.emailSettings.getSignatureById(input.signatureId);
    const vars = await this.emailSettings.getTemplateVariables();

    let subject = '[TEST] XXREALIT – ověření e-mailového centra';
    let html = `
      <p>Toto je testovací e-mail z E-mail centra XXREALIT.</p>
      <p><strong>Odesílatel:</strong> ${sender.name} &lt;${sender.email}&gt;</p>
      <p><strong>Reply-To:</strong> ${replyTo}</p>
      <p><strong>Patička:</strong> ${footer}</p>
      <hr/>
      ${signature?.html ?? '<p>Tým XXREALIT</p>'}
      <p style="font-size:11px;color:#9ca3af;margin-top:24px;">
        ${this.emailSettings.buildOptOutFooterHtml(footer)}
      </p>
    `;
    let text = `Test E-mail centra.\nReply-To: ${replyTo}\nPatička: ${footer}`;

    if (input.templateId) {
      const template = await this.prisma.emailTemplate.findUnique({ where: { id: input.templateId } });
      if (template) {
        subject = `[TEST] ${template.subject}`;
        html = template.htmlContent.replace(/\{\{\s*footerContactEmail\s*\}\}/g, footer);
        text = template.textContent.replace(/\{\{\s*footerContactEmail\s*\}\}/g, footer);
      }
    }

    const started = Date.now();
    const result = await this.emails.sendRawEmail({
      type: 'email_center_test',
      to: v.email,
      subject,
      html,
      text,
      from: this.emailSettings.formatFrom(sender),
      replyTo,
      senderName: sender.name,
      senderEmail: sender.email,
      metadata: { test: true, vars },
    });

    return {
      success: true,
      sender,
      replyTo,
      footerContactEmail: footer,
      provider: 'resend',
      providerMessageId: result.providerMessageId,
      status: 'sent',
      durationMs: Date.now() - started,
      logId: result.logId,
    };
  }

  async listApprovedReplyToOptions() {
    const settings = await this.emailSettings.getSettings();
    const senders = await this.prisma.emailSenderIdentity.findMany({
      where: { active: true },
      select: { email: true, name: true, purpose: true },
    });
    const options = [
      { value: 'default', label: 'Výchozí Reply-To AI obchodníka', email: settings.salesReplyToEmail },
      { value: 'sales', label: 'Obchodní e-mail', email: settings.salesSenderEmail },
      { value: 'support', label: 'Podpora', email: settings.supportEmail },
      ...senders
        .filter((s) => s.email !== settings.salesReplyToEmail)
        .map((s) => ({ value: s.email, label: s.name, email: s.email })),
    ];
    return options.filter(
      (o, i, arr) => arr.findIndex((x) => x.email === o.email) === i,
    );
  }
}
