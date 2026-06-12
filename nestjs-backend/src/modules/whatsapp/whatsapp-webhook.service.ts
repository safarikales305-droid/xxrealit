import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';

type MetaWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type MetaWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        messages?: MetaWebhookMessage[];
        statuses?: MetaWebhookStatus[];
        errors?: Array<{ code?: number; title?: string; message?: string }>;
      };
    }>;
  }>;
};

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly config: WhatsAppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Meta webhook verification (GET).
   * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
   */
  verifySubscription(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): { ok: true; challenge: string } | { ok: false } {
    const expected =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
      this.config.getWebhookVerifyToken();

    if (!expected) {
      this.logger.error(
        '[WhatsApp Webhook] GET verify failed: WHATSAPP_WEBHOOK_VERIFY_TOKEN není nastaven.',
      );
      return { ok: false };
    }

    if (!verifyToken || verifyToken !== expected) {
      this.logger.warn(
        `[WhatsApp Webhook] GET verify failed: neplatný hub.verify_token (mode=${mode ?? '—'}).`,
      );
      return { ok: false };
    }

    if (!challenge?.trim()) {
      this.logger.warn('[WhatsApp Webhook] GET verify failed: chybí hub.challenge.');
      return { ok: false };
    }

    this.logger.log(
      `[WhatsApp Webhook] Ověření úspěšné (hub.mode=${mode ?? '—'}).`,
    );
    return { ok: true, challenge: challenge.trim() };
  }

  /**
   * Příjem událostí z Meta WhatsApp Cloud API (POST).
   * Meta vyžaduje rychlou odpověď 200 — zpracování proběhne synchronně, payload se vždy zaloguje.
   */
  async receiveWebhookPayload(body: unknown): Promise<void> {
    let serialized = '';
    try {
      serialized = JSON.stringify(body);
    } catch {
      serialized = String(body);
    }

    this.logger.log(`[WhatsApp Webhook] POST payload: ${serialized}`);

    const payload = body as MetaWebhookPayload;

    if (payload.object && payload.object !== 'whatsapp_business_account') {
      this.logger.warn(
        `[WhatsApp Webhook] Neočekávaný object="${payload.object}" — payload zalogován.`,
      );
    }

    const configuredBusinessId = this.config.getBusinessAccountId();
    const configuredPhoneNumberId = this.config.getPhoneNumberId();

    for (const entry of payload.entry ?? []) {
      if (
        configuredBusinessId &&
        entry.id &&
        entry.id !== configuredBusinessId
      ) {
        this.logger.warn(
          `[WhatsApp Webhook] entry.id=${entry.id} neodpovídá WHATSAPP_BUSINESS_ACCOUNT_ID.`,
        );
      }

      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id?.trim();
        if (
          configuredPhoneNumberId &&
          phoneNumberId &&
          phoneNumberId !== configuredPhoneNumberId
        ) {
          this.logger.warn(
            `[WhatsApp Webhook] phone_number_id=${phoneNumberId} neodpovídá WHATSAPP_PHONE_NUMBER_ID.`,
          );
        }

        if (value.errors?.length) {
          for (const err of value.errors) {
            this.logger.error(
              `[WhatsApp Webhook] API error: ${err.title ?? ''} ${err.message ?? ''} (code=${err.code ?? '—'})`,
            );
          }
        }

        for (const msg of value.messages ?? []) {
          await this.persistInboundMessage(msg, phoneNumberId);
        }

        for (const st of value.statuses ?? []) {
          await this.persistDeliveryStatus(st);
        }
      }
    }
  }

  private async persistInboundMessage(
    msg: MetaWebhookMessage,
    businessPhoneNumberId?: string,
  ) {
    const from = msg.from?.trim() || '';
    const providerId = msg.id?.trim() || null;
    const msgType = msg.type?.trim() || 'unknown';

    let text = msg.text?.body?.trim() || '';
    if (!text && msgType !== 'text') {
      text = `[${msgType}]`;
    }
    if (!from && !text && !providerId) return;

    if (providerId) {
      const existing = await this.prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: providerId },
        select: { id: true },
      });
      if (existing) return;
    }

    await this.prisma.whatsAppMessage.create({
      data: {
        direction: WhatsAppMessageDirection.INBOUND,
        fromPhone: from,
        toPhone: businessPhoneNumberId ?? '',
        message: text,
        status: WhatsAppMessageStatus.RECEIVED,
        providerMessageId: providerId,
      },
    });

    this.logger.log(
      `[WhatsApp Webhook] INBOUND from=${from} type=${msgType} id=${providerId ?? '—'}`,
    );
  }

  private async persistDeliveryStatus(st: MetaWebhookStatus) {
    const providerId = st.id?.trim();
    if (!providerId) return;

    const mapped = this.mapDeliveryStatus(st.status);
    if (!mapped) return;

    const updated = await this.prisma.whatsAppMessage.updateMany({
      where: { providerMessageId: providerId },
      data: { status: mapped },
    });

    if (st.status === 'failed' && st.errors?.length) {
      const errText = st.errors
        .map((e) => e.message || e.title || String(e.code ?? ''))
        .filter(Boolean)
        .join('; ');
      if (errText) {
        await this.prisma.whatsAppMessage.updateMany({
          where: { providerMessageId: providerId },
          data: { message: errText },
        });
      }
      this.logger.error(
        `[WhatsApp Webhook] DELIVERY FAILED id=${providerId}: ${errText || 'unknown'}`,
      );
    } else {
      this.logger.log(
        `[WhatsApp Webhook] STATUS id=${providerId} → ${st.status} (updated=${updated.count})`,
      );
    }
  }

  private mapDeliveryStatus(raw?: string): WhatsAppMessageStatus | null {
    switch ((raw ?? '').toLowerCase()) {
      case 'sent':
        return WhatsAppMessageStatus.SENT;
      case 'delivered':
        return WhatsAppMessageStatus.DELIVERED;
      case 'read':
        return WhatsAppMessageStatus.READ;
      case 'failed':
        return WhatsAppMessageStatus.FAILED;
      default:
        return null;
    }
  }
}
