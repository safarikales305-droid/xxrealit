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
    const url = listingUrl?.trim();
    if (url) {
      return `Dobrý den, mám zájem o tento inzerát:\n${url}`;
    }
    const title = listingTitle?.trim() || 'inzerát na xxrealit';
    return `Dobrý den, mám zájem o tento inzerát:\n${title}`;
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

}
