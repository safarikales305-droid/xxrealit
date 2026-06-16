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

const GRAPH_BASE = 'https://graph.facebook.com';

export type MetaWhatsAppErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
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
    },
  ): Promise<{
    providerMessageId: string | null;
    attempt: MetaSendAttempt;
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

    this.logger.log(`[WhatsApp Meta] POST ${requestUrl}`);
    this.logger.log(
      `[WhatsApp Meta] phoneNumberId=${phoneNumberId} tokenSource=${tokenSource} tokenLen=${token.length}`,
    );
    this.logger.log(`[WhatsApp Meta] request body: ${JSON.stringify(requestBody)}`);

    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: MetaWhatsAppErrorBody;
    };

    this.logger.log(`[WhatsApp Meta] response status: ${res.status}`);
    this.logger.log(`[WhatsApp Meta] response body: ${JSON.stringify(responseBody)}`);

    const attempt: MetaSendAttempt = {
      requestUrl,
      requestBody,
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
      const errorDetail = {
        message: err?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`,
        code: err?.code ?? res.status,
        type: err?.type ?? 'http_error',
        error_subcode: err?.error_subcode,
        fbtrace_id: err?.fbtrace_id,
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
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: JSON.stringify(errorDetail),
        providerMessageId: null,
      });

      throw new BadRequestException(errorDetail);
    }

    await this.persistAdminLog({
      recipientPhone: logMeta?.recipientPhone ?? String(requestBody.to ?? ''),
      recipientName: logMeta?.recipientName,
      recipientUserId: logMeta?.recipientUserId,
      campaignId: logMeta?.campaignId,
      campaignType: logMeta?.campaignType ?? null,
      isWelcome: logMeta?.isWelcome,
      message: logMessage,
      status: WhatsAppMessageStatus.SENT,
      errorMessage: JSON.stringify({ success: true, attempt }),
      providerMessageId,
    });

    return { providerMessageId, attempt };
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

    let metaDebug: unknown = null;
    if (row.errorMessage) {
      try {
        metaDebug = JSON.parse(row.errorMessage);
      } catch {
        metaDebug = { raw: row.errorMessage };
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
    return rows.map((row) => {
      let metaDebug: unknown = null;
      if (row.errorMessage) {
        try {
          metaDebug = JSON.parse(row.errorMessage);
        } catch {
          metaDebug = { raw: row.errorMessage };
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
      };
    });
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
