import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildWaMeUrl, isValidWhatsAppPhone } from './whatsapp-phone.util';
import { WhatsAppConfigService } from './whatsapp-config.service';
import type { WhatsAppClickDto } from './dto/whatsapp-click.dto';
import type { WhatsAppSendDto } from './dto/whatsapp-send.dto';

const GRAPH_BASE = 'https://graph.facebook.com';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
  ) {}

  getConfigStatus() {
    return this.config.getConfigStatus();
  }

  async getAdminStats() {
    const [messageCount, clickCount, recentErrors] = await Promise.all([
      this.prisma.whatsAppMessage.count(),
      this.prisma.whatsAppMessage.count({
        where: { status: WhatsAppMessageStatus.WA_ME_CLICK },
      }),
      this.prisma.whatsAppMessage.findMany({
        where: { status: WhatsAppMessageStatus.FAILED },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          message: true,
          toPhone: true,
          createdAt: true,
          providerMessageId: true,
        },
      }),
    ]);

    return {
      ...this.getConfigStatus(),
      messageCount,
      clickCount,
      recentErrors: recentErrors.map((r) => ({
        id: r.id,
        message: r.message,
        toPhone: r.toPhone,
        providerMessageId: r.providerMessageId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  buildPrefillMessage(listingTitle?: string, listingUrl?: string): string {
    const title = listingTitle?.trim() || 'inzerát na xxrealit';
    const url = listingUrl?.trim();
    if (url) {
      return `Dobrý den, mám zájem o inzerát: ${title} ${url}`;
    }
    return `Dobrý den, mám zájem o inzerát: ${title}`;
  }

  async logWaMeClick(dto: WhatsAppClickDto, visitorPhone?: string) {
    const seller = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId },
      select: {
        id: true,
        whatsappPhone: true,
        whatsappEnabled: true,
      },
    });

    if (!seller?.whatsappEnabled || !seller.whatsappPhone?.trim()) {
      throw new NotFoundException('WhatsApp kontakt není k dispozici.');
    }

    const phone = seller.whatsappPhone.trim();
    if (!isValidWhatsAppPhone(phone)) {
      throw new BadRequestException('WhatsApp číslo prodejce není platné.');
    }

    if (dto.listingId) {
      const listing = await this.prisma.property.findFirst({
        where: { id: dto.listingId, userId: seller.id, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!listing) {
        throw new NotFoundException('Inzerát nenalezen.');
      }
    }

    const text = this.buildPrefillMessage(dto.listingTitle, dto.listingUrl);
    const url = buildWaMeUrl(phone, text);

    await this.prisma.whatsAppMessage.create({
      data: {
        userId: seller.id,
        listingId: dto.listingId ?? null,
        direction: WhatsAppMessageDirection.OUTBOUND,
        fromPhone: visitorPhone?.trim() || '',
        toPhone: phone,
        message: text,
        status: WhatsAppMessageStatus.WA_ME_CLICK,
      },
    });

    return { url, whatsappEnabled: true };
  }

  async sendCloudMessage(dto: WhatsAppSendDto) {
    if (!this.config.isCloudApiConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp Cloud API není nakonfigurováno. Doplňte env proměnné v Railway.',
      );
    }

    const token = this.config.getAccessToken()!;
    const phoneNumberId = this.config.getPhoneNumberId()!;
    const apiVersion = this.config.getApiVersion();
    const toDigits = dto.toPhone.replace(/\D/g, '');

    const res = await fetch(
      `${GRAPH_BASE}/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toDigits,
          type: 'text',
          text: { body: dto.message },
        }),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    const providerMessageId = data.messages?.[0]?.id?.trim() || null;
    const status = res.ok
      ? WhatsAppMessageStatus.SENT
      : WhatsAppMessageStatus.FAILED;
    const errorText = data.error?.message?.trim();

    const row = await this.prisma.whatsAppMessage.create({
      data: {
        userId: dto.userId ?? null,
        listingId: dto.listingId ?? null,
        direction: WhatsAppMessageDirection.OUTBOUND,
        fromPhone: '',
        toPhone: dto.toPhone,
        message: dto.message,
        status,
        providerMessageId,
      },
    });

    if (!res.ok) {
      throw new BadRequestException(
        errorText || `WhatsApp API vrátilo HTTP ${res.status}.`,
      );
    }

    return {
      ok: true,
      id: row.id,
      providerMessageId,
    };
  }

  async handleWebhookPayload(body: unknown) {
    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id?: string;
              from?: string;
              text?: { body?: string };
            }>;
            statuses?: Array<{
              id?: string;
              status?: string;
              recipient_id?: string;
            }>;
          };
        }>;
      }>;
    };

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const msg of value.messages ?? []) {
          const from = msg.from?.trim() || '';
          const text = msg.text?.body?.trim() || '';
          const providerId = msg.id?.trim() || null;
          if (!from && !text) continue;

          const existing = providerId
            ? await this.prisma.whatsAppMessage.findFirst({
                where: { providerMessageId: providerId },
                select: { id: true },
              })
            : null;
          if (existing) continue;

          await this.prisma.whatsAppMessage.create({
            data: {
              direction: WhatsAppMessageDirection.INBOUND,
              fromPhone: from,
              toPhone: '',
              message: text,
              status: WhatsAppMessageStatus.RECEIVED,
              providerMessageId: providerId,
            },
          });
        }

        for (const st of value.statuses ?? []) {
          const providerId = st.id?.trim();
          if (!providerId) continue;
          const mapped = this.mapDeliveryStatus(st.status);
          if (!mapped) continue;

          await this.prisma.whatsAppMessage.updateMany({
            where: { providerMessageId: providerId },
            data: { status: mapped },
          });
        }
      }
    }

    return { ok: true };
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
