import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityLogCategory,
  UserRole,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from '../whatsapp/whatsapp-config.service';
import { buildWaMeUrl, isValidWhatsAppPhone } from '../whatsapp/whatsapp-phone.util';
import { ActivityLogService } from './activity-log.service';
import { isCommunicationRole } from './communication.constants';
import type {
  CommunicationWhatsAppListingLeadsDto,
  CommunicationWhatsAppSendDto,
} from './dto/communication-whatsapp.dto';

const GRAPH_BASE = 'https://graph.facebook.com';

@Injectable()
export class CommunicationWhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private assertAccess(role: UserRole) {
    if (!isCommunicationRole(role)) {
      throw new ForbiddenException('WhatsApp centrum je dostupné jen pro profesionální účty.');
    }
  }

  private normalizePhone(phone: string): string {
    const trimmed = phone.trim();
    if (trimmed.startsWith('+')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.startsWith('420')) return `+${digits}`;
    if (digits.length === 9) return `+420${digits}`;
    return `+${digits}`;
  }

  async listMessages(
    userId: string,
    role: UserRole,
    filters: { listingId?: string; contactPhone?: string; limit?: number },
  ) {
    this.assertAccess(role);
    const where: Record<string, unknown> = {
      OR: [{ userId }, { sentByUserId: userId }],
    };
    if (filters.listingId) where.listingId = filters.listingId;
    if (filters.contactPhone?.trim()) {
      const phone = this.normalizePhone(filters.contactPhone);
      where.toPhone = { contains: phone.replace(/\D/g, '').slice(-9) };
    }

    const rows = await this.prisma.whatsAppMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 100, 200),
      include: {
        listing: { select: { id: true, title: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      phone: r.toPhone,
      recipientName: r.recipientName,
      message: r.message,
      status: r.status,
      direction: r.direction,
      listingId: r.listingId,
      listingTitle: r.listing?.title ?? null,
      createdAt: r.createdAt.toISOString(),
      delivered: ['DELIVERED', 'READ', 'SENT', 'WA_ME_CLICK'].includes(r.status),
    }));
  }

  async sendMessage(userId: string, role: UserRole, dto: CommunicationWhatsAppSendDto) {
    this.assertAccess(role);
    const toPhone = this.normalizePhone(dto.toPhone);
    if (!isValidWhatsAppPhone(toPhone)) {
      throw new BadRequestException('Telefonní číslo není platné pro WhatsApp.');
    }

    if (dto.listingId) {
      const listing = await this.prisma.property.findFirst({
        where: { id: dto.listingId, userId, deletedAt: null },
      });
      if (!listing) throw new NotFoundException('Inzerát nenalezen.');
    }

    let status: WhatsAppMessageStatus = WhatsAppMessageStatus.PENDING;
    let providerMessageId: string | null = null;
    let waUrl: string | null = null;

    if (this.config.isCloudApiConfigured()) {
      const token = this.config.getAccessToken()!;
      const phoneNumberId = this.config.getPhoneNumberId()!;
      const apiVersion = this.config.getApiVersion();
      const toDigits = toPhone.replace(/\D/g, '');
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
      providerMessageId = data.messages?.[0]?.id?.trim() || null;
      status = res.ok ? WhatsAppMessageStatus.SENT : WhatsAppMessageStatus.FAILED;
      if (!res.ok) {
        throw new BadRequestException(data.error?.message || 'Odeslání WhatsApp selhalo.');
      }
    } else {
      waUrl = buildWaMeUrl(toPhone, dto.message);
      status = WhatsAppMessageStatus.WA_ME_CLICK;
    }

    const row = await this.prisma.whatsAppMessage.create({
      data: {
        userId,
        sentByUserId: userId,
        listingId: dto.listingId ?? null,
        recipientName: dto.recipientName?.trim() || null,
        direction: WhatsAppMessageDirection.OUTBOUND,
        toPhone,
        message: dto.message,
        status,
        providerMessageId,
      },
    });

    await this.activityLog.log({
      category: ActivityLogCategory.WHATSAPP,
      userId,
      listingId: dto.listingId ?? null,
      message: `WhatsApp zpráva → ${toPhone}`,
      metadata: { messageId: row.id, status },
    });

    await this.prisma.crmContact.updateMany({
      where: { ownerUserId: userId, phone: { contains: toPhone.replace(/\D/g, '').slice(-9) } },
      data: { lastContactAt: new Date() },
    });

    return { ok: true, id: row.id, status, waUrl };
  }

  async sendToListingLeads(
    userId: string,
    role: UserRole,
    dto: CommunicationWhatsAppListingLeadsDto,
  ) {
    this.assertAccess(role);
    const listing = await this.prisma.property.findFirst({
      where: { id: dto.listingId, userId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!listing) throw new NotFoundException('Inzerát nenalezen.');

    const leads = await this.prisma.contactLead.findMany({
      where: { listingId: dto.listingId, ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!leads.length) {
      throw new BadRequestException('U tohoto inzerátu nejsou žádní zájemci s telefonem.');
    }

    const results: Array<{ leadId: string; name: string; phone: string; ok: boolean; error?: string; waUrl?: string }> = [];
    for (const lead of leads) {
      if (!lead.phone?.trim()) {
        results.push({ leadId: lead.id, name: lead.name, phone: '', ok: false, error: 'Chybí telefon' });
        continue;
      }
      try {
        const res = await this.sendMessage(userId, role, {
          toPhone: lead.phone,
          recipientName: lead.name,
          message: dto.message,
          listingId: dto.listingId,
        });
        results.push({
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
          ok: true,
          waUrl: res.waUrl ?? undefined,
        });
      } catch (err) {
        results.push({
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
          ok: false,
          error: err instanceof Error ? err.message : 'Chyba',
        });
      }
    }

    return {
      ok: true,
      listingId: dto.listingId,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async countForUser(userId: string) {
    return this.prisma.whatsAppMessage.count({
      where: { OR: [{ userId }, { sentByUserId: userId }] },
    });
  }

  async countAll() {
    return this.prisma.whatsAppMessage.count();
  }
}
