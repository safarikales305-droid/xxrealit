import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UserRole,
  WhatsAppMarketingCampaignStatus,
  WhatsAppMarketingCampaignType,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppDiagnosticService } from './whatsapp-diagnostic.service';
import {
  buildTemplateMessageRequest,
  formatTemplateLogLabel,
  normalizeTemplateLanguageCode,
  WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG,
} from './whatsapp-template-send.util';
import {
  portalBaseUrl,
  renderWhatsAppTemplate,
  roleLabel,
  type WhatsAppTemplateVars,
} from './whatsapp-message-template.util';
import { normalizeToE164, whatsAppDigits } from './whatsapp-phone.util';
import type {
  CreateWhatsAppMarketingCampaignDto,
  PreviewWhatsAppCampaignDto,
} from './dto/whatsapp-admin.dto';

type Recipient = {
  phone: string;
  userId?: string;
  name?: string;
  role?: UserRole;
  credit?: number;
};

@Injectable()
export class WhatsAppMarketingService {
  private readonly logger = new Logger(WhatsAppMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
    private readonly cloudApi: WhatsAppCloudApiService,
    private readonly metaTemplates: WhatsAppMetaTemplatesService,
    private readonly diagnostic: WhatsAppDiagnosticService,
  ) {}

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizePhone(raw: string): string | null {
    return normalizeToE164(raw);
  }

  private userPhone(u: {
    phone: string;
    whatsappPhone: string;
  }): string | null {
    const wa = u.whatsappPhone?.trim();
    if (wa) {
      const normalized = normalizeToE164(wa);
      if (normalized) return normalized;
    }
    const phone = u.phone?.trim();
    if (!phone) return null;
    return normalizeToE164(phone);
  }

  /**
   * Odeslání schválené WhatsApp šablony přes Cloud API (stejná cesta jako test).
   */
  private async sendTemplateMessage(
    phone: string,
    template: {
      templateName: string;
      languageCode: string;
      bodyParameters: string[];
    },
    logMeta: {
      campaignId?: string;
      campaignType?: WhatsAppMarketingCampaignType | null;
      recipientUserId?: string;
      recipientName?: string;
      isWelcome?: boolean;
      previewText?: string;
    },
  ): Promise<{ providerMessageId: string | null; phoneNumberId: string }> {
    await this.settings.reload();
    await this.diagnostic.assertPhoneBelongsToConfiguredWaba();

    const toDigits = whatsAppDigits(phone);
    const requestBody = buildTemplateMessageRequest(toDigits, {
      templateName: template.templateName,
      languageCode: template.languageCode,
      bodyParameters: template.bodyParameters,
    });

    const logLabel =
      logMeta.previewText?.trim() ||
      formatTemplateLogLabel(
        template.templateName,
        template.languageCode,
        template.bodyParameters,
      );

    const { providerMessageId, attempt } = await this.cloudApi.sendMessages(requestBody, {
      recipientPhone: phone,
      recipientName: logMeta.recipientName,
      recipientUserId: logMeta.recipientUserId,
      campaignId: logMeta.campaignId,
      campaignType: logMeta.campaignType ?? null,
      isWelcome: logMeta.isWelcome,
      logLabel,
    });

    return { providerMessageId, phoneNumberId: attempt.phoneNumberId };
  }

  private async resolveTemplateFields(input: {
    waMetaTemplateId?: string | null;
    waTemplateName?: string;
    waTemplateLanguage?: string;
    messageTemplate?: string;
  }): Promise<{
    waMetaTemplateId: string;
    waTemplateName: string;
    waTemplateLanguage: string;
  }> {
    const metaId = input.waMetaTemplateId?.trim();
    if (metaId) {
      const t = await this.metaTemplates.requireApprovedTemplate(metaId);
      return {
        waMetaTemplateId: metaId,
        waTemplateName: t.templateName,
        waTemplateLanguage: t.language,
      };
    }

    const templateName = input.waTemplateName?.trim();
    if (!templateName) {
      const hasCustomText = input.messageTemplate?.trim();
      throw new BadRequestException(
        hasCustomText
          ? WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG
          : 'Vyberte schválenou WhatsApp šablonu z Meta.',
      );
    }

    const lang = normalizeTemplateLanguageCode(input.waTemplateLanguage);
    const match = await this.prisma.whatsAppMetaTemplate.findFirst({
      where: {
        templateName,
        language: lang,
        status: 'APPROVED',
      },
    });
    if (match) {
      return {
        waMetaTemplateId: match.id,
        waTemplateName: match.templateName,
        waTemplateLanguage: match.language,
      };
    }

    const fallback = await this.prisma.whatsAppMetaTemplate.findFirst({
      where: { templateName, status: 'APPROVED' },
      orderBy: { syncedAt: 'desc' },
    });
    if (fallback) {
      return {
        waMetaTemplateId: fallback.id,
        waTemplateName: fallback.templateName,
        waTemplateLanguage: fallback.language,
      };
    }

    throw new BadRequestException(
      `Šablona „${templateName}“ není v synchronizovaném seznamu Meta — načtěte šablony.`,
    );
  }

  private renderTemplateBodyParameters(
    variableTemplates: string[],
    vars: WhatsAppTemplateVars,
  ): string[] {
    return variableTemplates.map((v) => renderWhatsAppTemplate(v, vars));
  }

  private varsForRecipient(r: Recipient): WhatsAppTemplateVars {
    if (r.userId) {
      return this.templateVarsForUser({
        name: r.name,
        role: r.role ?? UserRole.USER,
        creditBalance: r.credit,
      });
    }
    return {
      jmeno: r.name || 'uživateli',
      role: r.role ? roleLabel(r.role) : '',
      odkaz: portalBaseUrl(),
      kredit: String(r.credit ?? 0),
    };
  }

  private async campaignTemplateConfig(campaign: {
    waMetaTemplateId: string | null;
    waTemplateName: string;
    waTemplateLanguage: string;
    waTemplateVariables: string[];
    messageTemplate: string;
  }) {
    if (campaign.waMetaTemplateId) {
      const t = await this.metaTemplates.requireApprovedTemplate(campaign.waMetaTemplateId);
      return {
        templateName: t.templateName,
        languageCode: normalizeTemplateLanguageCode(t.language),
        variableTemplates: campaign.waTemplateVariables ?? [],
      };
    }

    const resolved = await this.resolveTemplateFields({
      waTemplateName: campaign.waTemplateName,
      waTemplateLanguage: campaign.waTemplateLanguage,
      messageTemplate: campaign.messageTemplate,
    });

    return {
      templateName: resolved.waTemplateName,
      languageCode: normalizeTemplateLanguageCode(resolved.waTemplateLanguage),
      variableTemplates: campaign.waTemplateVariables ?? [],
    };
  }

  private templateVarsForUser(u: {
    name?: string | null;
    role: UserRole;
    creditBalance?: number;
    realCreditBalance?: number;
    bonusCreditBalance?: number;
  }) {
    const credit =
      (u.realCreditBalance ?? 0) + (u.bonusCreditBalance ?? 0) + (u.creditBalance ?? 0);
    return {
      jmeno: u.name?.trim() || 'uživateli',
      role: roleLabel(u.role),
      odkaz: portalBaseUrl(),
      kredit: String(credit),
    };
  }

  async sendCloudToPhone(
    toPhone: string,
    message: string,
    meta?: {
      campaignId?: string;
      recipientUserId?: string;
      recipientName?: string;
      campaignType?: WhatsAppMarketingCampaignType | null;
      isWelcome?: boolean;
      waTemplateName?: string;
      waTemplateLanguage?: string;
      waTemplateVariables?: string[];
    },
  ): Promise<{ ok: boolean; error?: string; providerMessageId?: string }> {
    const templateName = meta?.waTemplateName?.trim();
    if (!templateName) {
      return {
        ok: false,
        error: message.trim()
          ? WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG
          : 'Chybí název WhatsApp šablony.',
      };
    }

    try {
      const bodyParameters = this.renderTemplateBodyParameters(
        meta?.waTemplateVariables ?? [],
        {
          jmeno: meta?.recipientName || 'uživateli',
          role: '',
          odkaz: portalBaseUrl(),
          kredit: '0',
        },
      );

      const { providerMessageId } = await this.sendTemplateMessage(
        toPhone,
        {
          templateName,
          languageCode: meta?.waTemplateLanguage ?? 'cs',
          bodyParameters,
        },
        {
          campaignId: meta?.campaignId,
          campaignType: meta?.campaignType ?? null,
          recipientUserId: meta?.recipientUserId,
          recipientName: meta?.recipientName,
          isWelcome: meta?.isWelcome,
          previewText: message.slice(0, 500),
        },
      );

      if (providerMessageId) {
        await this.prisma.whatsAppMessage.create({
          data: {
            userId: meta?.recipientUserId ?? null,
            direction: WhatsAppMessageDirection.OUTBOUND,
            fromPhone: '',
            toPhone,
            message,
            status: WhatsAppMessageStatus.SENT,
            providerMessageId,
          },
        });
      }

      return { ok: Boolean(providerMessageId), providerMessageId: providerMessageId ?? undefined };
    } catch (err: unknown) {
      const detail = this.extractMetaError(err);
      return { ok: false, error: detail.message };
    }
  }

  private extractMetaError(err: unknown): { message: string; code?: number; type?: string } {
    if (err instanceof BadRequestException) {
      const response = err.getResponse();
      if (response && typeof response === 'object') {
        const o = response as Record<string, unknown>;
        if (typeof o.message === 'string') {
          return {
            message: o.message,
            code: typeof o.code === 'number' ? o.code : undefined,
            type: typeof o.type === 'string' ? o.type : undefined,
          };
        }
        if (o.message && typeof o.message === 'object') {
          const m = o.message as { message?: string; code?: number; type?: string };
          return {
            message: m.message || 'Meta API chyba',
            code: m.code,
            type: m.type,
          };
        }
      }
    }
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      if (m && typeof m === 'object') {
        const o = m as { message?: string; code?: number; type?: string };
        return {
          message: o.message || 'Meta API chyba',
          code: o.code,
          type: o.type,
        };
      }
      if (typeof m === 'string') return { message: m };
    }
    return { message: err instanceof Error ? err.message : 'Neznámá chyba' };
  }

  async sendTestMessage(toPhone?: string) {
    const phone = this.normalizePhone(toPhone?.trim() || this.config.getTestPhone() || '');
    if (!phone) {
      throw new BadRequestException('Zadejte platné testovací telefonní číslo (+420…).');
    }

    const { providerMessageId, phoneNumberId } = await this.sendTemplateMessage(
      phone,
      {
        templateName: 'hello_world',
        languageCode: 'en_US',
        bodyParameters: [],
      },
      { previewText: 'test:hello_world' },
    );

    if (providerMessageId) {
      await this.prisma.whatsAppMessage.create({
        data: {
          direction: WhatsAppMessageDirection.OUTBOUND,
          fromPhone: '',
          toPhone: phone,
          message: 'template:hello_world',
          status: WhatsAppMessageStatus.SENT,
          providerMessageId,
        },
      });
    }

    return {
      ok: true,
      toPhone: phone,
      toDigits: whatsAppDigits(phone),
      phoneNumberId,
      providerMessageId,
    };
  }

  async getCampaignLogs(campaignId: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    const logs = await this.cloudApi.getCampaignLogs(campaignId);
    return { campaign, logs };
  }

  async getLastLog() {
    return this.cloudApi.getLastAdminLog();
  }

  async sendWelcomeOnRegister(user: Pick<User, 'id' | 'name' | 'phone' | 'role'>) {
    const stored = this.settings.getStoredSettings();
    if (!stored.welcomeEnabled || !this.config.isCloudApiConfigured()) return;

    const phone = this.normalizePhone(user.phone);
    if (!phone) return;

    const template =
      stored.welcomeTemplates[user.role] ||
      stored.welcomeTemplates.USER ||
      DEFAULT_WELCOME_FALLBACK;

    const message = renderWhatsAppTemplate(template, this.templateVarsForUser(user));

    await this.prisma.user.update({
      where: { id: user.id },
      data: { whatsappMarketingConsentAt: new Date() },
    });

    await this.sendCloudToPhone(phone, message, {
      recipientUserId: user.id,
      recipientName: user.name ?? undefined,
      campaignType: WhatsAppMarketingCampaignType.PORTAL_INVITE,
      isWelcome: true,
    });
  }

  async listCampaigns() {
    const rows = await this.prisma.whatsAppMarketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.campaignRow(r));
  }

  async getCampaign(id: string) {
    const row = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kampaň nenalezena.');
    return this.campaignRow(row);
  }

  async createCampaign(adminUserId: string, dto: CreateWhatsAppMarketingCampaignDto) {
    const resolved = await this.resolveTemplateFields({
      waMetaTemplateId: dto.waMetaTemplateId,
      waTemplateName: dto.waTemplateName,
      waTemplateLanguage: dto.waTemplateLanguage,
      messageTemplate: dto.messageTemplate,
    });

    const row = await this.prisma.whatsAppMarketingCampaign.create({
      data: {
        name: dto.name.trim(),
        campaignType: dto.campaignType,
        messageTemplate: dto.messageTemplate?.trim() ?? '',
        waMetaTemplateId: resolved.waMetaTemplateId,
        waTemplateName: resolved.waTemplateName,
        waTemplateLanguage: normalizeTemplateLanguageCode(resolved.waTemplateLanguage),
        waTemplateVariables: (dto.waTemplateVariables ?? [])
          .map((v) => v.trim())
          .filter(Boolean),
        targetRoles: dto.targetRoles ?? [],
        targetRegions: (dto.targetRegions ?? []).map((s) => s.trim()).filter(Boolean),
        targetCities: (dto.targetCities ?? []).map((s) => s.trim()).filter(Boolean),
        manualPhones: (dto.manualPhones ?? [])
          .map((p) => this.normalizePhone(p))
          .filter((p): p is string => Boolean(p)),
        createdByUserId: adminUserId,
      },
    });
    return this.campaignRow(row);
  }

  async updateCampaign(id: string, dto: Partial<CreateWhatsAppMarketingCampaignDto>) {
    const existing = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň právě odesílá — nelze upravit.');
    }

    let resolvedTemplate:
      | {
          waMetaTemplateId: string;
          waTemplateName: string;
          waTemplateLanguage: string;
        }
      | undefined;

    if (
      dto.waMetaTemplateId !== undefined ||
      dto.waTemplateName !== undefined ||
      dto.waTemplateLanguage !== undefined
    ) {
      resolvedTemplate = await this.resolveTemplateFields({
        waMetaTemplateId: dto.waMetaTemplateId ?? existing.waMetaTemplateId,
        waTemplateName: dto.waTemplateName ?? existing.waTemplateName,
        waTemplateLanguage: dto.waTemplateLanguage ?? existing.waTemplateLanguage,
        messageTemplate: dto.messageTemplate ?? existing.messageTemplate,
      });
    }

    const row = await this.prisma.whatsAppMarketingCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.campaignType !== undefined ? { campaignType: dto.campaignType } : {}),
        ...(dto.messageTemplate !== undefined
          ? { messageTemplate: dto.messageTemplate.trim() }
          : {}),
        ...(resolvedTemplate
          ? {
              waMetaTemplateId: resolvedTemplate.waMetaTemplateId,
              waTemplateName: resolvedTemplate.waTemplateName,
              waTemplateLanguage: normalizeTemplateLanguageCode(
                resolvedTemplate.waTemplateLanguage,
              ),
            }
          : {}),
        ...(dto.waTemplateName !== undefined && !resolvedTemplate
          ? { waTemplateName: dto.waTemplateName.trim() }
          : {}),
        ...(dto.waTemplateLanguage !== undefined && !resolvedTemplate
          ? {
              waTemplateLanguage: normalizeTemplateLanguageCode(dto.waTemplateLanguage),
            }
          : {}),
        ...(dto.waTemplateVariables !== undefined
          ? {
              waTemplateVariables: dto.waTemplateVariables
                .map((v) => v.trim())
                .filter(Boolean),
            }
          : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.targetRegions !== undefined
          ? {
              targetRegions: dto.targetRegions.map((s) => s.trim()).filter(Boolean),
            }
          : {}),
        ...(dto.targetCities !== undefined
          ? { targetCities: dto.targetCities.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(dto.manualPhones !== undefined
          ? {
              manualPhones: dto.manualPhones
                .map((p) => this.normalizePhone(p))
                .filter((p): p is string => Boolean(p)),
            }
          : {}),
      },
    });
    return this.campaignRow(row);
  }

  async deleteCampaign(id: string) {
    const existing = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň právě odesílá — nelze smazat.');
    }
    await this.prisma.whatsAppMarketingCampaign.delete({ where: { id } });
    return { ok: true };
  }

  async previewMessage(dto: PreviewWhatsAppCampaignDto) {
    const sampleRole = dto.sampleRole ?? UserRole.USER;
    const vars = {
      jmeno: dto.sampleName?.trim() || 'Jan Novák',
      role: roleLabel(sampleRole),
      odkaz: portalBaseUrl(),
      kredit: '1500',
    };
    const resolved = await this.resolveTemplateFields({
      waMetaTemplateId: dto.waMetaTemplateId,
      waTemplateName: dto.waTemplateName,
      waTemplateLanguage: dto.waTemplateLanguage,
      messageTemplate: dto.messageTemplate,
    });
    const bodyParams = this.renderTemplateBodyParameters(dto.waTemplateVariables ?? [], vars);
    const textPreview = dto.messageTemplate?.trim()
      ? renderWhatsAppTemplate(dto.messageTemplate, vars)
      : null;
    const metaTemplate = await this.metaTemplates.getById(resolved.waMetaTemplateId);
    return {
      preview: textPreview ?? metaTemplate?.bodyText ?? null,
      templateName: resolved.waTemplateName,
      templateLanguage: normalizeTemplateLanguageCode(resolved.waTemplateLanguage),
      templateVariablesRendered: bodyParams,
      templateBody: metaTemplate?.bodyText ?? null,
      templateCategory: metaTemplate?.category ?? null,
    };
  }

  async testCampaign(campaignId: string, toPhone?: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const tpl = await this.campaignTemplateConfig(campaign);

    const phone = this.normalizePhone(toPhone?.trim() || this.config.getTestPhone() || '');
    if (!phone) {
      throw new BadRequestException('Zadejte platné testovací telefonní číslo.');
    }

    const vars = this.templateVarsForUser({
      name: 'Test Uživatel',
      role: campaign.targetRoles[0] ?? UserRole.USER,
      creditBalance: 1500,
      realCreditBalance: 1000,
      bonusCreditBalance: 500,
    });
    const bodyParameters = this.renderTemplateBodyParameters(tpl.variableTemplates, vars);
    const previewText = campaign.messageTemplate?.trim()
      ? renderWhatsAppTemplate(campaign.messageTemplate, vars)
      : formatTemplateLogLabel(tpl.templateName, tpl.languageCode, bodyParameters);

    const { providerMessageId } = await this.sendTemplateMessage(
      phone,
      {
        templateName: tpl.templateName,
        languageCode: tpl.languageCode,
        bodyParameters,
      },
      {
        campaignId: campaign.id,
        recipientName: 'Test',
        campaignType: campaign.campaignType,
        previewText,
      },
    );

    if (!providerMessageId) {
      throw new BadRequestException('Meta nevrátilo ID zprávy — odeslání selhalo.');
    }

    return {
      ok: true,
      toPhone: phone,
      preview: previewText,
      providerMessageId,
      templateName: tpl.templateName,
      templateLanguage: tpl.languageCode,
    };
  }

  private hasPortalFilters(campaign: {
    targetRoles: UserRole[];
    targetRegions: string[];
    targetCities: string[];
  }): boolean {
    return (
      campaign.targetRoles.length > 0 ||
      campaign.targetRegions.length > 0 ||
      campaign.targetCities.length > 0
    );
  }

  private async resolveRecipients(campaign: {
    targetRoles: UserRole[];
    targetRegions: string[];
    targetCities: string[];
    manualPhones: string[];
  }): Promise<Recipient[]> {
    const recipients: Recipient[] = [];
    const seen = new Set<string>();

    const addRecipient = (r: Recipient) => {
      const key = whatsAppDigits(r.phone);
      if (seen.has(key)) return;
      seen.add(key);
      recipients.push(r);
    };

    if (this.hasPortalFilters(campaign)) {
      const where: Record<string, unknown> = {
        whatsappMarketingOptOut: false,
        role: { not: UserRole.ADMIN },
      };

      if (campaign.targetRoles.length > 0) {
        where.role = { in: campaign.targetRoles };
      }

      const regionFilters = campaign.targetRegions
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
      const cityFilters = campaign.targetCities
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);

      const users = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          role: true,
          phone: true,
          whatsappPhone: true,
          city: true,
          brokerRegionLabel: true,
          brokerPreferredRegions: true,
          creditBalance: true,
          realCreditBalance: true,
          bonusCreditBalance: true,
        },
        take: 5000,
      });

      this.logger.log(
        `[Campaign Recipients] portal users loaded=${users.length} roles=${campaign.targetRoles.join(',') || 'all'} regions=${campaign.targetRegions.join(',')} cities=${campaign.targetCities.join(',')}`,
      );

      for (const u of users) {
        if (regionFilters.length > 0) {
          const regionLabel = u.brokerRegionLabel?.trim().toLowerCase() || '';
          const city = u.city?.trim().toLowerCase() || '';
          const preferred = u.brokerPreferredRegions.map((s) => s.trim().toLowerCase());
          const matchesRegion = regionFilters.some(
            (r) =>
              regionLabel.includes(r) ||
              city.includes(r) ||
              preferred.some((p) => p.includes(r) || r.includes(p)),
          );
          if (!matchesRegion) continue;
        }

        if (cityFilters.length > 0) {
          const city = u.city?.trim().toLowerCase() || '';
          if (!cityFilters.some((c) => city.includes(c) || c.includes(city))) continue;
        }

        const phone = this.userPhone(u);
        if (!phone) continue;

        addRecipient({
          phone,
          userId: u.id,
          name: u.name ?? undefined,
          role: u.role,
          credit:
            (u.realCreditBalance ?? 0) +
            (u.bonusCreditBalance ?? 0) +
            (u.creditBalance ?? 0),
        });
      }
    }

    for (const raw of campaign.manualPhones) {
      const phone = this.normalizePhone(raw);
      if (!phone) {
        this.logger.warn(`[Campaign Recipients] invalid manual phone skipped: ${raw}`);
        continue;
      }
      addRecipient({ phone });
    }

    this.logger.log(
      `[Campaign Recipients] total=${recipients.length} phones=${recipients.map((r) => r.phone).join(', ')}`,
    );

    return recipients;
  }

  async runCampaign(campaignId: string) {
    await this.settings.reload();

    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    if (campaign.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň už probíhá.');
    }
    if (!this.config.isCloudApiConfigured()) {
      throw new ServiceUnavailableException('WhatsApp Cloud API není připraveno.');
    }

    const tpl = await this.campaignTemplateConfig(campaign);

    const phoneNumberId = this.config.getPhoneNumberId();
    const tokenSource = this.settings.getStoredSettings().accessToken.trim()
      ? 'database'
      : 'env';

    this.logger.log(
      `[Campaign Run] start campaignId=${campaignId} phoneNumberId=${phoneNumberId} tokenSource=${tokenSource}`,
    );

    const recipients = await this.resolveRecipients(campaign);

    this.logger.log(
      `[Campaign Run] campaignId=${campaignId} recipientCount=${recipients.length}`,
    );

    if (recipients.length === 0) {
      throw new BadRequestException(
        'Kampaň nemá žádné příjemce. Zkontrolujte ruční čísla, CSV import nebo filtry uživatelů portálu.',
      );
    }

    await this.prisma.whatsAppMarketingCampaign.update({
      where: { id: campaignId },
      data: { status: WhatsAppMarketingCampaignStatus.SENDING },
    });

    const batchSize = this.config.getBatchSize();
    const batchDelayMs = this.config.getBatchDelayMs();

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const sendErrors: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]!;
      const vars = this.varsForRecipient(r);
      const bodyParameters = this.renderTemplateBodyParameters(tpl.variableTemplates, vars);
      const previewText = campaign.messageTemplate?.trim()
        ? renderWhatsAppTemplate(campaign.messageTemplate, vars)
        : formatTemplateLogLabel(tpl.templateName, tpl.languageCode, bodyParameters);

      const dup = await this.prisma.whatsAppMarketingCampaignLog.findFirst({
        where: {
          recipientPhone: r.phone,
          campaignId,
          status: WhatsAppMessageStatus.SENT,
        },
        select: { id: true },
      });
      if (dup) {
        skipped += 1;
        this.logger.log(
          `[Campaign Run] skip duplicate campaignId=${campaignId} phone=${r.phone}`,
        );
        continue;
      }

      try {
        const { providerMessageId } = await this.sendTemplateMessage(
          r.phone,
          {
            templateName: tpl.templateName,
            languageCode: tpl.languageCode,
            bodyParameters,
          },
          {
            campaignId: campaign.id,
            campaignType: campaign.campaignType,
            recipientUserId: r.userId,
            recipientName: r.name,
            previewText,
          },
        );

        if (!providerMessageId) {
          failed += 1;
          sendErrors.push(`${r.phone}: Meta nevrátilo ID zprávy.`);
          continue;
        }

        sent += 1;
        this.logger.log(
          `[Campaign Run] sent campaignId=${campaignId} phone=${r.phone} template=${tpl.templateName} messageId=${providerMessageId}`,
        );

        await this.prisma.whatsAppMessage.create({
          data: {
            userId: r.userId ?? null,
            direction: WhatsAppMessageDirection.OUTBOUND,
            fromPhone: '',
            toPhone: r.phone,
            message: previewText.slice(0, 4000),
            status: WhatsAppMessageStatus.SENT,
            providerMessageId,
          },
        });

        if (r.userId) {
          await this.prisma.user.updateMany({
            where: { id: r.userId, whatsappMarketingConsentAt: null },
            data: { whatsappMarketingConsentAt: new Date() },
          });
        }
      } catch (err: unknown) {
        failed += 1;
        const detail = this.extractMetaError(err);
        const errText = `${r.phone}: ${detail.message}${detail.code != null ? ` (code ${detail.code})` : ''}${detail.type ? ` [${detail.type}]` : ''}`;
        sendErrors.push(errText);
        this.logger.error(
          `[Campaign Run] failed campaignId=${campaignId} phone=${r.phone} error=${detail.message} code=${detail.code ?? '—'} type=${detail.type ?? '—'}`,
        );
      }

      if ((i + 1) % batchSize === 0 && i + 1 < recipients.length) {
        await this.sleep(batchDelayMs);
      }
    }

    const status =
      sent === 0
        ? WhatsAppMarketingCampaignStatus.FAILED
        : WhatsAppMarketingCampaignStatus.SENT;

    this.logger.log(
      `[Campaign Run] done campaignId=${campaignId} sent=${sent} failed=${failed} skipped=${skipped} status=${status}`,
    );

    const updated = await this.prisma.whatsAppMarketingCampaign.update({
      where: { id: campaignId },
      data: {
        status,
        sentAt: sent > 0 ? new Date() : null,
        recipientCount: recipients.length,
        sentCount: sent,
        failedCount: failed,
        skippedCount: skipped,
      },
    });

    const row = this.campaignRow(updated);
    return {
      ...row,
      statusLabel: row.status === 'SENDING' ? 'RUNNING' : row.status,
      recipientPhones: recipients.map((r) => r.phone),
      phoneNumberId,
      tokenSource,
      errors: sendErrors,
    };
  }

  async listHistory(limit = 100, campaignId?: string) {
    const rows = await this.prisma.whatsAppMarketingCampaignLog.findMany({
      where: campaignId ? { campaignId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, limit),
      include: {
        recipient: { select: { name: true, email: true } },
        campaign: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      recipientName: r.recipientName || r.recipient?.name || null,
      recipientPhone: r.recipientPhone,
      campaignType: r.campaignType,
      campaignName: r.campaign?.name ?? (r.isWelcome ? 'Uvítací zpráva' : null),
      status: r.status,
      errorMessage: r.errorMessage,
      providerMessageId: r.providerMessageId,
      message: r.message,
      isWelcome: r.isWelcome,
      campaignId: r.campaignId,
    }));
  }

  private campaignRow(r: {
    id: string;
    name: string;
    campaignType: WhatsAppMarketingCampaignType;
    messageTemplate: string;
    waTemplateName: string;
    waMetaTemplateId: string | null;
    waTemplateLanguage: string;
    waTemplateVariables: string[];
    targetRoles: UserRole[];
    targetRegions: string[];
    targetCities: string[];
    manualPhones: string[];
    status: WhatsAppMarketingCampaignStatus;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    createdAt: Date;
    updatedAt: Date;
    sentAt: Date | null;
  }) {
    return {
      id: r.id,
      name: r.name,
      campaignType: r.campaignType,
      messageTemplate: r.messageTemplate,
      waTemplateName: r.waTemplateName,
      waMetaTemplateId: r.waMetaTemplateId,
      waTemplateLanguage: r.waTemplateLanguage,
      waTemplateVariables: r.waTemplateVariables,
      targetRoles: r.targetRoles,
      targetRegions: r.targetRegions,
      targetCities: r.targetCities,
      manualPhones: r.manualPhones,
      status: r.status,
      recipientCount: r.recipientCount,
      sentCount: r.sentCount,
      failedCount: r.failedCount,
      skippedCount: r.skippedCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    };
  }
}

const DEFAULT_WELCOME_FALLBACK =
  'Vítejte na XXrealit, {jmeno}! Váš účet je připraven. {odkaz}';
