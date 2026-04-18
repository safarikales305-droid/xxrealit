import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCampaignStatus, EmailLogStatus, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';

type TemplateInput = {
  key: string;
  name: string;
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

const DEFAULT_TEMPLATES: TemplateInput[] = [
  {
    key: 'welcome_email',
    name: 'Uvítací e-mail',
    subject: 'Vítejte na xxrealit.cz',
    htmlContent:
      '<h1>Vítejte na xxrealit.cz</h1><p>Dobrý den {{userName}}, váš účet je aktivní.</p><p><a href="{{ctaUrl}}">Dokončit profil</a></p>',
    textContent:
      'Vítejte na xxrealit.cz\n\nDobrý den {{userName}}, váš účet je aktivní.\n\nDokončit profil: {{ctaUrl}}',
  },
  {
    key: 'password_reset',
    name: 'Reset hesla',
    subject: 'Obnova hesla na xxrealit.cz',
    htmlContent:
      '<h1>Obnova hesla</h1><p>Klikněte na tlačítko pro změnu hesla.</p><p><a href="{{resetUrl}}">Změnit heslo</a></p><p>Platnost odkazu je 60 minut.</p>',
    textContent:
      'Obnova hesla\n\nKlikněte na odkaz: {{resetUrl}}\n\nPlatnost odkazu je 60 minut.',
  },
  {
    key: 'listing_shared',
    name: 'Sdílení inzerátu',
    subject: 'Byl vám sdílen inzerát z xxrealit.cz',
    htmlContent:
      '<h1>Byl vám sdílen inzerát z xxrealit.cz</h1><p><strong>{{listingTitle}}</strong></p><p>{{listingLocation}} · {{listingPrice}}</p><p>{{senderMessage}}</p><p><a href="{{listingUrl}}">Zobrazit inzerát</a></p>',
    textContent:
      'Byl vám sdílen inzerát z xxrealit.cz\n\n{{listingTitle}}\n{{listingLocation}} · {{listingPrice}}\n\n{{senderMessage}}\n\nZobrazit inzerát: {{listingUrl}}',
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    subject: '{{subject}}',
    htmlContent: '<h1>{{title}}</h1><div>{{contentHtml}}</div>',
    textContent: '{{title}}\n\n{{contentText}}',
  },
  {
    key: 'promo_campaign',
    name: 'Promo kampaň',
    subject: '{{subject}}',
    htmlContent: '<h1>{{title}}</h1><div>{{contentHtml}}</div><p><a href="{{ctaUrl}}">Zjistit více</a></p>',
    textContent: '{{title}}\n\n{{contentText}}\n\n{{ctaUrl}}',
  },
];

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
    const appUrl = this.config.get<string>('APP_URL')?.trim() ?? '';
    const frontendUrl = this.config.get<string>('NEXT_PUBLIC_APP_URL')?.trim() ?? '';
    const candidate = (appUrl || frontendUrl).replace(/\/+$/, '');
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim();
    const isProduction = nodeEnv.toLowerCase() === 'production';
    const productionFallback = 'https://www.xxrealit.cz';
    const localhostLike = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

    if (isProduction) {
      if (!candidate) {
        this.logger.error(
          `APP_URL is missing in production email flow. Falling back to ${productionFallback}.`,
        );
        return productionFallback;
      }
      if (localhostLike.test(candidate)) {
        this.logger.error(
          `APP_URL resolves to localhost in production email flow (${candidate}). Falling back to ${productionFallback}.`,
        );
        return productionFallback;
      }
      return candidate;
    }

    return candidate || 'http://localhost:3000';
  }

  private normalizePublicUrl(url: string): string {
    const value = String(url ?? '').trim();
    if (!value) return this.appUrl();
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim();
    const isProduction = nodeEnv.toLowerCase() === 'production';
    const localhostLike = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;
    if (isProduction && localhostLike.test(value)) {
      const fixed = value.replace(localhostLike, this.appUrl());
      this.logger.error(`Localhost URL detected in production email payload. Replaced with ${fixed}`);
      return fixed;
    }
    return value;
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
    for (const t of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.emailTemplate.findUnique({ where: { key: t.key } });
      if (!existing) {
        await this.prisma.emailTemplate.create({ data: t });
      }
    }
  }

  async listLogs(limit = 200) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(1000, limit)),
    });
  }

  async listTemplates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } });
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
      },
      metadata: { resetUrl: safeResetUrl },
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
      },
      metadata: {
        propertyId: property.id,
        senderEmail: input.senderEmail ?? null,
        senderName: input.senderName ?? null,
      },
    });
  }
}
