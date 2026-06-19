import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppMessageStatus, WhatsAppMarketingCampaignType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { assertTemplatePayload, finalizeMetaTemplateRequestBody } from './whatsapp-template-send.util';

const GRAPH_BASE = 'https://graph.facebook.com';

export type MetaWhatsAppErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_data?: unknown;
};

export type MetaMessagesRequestBody = Record<string, unknown>;

export type MetaSendAttempt = {
  requestUrl: string;
  requestBody: MetaMessagesRequestBody;
  responseStatus: number;
  responseBody: unknown;
  phoneNumberId: string;
  accessTokenSource: 'database' | 'env' | 'missing';
};

@Injectable()
export class WhatsAppCloudApiService {
  private readonly logger = new Logger(WhatsAppCloudApiService.name);

  constructor(
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private accessTokenSource(): 'database' | 'env' | 'missing' {
    const stored = this.settings.getStoredSettings().accessToken.trim();
    if (stored) return 'database';
    if (this.config.getAccessToken()) return 'env';
    return 'missing';
  }

  /**
   * Volá Meta Graph API POST /{phoneNumberId}/messages.
   * Při statusu jiném než 200/201 vyhodí BadRequestException s message, code, type.
   */
  async sendMessages(
    requestBody: MetaMessagesRequestBody,
    logMeta?: {
      recipientPhone: string;
      recipientName?: string;
      recipientUserId?: string;
      logLabel?: string;
      campaignId?: string;
      campaignType?: WhatsAppMarketingCampaignType | null;
      isWelcome?: boolean;
      templateName?: string;
      templateLanguage?: string;
      variablesCount?: number;
      headerType?: string;
      headerImageMediaId?: string | null;
      wabaId?: string;
    },
  ): Promise<{
    providerMessageId: string | null;
    attempt: MetaSendAttempt;
    error?: MetaWhatsAppErrorBody & { httpStatus?: number };
  }> {
    await this.settings.reload();

    if (!this.config.isCloudApiConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp Cloud API není zapnuto nebo není nakonfigurováno.',
      );
    }

    const token = this.config.getAccessToken();
    const phoneNumberId = this.config.getPhoneNumberId();
    if (!token || !phoneNumberId) {
      throw new ServiceUnavailableException('Chybí access token nebo phone number ID.');
    }

    const apiVersion = this.config.getApiVersion();
    const requestUrl = `${GRAPH_BASE}/${apiVersion}/${phoneNumberId}/messages`;
    const tokenSource = this.accessTokenSource();

    if (logMeta?.variablesCount != null) {
      assertTemplatePayload(requestBody, {
        variablesCount: logMeta.variablesCount,
        headerType:
          logMeta.headerType === 'IMAGE' || logMeta.headerType === 'TEXT'
            ? logMeta.headerType
            : 'NONE',
      });
    }

    const finalPayload = finalizeMetaTemplateRequestBody(requestBody);
    const finalPayloadJson = JSON.stringify(finalPayload);

    console.log('WHATSAPP FINAL PAYLOAD', JSON.stringify(finalPayload, null, 2));

    this.logger.log(`[WhatsApp Meta] POST ${requestUrl}`);
    this.logger.log(
      `[WhatsApp Meta] phoneNumberId=${phoneNumberId} tokenSource=${tokenSource} tokenLen=${token.length}`,
    );
    this.logger.log(`[WhatsApp Meta] finalPayload: ${finalPayloadJson}`);

    let res: Response;
    let responseBody: { messages?: Array<{ id?: string }>; error?: MetaWhatsAppErrorBody };

    try {
      res = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: finalPayloadJson,
      });

      responseBody = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: MetaWhatsAppErrorBody;
      };
    } catch (fetchError: unknown) {
      const networkMetaError = {
        error: {
          message:
            fetchError instanceof Error
              ? fetchError.message
              : 'Síťová chyba při volání Meta API',
          type: 'network_error',
        },
      };
      console.error('META FULL ERROR', JSON.stringify(networkMetaError, null, 2));

      const errorDetail = {
        recipient: logMeta?.recipientPhone ?? String(finalPayload.to ?? ''),
        finalPayload,
        metaFullError: networkMetaError,
        message: networkMetaError.error.message,
        code: null,
        error_data: null,
        fbtrace_id: null,
        message_id: null,
      };

      await this.persistAdminLog({
        recipientPhone: logMeta?.recipientPhone ?? String(finalPayload.to ?? ''),
        recipientName: logMeta?.recipientName,
        recipientUserId: logMeta?.recipientUserId,
        campaignId: logMeta?.campaignId,
        campaignType: logMeta?.campaignType ?? null,
        isWelcome: logMeta?.isWelcome,
        message: logMeta?.logLabel || 'template',
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: JSON.stringify(errorDetail),
        providerMessageId: null,
      });

      return {
        providerMessageId: null,
        attempt: {
          requestUrl,
          requestBody: finalPayload,
          responseStatus: 0,
          responseBody: networkMetaError,
          phoneNumberId,
          accessTokenSource: tokenSource,
        },
        error: {
          message: networkMetaError.error.message,
          type: 'network_error',
        },
      };
    }

    this.logger.log(`[WhatsApp Meta] response status: ${res.status}`);
    this.logger.log(`[WhatsApp Meta] response body: ${JSON.stringify(responseBody)}`);

    const attempt: MetaSendAttempt = {
      requestUrl,
      requestBody: finalPayload,
      responseStatus: res.status,
      responseBody,
      phoneNumberId,
      accessTokenSource: tokenSource,
    };

    const providerMessageId = responseBody.messages?.[0]?.id?.trim() || null;
    const logMessage =
      logMeta?.logLabel ||
      (requestBody.type === 'template'
        ? `template:${(requestBody.template as { name?: string })?.name ?? 'unknown'}`
        : String(requestBody.type ?? 'message'));

    if (res.status !== 200 && res.status !== 201) {
      const err = responseBody.error;
      const metaFullError = { error: err ?? responseBody };
      console.error('META FULL ERROR', JSON.stringify(metaFullError, null, 2));

      const errorDetail = {
        recipient: logMeta?.recipientPhone ?? String(finalPayload.to ?? ''),
        templateName: logMeta?.templateName ?? (finalPayload.template as { name?: string })?.name,
        template_name: logMeta?.templateName ?? (finalPayload.template as { name?: string })?.name,
        template_language:
          logMeta?.templateLanguage ??
          (finalPayload.template as { language?: { code?: string } })?.language?.code,
        variablesCount: logMeta?.variablesCount ?? null,
        headerType: logMeta?.headerType ?? null,
        headerImageMediaId: logMeta?.headerImageMediaId ?? null,
        wabaId: logMeta?.wabaId ?? null,
        finalPayload,
        metaFullError,
        message: err?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`,
        code: err?.code ?? res.status,
        type: err?.type ?? 'http_error',
        error_subcode: err?.error_subcode,
        error_data: err?.error_data ?? null,
        fbtrace_id: err?.fbtrace_id,
        message_id: null,
        metaResponse: responseBody,
        attempt,
      };

      await this.persistAdminLog({
        recipientPhone: logMeta?.recipientPhone ?? String(finalPayload.to ?? ''),
        recipientName: logMeta?.recipientName,
        recipientUserId: logMeta?.recipientUserId,
        campaignId: logMeta?.campaignId,
        campaignType: logMeta?.campaignType ?? null,
        isWelcome: logMeta?.isWelcome,
        message: logMessage,
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: JSON.stringify(errorDetail),
        providerMessageId: null,
      });

      return {
        providerMessageId: null,
        attempt,
        error: {
          ...(err ?? {}),
          httpStatus: res.status,
        },
      };
    }

    const successDetail = {
      recipient: logMeta?.recipientPhone ?? String(requestBody.to ?? ''),
      templateName: logMeta?.templateName ?? (requestBody.template as { name?: string })?.name,
      template_name: logMeta?.templateName ?? (requestBody.template as { name?: string })?.name,
      template_language:
        logMeta?.templateLanguage ??
        (requestBody.template as { language?: { code?: string } })?.language?.code,
      variablesCount: logMeta?.variablesCount ?? null,
      headerType: logMeta?.headerType ?? null,
      headerImageMediaId: logMeta?.headerImageMediaId ?? null,
      wabaId: logMeta?.wabaId ?? null,
      finalPayload,
      message_id: providerMessageId,
      metaResponse: responseBody,
      attempt,
    };

    await this.persistAdminLog({
      recipientPhone: logMeta?.recipientPhone ?? String(requestBody.to ?? ''),
      recipientName: logMeta?.recipientName,
      recipientUserId: logMeta?.recipientUserId,
      campaignId: logMeta?.campaignId,
      campaignType: logMeta?.campaignType ?? null,
      isWelcome: logMeta?.isWelcome,
      message: logMessage,
      status: WhatsAppMessageStatus.SENT,
      errorMessage: JSON.stringify({ success: true, ...successDetail }),
      providerMessageId,
    });

    return { providerMessageId, attempt };
  }

  /**
   * Nahraje obrázek přes Meta Graph API POST /{phoneNumberId}/media.
   * Vrací WhatsApp media_id pro template header image.id.
   */
  async uploadMediaImage(
    buffer: Buffer,
    mimeType: 'image/jpeg' | 'image/png',
    filename: string,
  ): Promise<string> {
    await this.settings.reload();

    if (!this.config.isCloudApiConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp Cloud API není zapnuto nebo není nakonfigurováno.',
      );
    }

    const token = this.config.getAccessToken();
    const phoneNumberId = this.config.getPhoneNumberId();
    if (!token || !phoneNumberId) {
      throw new ServiceUnavailableException('Chybí access token nebo phone number ID.');
    }

    const apiVersion = this.config.getApiVersion();
    const requestUrl = `${GRAPH_BASE}/${apiVersion}/${phoneNumberId}/media`;
    const tokenSource = this.accessTokenSource();

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    this.logger.log(`[WhatsApp Meta] POST ${requestUrl} (media upload)`);
    this.logger.log(
      `[WhatsApp Meta] phoneNumberId=${phoneNumberId} tokenSource=${tokenSource} file=${filename} type=${mimeType} size=${buffer.length}`,
    );

    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const responseBody = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: MetaWhatsAppErrorBody;
    };

    this.logger.log(`[WhatsApp Meta] media upload response status: ${res.status}`);
    this.logger.log(`[WhatsApp Meta] media upload response body: ${JSON.stringify(responseBody)}`);

    if (res.status !== 200 && res.status !== 201) {
      const err = responseBody.error;
      const parts = [
        err?.message?.trim() || `Meta Media API vrátilo HTTP ${res.status}`,
      ];
      if (err?.code != null) parts.push(`code: ${err.code}`);
      if (err?.fbtrace_id) parts.push(`fbtrace_id: ${err.fbtrace_id}`);
      throw new BadRequestException(parts.join(' | '));
    }

    const mediaId = String(responseBody.id ?? '').trim();
    if (!mediaId) {
      throw new BadRequestException('Meta Media API nevrátilo media_id.');
    }

    return mediaId;
  }

  async getLastCampaignError(campaignId: string) {
    const row = await this.prisma.whatsAppMarketingCampaignLog.findFirst({
      where: { campaignId, status: WhatsAppMessageStatus.FAILED },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return this.formatLogRow(row);
  }

  private formatLogRow(row: {
    id: string;
    createdAt: Date;
    recipientPhone: string;
    recipientName: string | null;
    message: string;
    status: WhatsAppMessageStatus;
    errorMessage: string | null;
    providerMessageId: string | null;
  }) {
    let metaDebug: Record<string, unknown> | null = null;
    let metaErrorCode: number | null = null;
    let metaErrorMessage: string | null = null;
    let metaErrorData: unknown = null;
    let metaFbtraceId: string | null = null;
    let metaErrorType: string | null = null;
    let finalPayload: unknown = null;
    let metaFullError: unknown = null;

    if (row.errorMessage) {
      try {
        metaDebug = JSON.parse(row.errorMessage) as Record<string, unknown>;
        if (typeof metaDebug.code === 'number') metaErrorCode = metaDebug.code;
        if (typeof metaDebug.message === 'string') metaErrorMessage = metaDebug.message;
        if (typeof metaDebug.type === 'string') metaErrorType = metaDebug.type;
        if (typeof metaDebug.fbtrace_id === 'string') metaFbtraceId = metaDebug.fbtrace_id;
        if ('error_data' in metaDebug) metaErrorData = metaDebug.error_data;
        if ('finalPayload' in metaDebug) finalPayload = metaDebug.finalPayload;
        if ('metaFullError' in metaDebug) {
          metaFullError = metaDebug.metaFullError;
        } else if ('metaResponse' in metaDebug) {
          metaFullError = { error: (metaDebug.metaResponse as { error?: unknown })?.error };
        }
      } catch {
        metaDebug = { raw: row.errorMessage };
        metaErrorMessage = row.errorMessage;
      }
    }

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      recipientPhone: row.recipientPhone,
      recipientName: row.recipientName,
      message: row.message,
      status: row.status,
      errorMessage: row.errorMessage,
      providerMessageId: row.providerMessageId,
      metaDebug,
      metaErrorCode,
      metaErrorMessage,
      metaErrorType,
      metaErrorData,
      metaFbtraceId,
      finalPayload,
      metaFullError,
    };
  }

  async getLastCampaignLog(campaignId: string) {
    const row = await this.prisma.whatsAppMarketingCampaignLog.findFirst({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return this.formatLogRow(row);
  }

  async getLastAdminLog() {
    const row = await this.prisma.whatsAppMarketingCampaignLog.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        recipient: { select: { name: true, email: true } },
        campaign: { select: { name: true } },
      },
    });
    if (!row) return null;

    const formatted = this.formatLogRow(row);

    return {
      ...formatted,
      isWelcome: row.isWelcome,
      campaignName: row.campaign?.name ?? null,
      campaignId: row.campaignId,
    };
  }

  async getCampaignLogs(campaignId: string, limit = 200) {
    const rows = await this.prisma.whatsAppMarketingCampaignLog.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, limit),
    });
    return rows.map((row) => this.formatLogRow(row));
  }

  private async persistAdminLog(input: {
    recipientPhone: string;
    recipientName?: string;
    recipientUserId?: string;
    campaignId?: string;
    campaignType?: WhatsAppMarketingCampaignType | null;
    isWelcome?: boolean;
    message: string;
    status: WhatsAppMessageStatus;
    errorMessage: string | null;
    providerMessageId?: string | null;
  }) {
    await this.prisma.whatsAppMarketingCampaignLog.create({
      data: {
        campaignId: input.campaignId ?? null,
        recipientUserId: input.recipientUserId ?? null,
        recipientName: input.recipientName ?? null,
        recipientPhone: input.recipientPhone,
        campaignType: input.campaignType ?? null,
        message: input.message,
        status: input.status,
        errorMessage: input.errorMessage,
        providerMessageId: input.providerMessageId ?? null,
        isWelcome: input.isWelcome ?? false,
      },
    });
  }
}
