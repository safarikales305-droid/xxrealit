import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSignatureType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_EMAIL_SETTINGS } from './email-settings.defaults';

export type EmailSenderInfo = { name: string; email: string };

@Injectable()
export class EmailSettingsService implements OnModuleInit {
  private cache: Awaited<ReturnType<EmailSettingsService['loadSettings']>> | null = null;
  private cacheAt = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
    await this.ensureDefaultSignatures();
  }

  private async loadSettings() {
    return this.prisma.emailSettings.upsert({
      where: { id: 'default' },
      create: { ...DEFAULT_EMAIL_SETTINGS },
      update: {},
    });
  }

  private async getSettingsCached() {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.cacheTtlMs) return this.cache;
    this.cache = await this.loadSettings();
    this.cacheAt = now;
    return this.cache;
  }

  invalidateCache() {
    this.cache = null;
    this.cacheAt = 0;
  }

  async ensureDefaults() {
    await this.loadSettings();
  }

  async ensureDefaultSignatures() {
    const sales = await this.prisma.emailSignature.findFirst({
      where: { type: EmailSignatureType.SALES_TEAM, active: true },
    });
    if (!sales) {
      await this.prisma.emailSignature.create({
        data: {
          id: 'seed-sig-sales',
          name: 'Obchodní tým',
          type: EmailSignatureType.SALES_TEAM,
          personName: 'Tým XXREALIT',
          team: 'Obchodní tým',
          company: 'XXREALIT',
          email: DEFAULT_EMAIL_SETTINGS.salesSenderEmail,
          html: '<p>S pozdravem<br/><strong>Tým XXREALIT</strong><br/>obchod@xxrealit.cz</p>',
          plainText: 'S pozdravem\nTým XXREALIT\nobchod@xxrealit.cz',
        },
      });
    }
  }

  async getSettings() {
    return this.getSettingsCached();
  }

  async getDefaultSender(): Promise<EmailSenderInfo> {
    const s = await this.getSettingsCached();
    return {
      name: s.defaultSenderName,
      email: s.defaultSenderEmail,
    };
  }

  async getSalesSender(): Promise<EmailSenderInfo> {
    const s = await this.getSettingsCached();
    return {
      name: s.salesSenderName,
      email: s.salesSenderEmail,
    };
  }

  async getSupportEmail(): Promise<string> {
    const s = await this.getSettingsCached();
    return (
      s.supportEmail?.trim() ||
      this.config.get<string>('SUPPORT_EMAIL')?.trim() ||
      DEFAULT_EMAIL_SETTINGS.supportEmail
    );
  }

  async getFooterContactEmail(): Promise<string> {
    const s = await this.getSettingsCached();
    return s.footerContactEmail?.trim() || DEFAULT_EMAIL_SETTINGS.footerContactEmail;
  }

  async getAiSalesReplyTo(aiSalesReplyTo?: string | null): Promise<string> {
    if (aiSalesReplyTo?.trim()) return aiSalesReplyTo.trim().toLowerCase();
    const aiSettings = await this.prisma.aiSalesSettings.findUnique({ where: { id: 'default' } });
    if (aiSettings?.replyToEmail?.trim()) return aiSettings.replyToEmail.trim().toLowerCase();
    const s = await this.getSettingsCached();
    if (s.salesReplyToEmail?.trim()) return s.salesReplyToEmail.trim().toLowerCase();
    if (s.defaultReplyToEmail?.trim()) return s.defaultReplyToEmail.trim().toLowerCase();
    return (
      this.config.get<string>('DEFAULT_REPLY_TO')?.trim() ||
      DEFAULT_EMAIL_SETTINGS.salesReplyToEmail
    );
  }

  async resolveReplyTo(options?: {
    messageReplyTo?: string | null;
    moduleReplyTo?: string | null;
  }): Promise<string> {
    if (options?.messageReplyTo?.trim()) return options.messageReplyTo.trim().toLowerCase();
    if (options?.moduleReplyTo?.trim()) return options.moduleReplyTo.trim().toLowerCase();
    return this.getAiSalesReplyTo();
  }

  formatFrom(sender: EmailSenderInfo): string {
    return `${sender.name} <${sender.email}>`;
  }

  async getSignature(type: EmailSignatureType = EmailSignatureType.SALES_TEAM) {
    const row = await this.prisma.emailSignature.findFirst({
      where: { type, active: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (row) return row;
    return this.prisma.emailSignature.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSignatureById(id?: string | null) {
    if (!id) return this.getSignature(EmailSignatureType.SALES_TEAM);
    return this.prisma.emailSignature.findUnique({ where: { id } });
  }

  async getTemplateVariables(): Promise<Record<string, string>> {
    const s = await this.getSettingsCached();
    const footer = await this.getFooterContactEmail();
    const support = await this.getSupportEmail();
    const sales = await this.getSalesSender();
    return {
      footerContactEmail: footer,
      supportEmail: support,
      salesEmail: sales.email,
      salesSenderName: sales.name,
      portalName: 'XXrealit.cz',
    };
  }

  buildOptOutFooterText(footerEmail?: string): string {
    const email = footerEmail ?? '';
    return `\n\n---\nPokud si nepřejete dostávat další obchodní sdělení, odpovězte prosím „NEZÁJEM“ nebo nás kontaktujte na ${email}.`;
  }

  buildOptOutFooterHtml(footerEmail?: string): string {
    const email = footerEmail ?? '';
    return `Pokud si nepřejete dostávat další obchodní sdělení, odpovězte „NEZÁJEM“ nebo nás kontaktujte na ${email}.`;
  }

  getProviderInfo() {
    const apiKeySet = Boolean(this.config.get<string>('RESEND_API_KEY')?.trim());
    return {
      provider: 'RESEND',
      apiKeyConfigured: apiKeySet,
      domainVerified: null as boolean | null,
    };
  }

  async updateSettings(
    data: Prisma.EmailSettingsUpdateInput & {
      defaultSenderEmail?: string;
      salesSenderEmail?: string;
      salesReplyToEmail?: string;
      footerContactEmail?: string;
    },
    meta?: { userId?: string; reason?: string; ipAddress?: string },
  ) {
    const current = await this.loadSettings();
    const updated = await this.prisma.emailSettings.update({
      where: { id: 'default' },
      data: {
        ...data,
        updatedById: meta?.userId ?? current.updatedById,
      },
    });

    const auditFields = [
      'defaultSenderEmail',
      'defaultSenderName',
      'defaultReplyToEmail',
      'salesSenderEmail',
      'salesSenderName',
      'salesReplyToEmail',
      'supportEmail',
      'footerContactEmail',
      'billingEmail',
      'leadEmail',
      'registrationEmail',
      'systemNotificationEmail',
      'contactFormEmail',
    ] as const;

    for (const field of auditFields) {
      const oldVal = String((current as Record<string, unknown>)[field] ?? '');
      const newVal = String((updated as Record<string, unknown>)[field] ?? '');
      if (oldVal !== newVal) {
        await this.prisma.emailSettingsAuditLog.create({
          data: {
            field,
            oldValue: oldVal,
            newValue: newVal,
            reason: meta?.reason ?? null,
            changedById: meta?.userId ?? null,
            ipAddress: meta?.ipAddress ?? null,
          },
        });
      }
    }

    this.invalidateCache();
    return updated;
  }
}
