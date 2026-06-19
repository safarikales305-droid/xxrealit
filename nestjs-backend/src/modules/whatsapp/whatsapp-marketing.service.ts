import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join, basename } from 'node:path';
import {
  UserRole,
  WhatsAppMarketingCampaignStatus,
  WhatsAppMarketingCampaignType,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getUploadsPath } from '../../lib/uploads-path';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppDiagnosticService } from './whatsapp-diagnostic.service';
import {
  buildTemplateMessageRequest,
  buildTemplateBodyParameters,
  assertTemplatePayload,
  assertImageHeaderInPayload,
  assertBodyParametersCount,
  extractHeaderImageMediaIdFromPayload,
  payloadUsesHeaderImageLink,
  formatTemplateLogLabel,
  metaTemplateLanguageCode,
  normalizeTemplateLanguageCode,
  WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG,
  WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG,
  formatMetaApiError,
  WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG,
} from './whatsapp-template-send.util';
import {
  extractTemplatePartsFromRaw,
  resolveTemplateRequirementsFromRaw,
  describeTemplateComponentsForLog,
  normalizeUrlButtonParameterInput,
  type WhatsAppTemplateHeaderType,
  type WhatsAppTemplateUrlButton,
} from './whatsapp-template-sync.util';
import {
  hasCampaignHeaderImageSource,
  resolvePublicHttpsImageUrl,
  verifyPublicCampaignImageUrl,
  WHATSAPP_HEADER_IMAGE_REQUIRED_MSG,
} from './whatsapp-image-url.util';
import type { MetaMessagesRequestBody } from './whatsapp-cloud-api.service';
import {
  portalBaseUrl,
  renderWhatsAppTemplate,
  roleLabel,
  type WhatsAppTemplateVars,
} from './whatsapp-message-template.util';
import { normalizeToE164, whatsAppDigits } from './whatsapp-phone.util';
import {
  formatInvalidManualPhonesMessage,
  parseManualPhoneInputs,
  phoneDigitsToE164,
} from './whatsapp-manual-phones.util';
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

type CampaignTemplateSendContext = {
  waMetaTemplateId: string;
  wabaId: string;
  templateName: string;
  languageCode: string;
  variableTemplates: string[];
  variablesCount: number;
  headerType: WhatsAppTemplateHeaderType;
  headerImageUrl: string | null;
  headerImageMediaId: string | null;
  bodyText: string;
  buttonLabels: string[];
  urlButtonParamCount: number;
  urlButtonParameters: Array<{ index: number; text: string }>;
  needsHeaderImage: boolean;
  needsUrlButtonParameter: boolean;
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
    return phoneDigitsToE164(raw) ?? normalizeToE164(raw);
  }

  private parseManualPhonesForStorage(inputs: string[] | undefined | null): string[] {
    const parsed = parseManualPhoneInputs(inputs);
    if (parsed.invalid.length > 0) {
      throw new BadRequestException(formatInvalidManualPhonesMessage(parsed.invalid));
    }
    return parsed.phones;
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

  private renderBodyPreview(bodyText: string, bodyParameters: string[]): string {
    if (!bodyText.trim()) return '';
    if (bodyParameters.length === 0) return bodyText;
    let out = bodyText;
    bodyParameters.forEach((value, index) => {
      out = out.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g'), value);
    });
    return out;
  }

  private assertCampaignHeaderImageReady(ctx: Pick<
    CampaignTemplateSendContext,
    'needsHeaderImage' | 'headerImageMediaId' | 'headerImageUrl'
  >) {
    if (!ctx.needsHeaderImage) return;
    if (!ctx.headerImageMediaId?.trim() && !ctx.headerImageUrl?.trim()) {
      throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
    }
  }

  private assertCampaignUrlButtonReady(ctx: Pick<
    CampaignTemplateSendContext,
    'needsUrlButtonParameter' | 'urlButtonParameters'
  >) {
    if (!ctx.needsUrlButtonParameter) return;
    const hasParam = ctx.urlButtonParameters.some((p) => p.text.trim());
    if (!hasParam) {
      throw new BadRequestException(WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG);
    }
  }

  private resolveStoredUrlButtonParameter(
    urlButtons: WhatsAppTemplateUrlButton[],
    waUrlButtonParameter?: string | null,
  ): string | null {
    if (urlButtons.length === 0) return null;
    const normalized = normalizeUrlButtonParameterInput(
      waUrlButtonParameter ?? '',
      urlButtons[0]?.urlTemplate,
    );
    return normalized || null;
  }

  private resolveUrlButtonParameters(
    urlButtons: WhatsAppTemplateUrlButton[],
    waUrlButtonParameter?: string | null,
  ): Array<{ index: number; text: string }> {
    if (urlButtons.length === 0) return [];
    const param = this.resolveStoredUrlButtonParameter(urlButtons, waUrlButtonParameter);
    if (!param) return [];
    return urlButtons.map((btn) => ({ index: btn.index, text: param }));
  }

  private imageMimeFromExtension(ext: string): 'image/jpeg' | 'image/png' {
    return ext === '.png' ? 'image/png' : 'image/jpeg';
  }

  /** Získá media_id — z kampaně, nebo nahraje uložený soubor/URL do Meta Media API. */
  private async resolveHeaderImageMediaId(input: {
    headerImageMediaId?: string | null;
    headerImageUrl?: string | null;
  }): Promise<string> {
    const storedMediaId = input.headerImageMediaId?.trim();
    if (storedMediaId) return String(storedMediaId);

    const rawUrl = input.headerImageUrl?.trim();
    if (!rawUrl) {
      throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
    }

    let buffer: Buffer;
    let mimeType: 'image/jpeg' | 'image/png';
    let filename: string;

    if (rawUrl.startsWith('/uploads/whatsapp/')) {
      const localPath = join(getUploadsPath(), 'whatsapp', basename(rawUrl));
      if (!fs.existsSync(localPath)) {
        throw new BadRequestException(
          'Obrázek kampaně nebyl nalezen — nahrajte ho znovu přes administraci.',
        );
      }
      buffer = fs.readFileSync(localPath);
      const ext = extname(localPath).toLowerCase();
      mimeType = this.imageMimeFromExtension(ext);
      filename = basename(localPath);
    } else {
      const verifiedUrl = await verifyPublicCampaignImageUrl(rawUrl);
      const res = await fetch(verifiedUrl);
      if (!res.ok) {
        throw new BadRequestException('Obrázek kampaně není dostupný pro nahrání do Meta.');
      }
      buffer = Buffer.from(await res.arrayBuffer());
      const contentType = (res.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      mimeType = contentType === 'image/png' ? 'image/png' : 'image/jpeg';
      filename = `kampan-${randomUUID()}${mimeType === 'image/png' ? '.png' : '.jpg'}`;
    }

    return String(await this.cloudApi.uploadMediaImage(buffer, mimeType, filename));
  }

  private formatMetaSendError(metaError?: {
    message?: string;
    code?: number;
    type?: string;
    fbtrace_id?: string;
    error_data?: unknown;
  }): string {
    return formatMetaApiError(metaError);
  }

  private async buildValidatedCampaignPayload(
    phone: string,
    template: CampaignTemplateSendContext,
    bodyParameters: string[],
  ): Promise<{
    requestBody: MetaMessagesRequestBody;
    headerImageMediaId: string | null;
    headerType: WhatsAppTemplateHeaderType;
    variablesCount: number;
    templateName: string;
    languageCode: string;
    wabaId: string;
  }> {
    let variablesCount = template.variablesCount;
    let wabaId = template.wabaId;
    let resolvedTemplateName = template.templateName;
    let resolvedLanguageCode = template.languageCode;
    let headerType = template.headerType;
    let urlButtonParamCount = template.urlButtonParamCount;
    let needsHeaderImage = template.needsHeaderImage;
    let needsUrlButtonParameter = template.needsUrlButtonParameter;
    let rawTemplateForLog: unknown = null;

    if (template.waMetaTemplateId) {
      const metaRow = await this.metaTemplates.requireApprovedTemplate(template.waMetaTemplateId);
      const reqs = resolveTemplateRequirementsFromRaw(metaRow.rawTemplate);
      rawTemplateForLog = metaRow.rawTemplate;
      variablesCount = reqs.variablesCount;
      wabaId = metaRow.wabaId;
      resolvedTemplateName = metaRow.templateName;
      resolvedLanguageCode = metaTemplateLanguageCode(metaRow.language);
      headerType = reqs.headerType;
      urlButtonParamCount = reqs.urlButtonParamCount;
      needsHeaderImage = reqs.needsHeaderImage;
      needsUrlButtonParameter = reqs.needsUrlButtonParameter;
    }

    const urlButtonParameters =
      needsUrlButtonParameter
        ? template.urlButtonParameters.filter((p) => p.text.trim())
        : [];

    const normalizedBodyParameters =
      variablesCount > 0
        ? bodyParameters.map((v) => String(v).trim()).filter((v) => v.length > 0)
        : [];

    if (variablesCount > 0) {
      assertBodyParametersCount(variablesCount, normalizedBodyParameters);
    }

    let headerImageMediaId: string | undefined;

    if (needsHeaderImage) {
      headerImageMediaId = await this.resolveHeaderImageMediaId({
        headerImageMediaId: template.headerImageMediaId,
        headerImageUrl: template.headerImageUrl,
      });
    }

    const requestBody = buildTemplateMessageRequest(whatsAppDigits(phone), {
      templateName: resolvedTemplateName,
      languageCode: resolvedLanguageCode,
      bodyParameters: normalizedBodyParameters,
      variablesCount,
      headerType,
      headerImageMediaId,
      urlButtonParameters,
      urlButtonParamCount,
      needsHeaderImage,
      needsUrlButtonParameter,
    });

    if (needsHeaderImage && payloadUsesHeaderImageLink(requestBody)) {
      throw new BadRequestException(WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG);
    }

    assertTemplatePayload(requestBody, {
      variablesCount,
      headerType,
      urlButtonParamCount,
      needsHeaderImage,
      needsUrlButtonParameter,
    });
    if (needsHeaderImage) {
      assertImageHeaderInPayload(requestBody);
    }

    const payloadMediaId = extractHeaderImageMediaIdFromPayload(requestBody);
    if (needsHeaderImage && !payloadMediaId) {
      throw new BadRequestException(WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG);
    }

    const detectedComponents = describeTemplateComponentsForLog(rawTemplateForLog);
    this.logger.log(
      `[WhatsApp Template] pre-send template=${resolvedTemplateName} lang=${resolvedLanguageCode} ` +
        `detected=${JSON.stringify(detectedComponents)} ` +
        `finalPayload=${JSON.stringify(requestBody)}`,
    );

    return {
      requestBody,
      headerImageMediaId: payloadMediaId,
      headerType,
      variablesCount,
      templateName: resolvedTemplateName,
      languageCode: resolvedLanguageCode,
      wabaId,
    };
  }

  /**
   * Odeslání schválené WhatsApp šablony přes Cloud API (stejná cesta jako test).
   */
  private async sendTemplateMessage(
    phone: string,
    template: CampaignTemplateSendContext,
    bodyParameters: string[],
    logMeta: {
      campaignId?: string;
      campaignType?: WhatsAppMarketingCampaignType | null;
      recipientUserId?: string;
      recipientName?: string;
      isWelcome?: boolean;
      previewText?: string;
    },
  ): Promise<{
    providerMessageId: string | null;
    phoneNumberId: string;
    metaError?: {
      message?: string;
      code?: number;
      type?: string;
      fbtrace_id?: string;
      error_data?: unknown;
    };
  }> {
    await this.settings.reload();
    await this.diagnostic.assertPhoneBelongsToConfiguredWaba();

    this.assertCampaignHeaderImageReady(template);
    this.assertCampaignUrlButtonReady(template);

    const {
      requestBody,
      headerImageMediaId,
      headerType,
      variablesCount,
      templateName: resolvedTemplateName,
      languageCode: resolvedLanguageCode,
      wabaId,
    } = await this.buildValidatedCampaignPayload(phone, template, bodyParameters);

    const normalizedBodyParameters =
      variablesCount > 0
        ? bodyParameters.map((v) => String(v).trim()).filter((v) => v.length > 0)
        : [];

    const logLabel =
      variablesCount > 0 && logMeta.previewText?.trim()
        ? logMeta.previewText.trim()
        : formatTemplateLogLabel(
            resolvedTemplateName,
            resolvedLanguageCode,
            normalizedBodyParameters,
            headerType,
            headerImageMediaId,
          );

    this.logger.log(
      `[WhatsApp Template] send to=${requestBody.to} template=${resolvedTemplateName} lang=${resolvedLanguageCode} wabaId=${wabaId || '—'} headerType=${headerType} variablesCount=${variablesCount} media_id=${headerImageMediaId ?? '—'}`,
    );
    this.logger.log(
      `[WhatsApp Template] finalPayload: ${JSON.stringify(requestBody)}`,
    );

    const { providerMessageId, attempt, error } = await this.cloudApi.sendMessages(requestBody, {
      recipientPhone: phone,
      recipientName: logMeta.recipientName,
      recipientUserId: logMeta.recipientUserId,
      campaignId: logMeta.campaignId,
      campaignType: logMeta.campaignType ?? null,
      isWelcome: logMeta.isWelcome,
      logLabel,
      templateName: resolvedTemplateName,
      templateLanguage: resolvedLanguageCode,
      variablesCount,
      headerType,
      headerImageMediaId,
      urlButtonParamCount: template.urlButtonParamCount,
      needsHeaderImage: template.needsHeaderImage,
      needsUrlButtonParameter: template.needsUrlButtonParameter,
      wabaId: wabaId || undefined,
    });

    if (error) {
      return {
        providerMessageId: null,
        phoneNumberId: attempt.phoneNumberId,
        metaError: {
          message: error.message,
          code: error.code,
          type: error.type,
          fbtrace_id: error.fbtrace_id,
          error_data: error.error_data,
        },
      };
    }

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

    const configuredWabaId = this.config.getBusinessAccountId()?.trim() ?? '';
    const lang = normalizeTemplateLanguageCode(input.waTemplateLanguage);
    const match = await this.prisma.whatsAppMetaTemplate.findFirst({
      where: {
        templateName,
        language: lang,
        normalizedStatus: { in: ['APPROVED', 'ACTIVE'] },
        isStale: false,
        ...(configuredWabaId ? { wabaId: configuredWabaId } : {}),
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
      where: {
        templateName,
        normalizedStatus: { in: ['APPROVED', 'ACTIVE'] },
        isStale: false,
        ...(configuredWabaId ? { wabaId: configuredWabaId } : {}),
      },
      orderBy: { lastSyncedAt: 'desc' },
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
    variablesCount: number,
    vars: WhatsAppTemplateVars,
  ): string[] {
    return buildTemplateBodyParameters(variableTemplates, variablesCount, (slot) =>
      renderWhatsAppTemplate(slot, vars),
    );
  }

  private async sanitizeStoredTemplateVariables(
    metaTemplateId: string,
    variables: string[],
  ): Promise<string[]> {
    const meta = await this.metaTemplates.getById(metaTemplateId);
    if (!meta || meta.variablesCount <= 0) return [];
    return variables
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, meta.variablesCount);
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
    waHeaderImageUrl?: string | null;
    waHeaderImageMediaId?: string | null;
    waUrlButtonParameter?: string | null;
    messageTemplate: string;
  }): Promise<CampaignTemplateSendContext> {
    let variablesCount = 0;

    if (campaign.waMetaTemplateId) {
      const t = await this.metaTemplates.requireApprovedTemplate(campaign.waMetaTemplateId);
      const reqs = resolveTemplateRequirementsFromRaw(t.rawTemplate);
      variablesCount = reqs.variablesCount;
      const parts = reqs.componentsSummary;
      return {
        waMetaTemplateId: campaign.waMetaTemplateId,
        wabaId: t.wabaId,
        templateName: t.templateName,
        languageCode: metaTemplateLanguageCode(t.language),
        variableTemplates:
          variablesCount > 0 ? (campaign.waTemplateVariables ?? []) : [],
        variablesCount,
        headerType: reqs.headerType,
        headerImageUrl: campaign.waHeaderImageUrl ?? null,
        headerImageMediaId: campaign.waHeaderImageMediaId ?? null,
        bodyText: parts.bodyText || t.bodyText,
        buttonLabels: parts.buttonLabels,
        urlButtonParamCount: reqs.urlButtonParamCount,
        needsHeaderImage: reqs.needsHeaderImage,
        needsUrlButtonParameter: reqs.needsUrlButtonParameter,
        urlButtonParameters: this.resolveUrlButtonParameters(
          reqs.urlButtons,
          campaign.waUrlButtonParameter,
        ),
      };
    }

    const resolved = await this.resolveTemplateFields({
      waTemplateName: campaign.waTemplateName,
      waTemplateLanguage: campaign.waTemplateLanguage,
      messageTemplate: campaign.messageTemplate,
    });

    const metaTemplate = await this.metaTemplates.requireApprovedTemplate(resolved.waMetaTemplateId);
    const reqs = resolveTemplateRequirementsFromRaw(metaTemplate.rawTemplate);
    variablesCount = reqs.variablesCount;

    return {
      waMetaTemplateId: resolved.waMetaTemplateId,
      wabaId: metaTemplate.wabaId,
      templateName: metaTemplate.templateName,
      languageCode: metaTemplateLanguageCode(metaTemplate.language),
      variableTemplates:
        variablesCount > 0 ? (campaign.waTemplateVariables ?? []) : [],
      variablesCount,
      headerType: reqs.headerType,
      headerImageUrl: campaign.waHeaderImageUrl ?? null,
      headerImageMediaId: campaign.waHeaderImageMediaId ?? null,
      bodyText: reqs.componentsSummary.bodyText || metaTemplate.bodyText,
      buttonLabels: reqs.componentsSummary.buttonLabels,
      urlButtonParamCount: reqs.urlButtonParamCount,
      needsHeaderImage: reqs.needsHeaderImage,
      needsUrlButtonParameter: reqs.needsUrlButtonParameter,
      urlButtonParameters: this.resolveUrlButtonParameters(
        reqs.urlButtons,
        campaign.waUrlButtonParameter,
      ),
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
      const resolved = await this.resolveTemplateFields({
        waTemplateName: templateName,
        waTemplateLanguage: meta?.waTemplateLanguage,
      });
      const metaTemplate = await this.metaTemplates.getById(resolved.waMetaTemplateId);
      const reqs = resolveTemplateRequirementsFromRaw(metaTemplate?.rawTemplate);
      const tpl: CampaignTemplateSendContext = {
        waMetaTemplateId: resolved.waMetaTemplateId,
        wabaId: metaTemplate?.wabaId ?? '',
        templateName,
        languageCode: metaTemplateLanguageCode(
          metaTemplate?.language ?? meta?.waTemplateLanguage,
        ),
        variableTemplates: meta?.waTemplateVariables ?? [],
        variablesCount: reqs.variablesCount,
        headerType: reqs.headerType,
        headerImageUrl: null,
        headerImageMediaId: null,
        bodyText: reqs.componentsSummary.bodyText || metaTemplate?.bodyText || '',
        buttonLabels: reqs.componentsSummary.buttonLabels,
        urlButtonParamCount: reqs.urlButtonParamCount,
        needsHeaderImage: reqs.needsHeaderImage,
        needsUrlButtonParameter: reqs.needsUrlButtonParameter,
        urlButtonParameters: [],
      };
      const bodyParameters =
        reqs.variablesCount > 0
          ? this.renderTemplateBodyParameters(
              meta?.waTemplateVariables ?? [],
              reqs.variablesCount,
              {
                jmeno: meta?.recipientName || 'uživateli',
                role: '',
                odkaz: portalBaseUrl(),
                kredit: '0',
              },
            )
          : [];

      const { providerMessageId, metaError } = await this.sendTemplateMessage(
        toPhone,
        tpl,
        bodyParameters,
        {
          campaignId: meta?.campaignId,
          campaignType: meta?.campaignType ?? null,
          recipientUserId: meta?.recipientUserId,
          recipientName: meta?.recipientName,
          isWelcome: meta?.isWelcome,
          previewText:
            tpl.variablesCount > 0 && message.trim()
              ? message.slice(0, 500)
              : formatTemplateLogLabel(
                  templateName,
                  tpl.languageCode,
                  bodyParameters,
                  tpl.headerType,
                ),
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

      if (!providerMessageId) {
        return { ok: false, error: metaError?.message ?? 'Meta nevrátilo ID zprávy.' };
      }

      return { ok: true, providerMessageId };
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

    const { providerMessageId, phoneNumberId, metaError } = await this.sendTemplateMessage(
      phone,
      {
        waMetaTemplateId: '',
        wabaId: '',
        templateName: 'hello_world',
        languageCode: 'en_US',
        variableTemplates: [],
        variablesCount: 0,
        headerType: 'NONE',
        headerImageUrl: null,
        headerImageMediaId: null,
        bodyText: '',
        buttonLabels: [],
        urlButtonParamCount: 0,
        urlButtonParameters: [],
        needsHeaderImage: false,
        needsUrlButtonParameter: false,
      },
      [],
      { previewText: 'test:hello_world' },
    );

    if (!providerMessageId) {
      throw new BadRequestException(this.formatMetaSendError(metaError));
    }

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

  async getLastCampaignError(campaignId: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    const error = await this.cloudApi.getLastCampaignError(campaignId);
    return { campaign, error };
  }

  async getCampaignFinalPayload(campaignId: string, toPhone?: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const tpl = await this.campaignTemplateConfig(campaign);
    this.assertCampaignHeaderImageReady(tpl);
    this.assertCampaignUrlButtonReady(tpl);

    const phone = this.normalizePhone(
      toPhone?.trim() ||
        this.config.getTestPhone() ||
        campaign.manualPhones[0] ||
        '',
    );
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
    const bodyParameters =
      tpl.variablesCount > 0
        ? this.renderTemplateBodyParameters(tpl.variableTemplates, tpl.variablesCount, vars)
        : [];

    const built = await this.buildValidatedCampaignPayload(phone, tpl, bodyParameters);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      to: phone,
      templateName: built.templateName,
      templateLanguage: built.languageCode,
      headerImageMediaId: built.headerImageMediaId,
      finalPayload: built.requestBody,
    };
  }

  async getLastCampaignLog(campaignId: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    const log = await this.cloudApi.getLastCampaignLog(campaignId);
    return { campaign, log };
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
    const metaIds = [
      ...new Set(rows.map((r) => r.waMetaTemplateId).filter((id): id is string => Boolean(id))),
    ];
    const templates =
      metaIds.length > 0
        ? await this.prisma.whatsAppMetaTemplate.findMany({
            where: { id: { in: metaIds } },
            select: { id: true, rawTemplate: true },
          })
        : [];
    const requirementsByMetaId = new Map(
      templates.map((t) => [t.id, resolveTemplateRequirementsFromRaw(t.rawTemplate)]),
    );

    return rows.map((r) => {
      const reqs = r.waMetaTemplateId
        ? requirementsByMetaId.get(r.waMetaTemplateId)
        : undefined;
      return {
        ...this.campaignRow(r),
        waTemplateHeaderType: reqs?.headerFormat ?? reqs?.headerType ?? null,
        waTemplateUrlButtonParamCount: reqs?.urlButtonParamCount ?? 0,
        waTemplateNeedsHeaderImage: reqs?.needsHeaderImage ?? false,
        waTemplateNeedsUrlButtonParameter: reqs?.needsUrlButtonParameter ?? false,
      };
    });
  }

  async getCampaign(id: string) {
    const row = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kampaň nenalezena.');
    let waTemplateHeaderType: string | null = null;
    let waTemplateUrlButtonParamCount = 0;
    let waTemplateNeedsHeaderImage = false;
    let waTemplateNeedsUrlButtonParameter = false;
    if (row.waMetaTemplateId) {
      const tpl = await this.prisma.whatsAppMetaTemplate.findUnique({
        where: { id: row.waMetaTemplateId },
        select: { rawTemplate: true },
      });
      const reqs = resolveTemplateRequirementsFromRaw(tpl?.rawTemplate);
      waTemplateHeaderType = reqs.headerFormat ?? reqs.headerType;
      waTemplateUrlButtonParamCount = reqs.urlButtonParamCount;
      waTemplateNeedsHeaderImage = reqs.needsHeaderImage;
      waTemplateNeedsUrlButtonParameter = reqs.needsUrlButtonParameter;
    }
    return {
      ...this.campaignRow(row),
      waTemplateHeaderType,
      waTemplateUrlButtonParamCount,
      waTemplateNeedsHeaderImage,
      waTemplateNeedsUrlButtonParameter,
    };
  }

  async createCampaign(adminUserId: string, dto: CreateWhatsAppMarketingCampaignDto) {
    if (!dto.waMetaTemplateId?.trim()) {
      throw new BadRequestException('Vyberte schválenou WhatsApp šablonu z aktuálního WABA.');
    }

    const metaTemplate = await this.metaTemplates.requireApprovedTemplate(dto.waMetaTemplateId.trim());

    const resolved = await this.resolveTemplateFields({
      waMetaTemplateId: dto.waMetaTemplateId,
      waTemplateName: dto.waTemplateName,
      waTemplateLanguage: dto.waTemplateLanguage,
      messageTemplate: dto.messageTemplate,
    });

    if (resolved.waTemplateName !== metaTemplate.templateName) {
      throw new BadRequestException('Nesoulad názvu šablony při vytváření kampaně.');
    }
    if (resolved.waTemplateLanguage !== metaTemplate.language) {
      throw new BadRequestException('Nesoulad jazyka šablony při vytváření kampaně.');
    }

    const reqs = resolveTemplateRequirementsFromRaw(metaTemplate.rawTemplate);
    if (reqs.needsHeaderImage) {
      if (
        !hasCampaignHeaderImageSource({
          headerImageMediaId: dto.waHeaderImageMediaId,
        })
      ) {
        throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
      }
    }

    if (reqs.needsUrlButtonParameter && !dto.waUrlButtonParameter?.trim()) {
      throw new BadRequestException(WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG);
    }

    const row = await this.prisma.whatsAppMarketingCampaign.create({
      data: {
        name: dto.name.trim(),
        campaignType: dto.campaignType,
        messageTemplate: dto.messageTemplate?.trim() ?? '',
        waMetaTemplateId: resolved.waMetaTemplateId,
        waTemplateName: resolved.waTemplateName,
        waTemplateLanguage: normalizeTemplateLanguageCode(resolved.waTemplateLanguage),
        waTemplateVariables: await this.sanitizeStoredTemplateVariables(
          resolved.waMetaTemplateId,
          dto.waTemplateVariables ?? [],
        ),
        waHeaderImageUrl: reqs.needsHeaderImage ? dto.waHeaderImageUrl?.trim() || null : null,
        waHeaderImageMediaId: reqs.needsHeaderImage
          ? dto.waHeaderImageMediaId?.trim() || null
          : null,
        waUrlButtonParameter: reqs.needsUrlButtonParameter
          ? this.resolveStoredUrlButtonParameter(reqs.urlButtons, dto.waUrlButtonParameter)
          : null,
        targetRoles: dto.targetRoles ?? [],
        targetRegions: (dto.targetRegions ?? []).map((s) => s.trim()).filter(Boolean),
        targetCities: (dto.targetCities ?? []).map((s) => s.trim()).filter(Boolean),
        manualPhones: this.parseManualPhonesForStorage(dto.manualPhones),
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

    const effectiveMetaId =
      resolvedTemplate?.waMetaTemplateId ?? existing.waMetaTemplateId ?? null;
    let sanitizedVariables: string[] | undefined;
    if (effectiveMetaId && (resolvedTemplate || dto.waTemplateVariables !== undefined)) {
      sanitizedVariables = await this.sanitizeStoredTemplateVariables(
        effectiveMetaId,
        dto.waTemplateVariables ?? existing.waTemplateVariables,
      );
    }

    let templateRequirements:
      | ReturnType<typeof resolveTemplateRequirementsFromRaw>
      | undefined;

    if (effectiveMetaId) {
      const metaTemplate = await this.metaTemplates.requireApprovedTemplate(effectiveMetaId);
      templateRequirements = resolveTemplateRequirementsFromRaw(metaTemplate.rawTemplate);
      const effectiveHeaderMediaId =
        dto.waHeaderImageMediaId !== undefined
          ? dto.waHeaderImageMediaId
          : existing.waHeaderImageMediaId;
      if (
        templateRequirements.needsHeaderImage &&
        !hasCampaignHeaderImageSource({ headerImageMediaId: effectiveHeaderMediaId })
      ) {
        throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
      }
      const effectiveUrlButtonParam =
        dto.waUrlButtonParameter !== undefined
          ? dto.waUrlButtonParameter
          : existing.waUrlButtonParameter;
      if (
        templateRequirements.needsUrlButtonParameter &&
        !effectiveUrlButtonParam?.trim()
      ) {
        throw new BadRequestException(WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG);
      }
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
        ...(sanitizedVariables !== undefined
          ? { waTemplateVariables: sanitizedVariables }
          : {}),
        ...(dto.waHeaderImageUrl !== undefined
          ? {
              waHeaderImageUrl: templateRequirements?.needsHeaderImage
                ? dto.waHeaderImageUrl.trim() || null
                : null,
            }
          : templateRequirements && !templateRequirements.needsHeaderImage
            ? { waHeaderImageUrl: null }
            : {}),
        ...(dto.waHeaderImageMediaId !== undefined
          ? {
              waHeaderImageMediaId: templateRequirements?.needsHeaderImage
                ? dto.waHeaderImageMediaId.trim() || null
                : null,
            }
          : templateRequirements && !templateRequirements.needsHeaderImage
            ? { waHeaderImageMediaId: null }
            : {}),
        ...(dto.waUrlButtonParameter !== undefined
          ? {
              waUrlButtonParameter: templateRequirements?.needsUrlButtonParameter
                ? this.resolveStoredUrlButtonParameter(
                    templateRequirements.urlButtons,
                    dto.waUrlButtonParameter,
                  )
                : null,
            }
          : templateRequirements && !templateRequirements.needsUrlButtonParameter
            ? { waUrlButtonParameter: null }
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
          ? { manualPhones: this.parseManualPhonesForStorage(dto.manualPhones) }
          : {}),
      },
    });
    return this.campaignRow(row);
  }

  async duplicateCampaign(adminUserId: string, id: string) {
    const existing = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň právě odesílá — nelze duplikovat.');
    }

    const row = await this.prisma.whatsAppMarketingCampaign.create({
      data: {
        name: `${existing.name.trim()} (kopie)`,
        campaignType: existing.campaignType,
        messageTemplate: existing.messageTemplate,
        waMetaTemplateId: existing.waMetaTemplateId,
        waTemplateName: existing.waTemplateName,
        waTemplateLanguage: existing.waTemplateLanguage,
        waTemplateVariables: existing.waTemplateVariables,
        waHeaderImageUrl: existing.waHeaderImageUrl,
        waHeaderImageMediaId: existing.waHeaderImageMediaId,
        waUrlButtonParameter: existing.waUrlButtonParameter,
        targetRoles: existing.targetRoles,
        targetRegions: existing.targetRegions,
        targetCities: existing.targetCities,
        manualPhones: existing.manualPhones,
        createdByUserId: adminUserId,
        status: WhatsAppMarketingCampaignStatus.DRAFT,
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
    const sampleName = dto.sampleName?.trim() || 'Jan Novák';
    const vars = {
      jmeno: sampleName,
      role: roleLabel(sampleRole),
      odkaz: portalBaseUrl(),
      kredit: '1500',
    };
    const tpl = await this.campaignTemplateConfig({
      waMetaTemplateId: dto.waMetaTemplateId ?? null,
      waTemplateName: dto.waTemplateName ?? '',
      waTemplateLanguage: dto.waTemplateLanguage ?? 'cs',
      waTemplateVariables: dto.waTemplateVariables ?? [],
      waHeaderImageUrl: dto.waHeaderImageUrl ?? null,
      waHeaderImageMediaId: dto.waHeaderImageMediaId ?? null,
      waUrlButtonParameter: dto.waUrlButtonParameter ?? null,
      messageTemplate: dto.messageTemplate ?? '',
    });
    const bodyParams = this.renderTemplateBodyParameters(
      tpl.variableTemplates,
      tpl.variablesCount,
      vars,
    );
    const textPreview = dto.messageTemplate?.trim()
      ? renderWhatsAppTemplate(dto.messageTemplate, vars)
      : this.renderBodyPreview(tpl.bodyText, bodyParams);

    let previewImageUrl: string | null = null;
    if (tpl.needsHeaderImage) {
      if (tpl.headerImageMediaId?.trim()) {
        previewImageUrl = null;
      } else if (tpl.headerImageUrl?.trim()) {
        try {
          previewImageUrl = resolvePublicHttpsImageUrl(tpl.headerImageUrl);
        } catch {
          previewImageUrl = tpl.headerImageUrl.trim();
        }
      }
    }

    const metaTemplate = await this.metaTemplates.getById(tpl.waMetaTemplateId);

    return {
      preview: textPreview,
      templateName: tpl.templateName,
      templateLanguage: tpl.languageCode,
      headerType: tpl.headerType,
      imageUrl: previewImageUrl,
      imageMediaId: tpl.headerImageMediaId,
      templateVariablesRendered: bodyParams,
      templateBody: tpl.bodyText,
      templateCategory: metaTemplate?.category ?? null,
      buttons: tpl.buttonLabels,
      recipientSample: {
        name: sampleName,
        phone: this.config.getTestPhone() || '+420…',
      },
    };
  }

  async getCampaignDebugContext(campaignId: string): Promise<{
    selectedTemplate?: Record<string, unknown>;
    variablesCount?: number;
    wabaId?: string;
  }> {
    try {
      const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) {
        return {
          selectedTemplate: { error: 'Kampaň nenalezena v databázi' },
        };
      }

      const tpl = await this.campaignTemplateConfig(campaign);
      return {
        selectedTemplate: {
          waMetaTemplateId: tpl.waMetaTemplateId,
          templateName: tpl.templateName,
          languageCode: tpl.languageCode,
          headerType: tpl.headerType,
          imageUrl: tpl.headerImageUrl,
        },
        variablesCount: tpl.variablesCount,
        wabaId: tpl.wabaId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        selectedTemplate: { lookupError: message },
      };
    }
  }

  async getCampaignRecipientPreview(campaignId: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const manualParsed = parseManualPhoneInputs(campaign.manualPhones);
    const recipients = await this.resolveRecipients(campaign);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      recipientCount: recipients.length,
      manualPhoneCount: manualParsed.phones.length,
      invalidManualPhones: manualParsed.invalid,
      recipientPhones: recipients.map((r) => whatsAppDigits(r.phone)),
    };
  }

  async testCampaign(campaignId: string, toPhone?: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const tpl = await this.campaignTemplateConfig(campaign);
    this.assertCampaignHeaderImageReady(tpl);
    this.assertCampaignUrlButtonReady(tpl);

    const phone = this.normalizePhone(
      toPhone?.trim() ||
        this.config.getTestPhone() ||
        campaign.manualPhones[0] ||
        '',
    );
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
    const bodyParameters =
      tpl.variablesCount > 0
        ? this.renderTemplateBodyParameters(tpl.variableTemplates, tpl.variablesCount, vars)
        : [];
    const previewText =
      tpl.variablesCount > 0 && campaign.messageTemplate?.trim()
        ? renderWhatsAppTemplate(campaign.messageTemplate, vars)
        : formatTemplateLogLabel(
            tpl.templateName,
            tpl.languageCode,
            bodyParameters,
            tpl.headerType,
            tpl.headerImageMediaId,
          );

    const { providerMessageId, metaError } = await this.sendTemplateMessage(
      phone,
      tpl,
      bodyParameters,
      {
        campaignId: campaign.id,
        recipientName: 'Test',
        campaignType: campaign.campaignType,
        previewText,
      },
    );

    if (!providerMessageId) {
      throw new BadRequestException({
        success: false,
        error: this.formatMetaSendError(metaError),
        metaError,
      });
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
        this.logger.warn(`[Campaign Recipients] invalid stored manual phone skipped: ${raw}`);
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
    this.assertCampaignHeaderImageReady(tpl);
    this.assertCampaignUrlButtonReady(tpl);

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
      const bodyParameters =
        tpl.variablesCount > 0
          ? this.renderTemplateBodyParameters(tpl.variableTemplates, tpl.variablesCount, vars)
          : [];
      const previewText =
        tpl.variablesCount > 0 && campaign.messageTemplate?.trim()
          ? renderWhatsAppTemplate(campaign.messageTemplate, vars)
          : formatTemplateLogLabel(
              tpl.templateName,
              tpl.languageCode,
              bodyParameters,
              tpl.headerType,
              tpl.headerImageMediaId,
            );

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
        const { providerMessageId, metaError } = await this.sendTemplateMessage(
          r.phone,
          tpl,
          bodyParameters,
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
          const errText = `${r.phone}: ${this.formatMetaSendError(metaError)}`;
          sendErrors.push(errText);
          this.logger.error(
            `[Campaign Run] failed campaignId=${campaignId} phone=${r.phone} template=${tpl.templateName} lang=${tpl.languageCode} error=${metaError?.message ?? '—'} code=${metaError?.code ?? '—'}`,
          );
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

    return rows.map((r) => {
      let metaErrorCode: number | null = null;
      let metaErrorMessage: string | null = null;
      let metaFbtraceId: string | null = null;
      if (r.errorMessage) {
        try {
          const parsed = JSON.parse(r.errorMessage) as {
            code?: number;
            message?: string;
            fbtrace_id?: string;
          };
          if (typeof parsed.code === 'number') metaErrorCode = parsed.code;
          if (typeof parsed.message === 'string') metaErrorMessage = parsed.message;
          if (typeof parsed.fbtrace_id === 'string') metaFbtraceId = parsed.fbtrace_id;
        } catch {
          metaErrorMessage = r.errorMessage;
        }
      }
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        recipientName: r.recipientName || r.recipient?.name || null,
        recipientPhone: r.recipientPhone,
        campaignType: r.campaignType,
        campaignName: r.campaign?.name ?? (r.isWelcome ? 'Uvítací zpráva' : null),
        status: r.status,
        errorMessage: r.errorMessage,
        metaErrorCode,
        metaErrorMessage,
        metaFbtraceId,
        providerMessageId: r.providerMessageId,
        message: r.message,
        isWelcome: r.isWelcome,
        campaignId: r.campaignId,
      };
    });
  }

  async uploadCampaignHeaderImage(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Chybí soubor obrázku kampaně.');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      throw new BadRequestException('Povolené formáty obrázku: JPG, PNG.');
    }
    const mimeType = this.imageMimeFromExtension(ext);
    const dir = join(getUploadsPath(), 'whatsapp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const name = `kampan-${randomUUID()}${ext}`;
    fs.writeFileSync(join(dir, name), file.buffer);
    const relative = `/uploads/whatsapp/${name}`;
    const publicUrl = resolvePublicHttpsImageUrl(relative);
    const mediaId = await this.cloudApi.uploadMediaImage(file.buffer, mimeType, name);
    this.logger.log(
      `[WhatsApp Campaign] header image uploaded to Meta media_id=${mediaId} preview=${publicUrl}`,
    );
    return { url: relative, publicUrl, mediaId };
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
    waHeaderImageUrl: string | null;
    waHeaderImageMediaId: string | null;
    waUrlButtonParameter: string | null;
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
      waHeaderImageUrl: r.waHeaderImageUrl,
      waHeaderImageMediaId: r.waHeaderImageMediaId,
      waUrlButtonParameter: r.waUrlButtonParameter,
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
