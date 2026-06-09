import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../premium-broker/notifications.service';
import { UnlockListingContactDto } from './dto/unlock-listing-contact.dto';

function normalizePhone(phone: string): string {
  return phone.trim();
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function contactPayload(row: {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}) {
  return {
    contactName: row.contactName?.trim() || null,
    phone: row.contactPhone?.trim() || null,
    email: row.contactEmail?.trim() || null,
  };
}

@Injectable()
export class ListingContactUnlockService {
  private readonly logger = new Logger(ListingContactUnlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messages: MessagesService,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  async resolveUnlockPrice(property: {
    id: string;
    isTiparTip: boolean;
    isContactPaid: boolean;
    contactUnlockPrice: number;
  }): Promise<number> {
    if (property.isTiparTip) {
      const tip = await this.prisma.tiparPost.findFirst({
        where: { publishedPropertyId: property.id, deletedAt: null },
        select: { contactUnlockPrice: true },
      });
      return Math.max(0, tip?.contactUnlockPrice ?? 0);
    }
    if (property.isContactPaid) {
      return Math.max(0, property.contactUnlockPrice);
    }
    return 0;
  }

  async hasUnlocked(
    userId: string | undefined,
    propertyId: string,
    isTiparTip: boolean,
  ): Promise<boolean> {
    if (!userId) return false;
    const listingUnlock = await this.prisma.listingContactUnlock.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (listingUnlock) return true;
    if (!isTiparTip) return false;
    const tip = await this.prisma.tiparPost.findFirst({
      where: { publishedPropertyId: propertyId, deletedAt: null },
      select: { id: true },
    });
    if (!tip) return false;
    const tipUnlock = await this.prisma.contactUnlock.findUnique({
      where: { userId_tiparPostId: { userId, tiparPostId: tip.id } },
    });
    return Boolean(tipUnlock);
  }

  private validateLead(dto: UnlockListingContactDto) {
    const name = dto.name?.trim() ?? '';
    const email = dto.email?.trim().toLowerCase() ?? '';
    const phone = normalizePhone(dto.phone ?? '');
    if (name.length < 2) {
      throw new BadRequestException('Vyplňte jméno.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Vyplňte platný e-mail.');
    }
    if (!phone || !isValidPhone(phone)) {
      throw new BadRequestException('Vyplňte platné telefonní číslo.');
    }
    return { name, email, phone };
  }

  async unlockContact(buyerUserId: string, propertyId: string, dto: UnlockListingContactDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        title: true,
        city: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        isTiparTip: true,
        isContactPaid: true,
        contactUnlockPrice: true,
      },
    });
    if (!property) throw new NotFoundException('Inzerát nenalezen');

    const contact = contactPayload(property);
    if (!contact.phone && !contact.email) {
      throw new BadRequestException('U tohoto inzerátu není k dispozici kontakt.');
    }

    if (property.userId === buyerUserId) {
      return {
        phone: contact.phone,
        email: contact.email,
        contactName: contact.contactName,
        alreadyUnlocked: true,
        creditCharged: 0,
      };
    }

    const alreadyUnlocked = await this.hasUnlocked(
      buyerUserId,
      propertyId,
      property.isTiparTip,
    );
    if (alreadyUnlocked) {
      return {
        phone: contact.phone,
        email: contact.email,
        contactName: contact.contactName,
        alreadyUnlocked: true,
        creditCharged: 0,
      };
    }

    const lead = this.validateLead(dto);
    const price = await this.resolveUnlockPrice(property);

    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerUserId },
      select: { creditBalance: true, name: true, email: true },
    });
    if (!buyer) throw new NotFoundException('Uživatel nenalezen');

    if (price > 0 && buyer.creditBalance < price) {
      throw new ForbiddenException({
        message: 'Nemáte dostatek kreditu. Dobijte si kredit.',
        code: 'INSUFFICIENT_CREDIT',
        required: price,
        creditBalance: buyer.creditBalance,
      });
    }

    const tip =
      property.isTiparTip
        ? await this.prisma.tiparPost.findFirst({
            where: { publishedPropertyId: property.id, deletedAt: null },
            select: { id: true, userId: true },
          })
        : null;

    const creditRecipientId = tip?.userId ?? property.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.listingContactUnlock.create({
        data: {
          userId: buyerUserId,
          propertyId,
          amount: price,
        },
      });

      if (tip) {
        await tx.contactUnlock.create({
          data: {
            userId: buyerUserId,
            tiparPostId: tip.id,
            amount: price,
          },
        });
        if (price > 0) {
          await tx.creditTransaction.create({
            data: {
              buyerUserId,
              tiparUserId: tip.userId,
              tiparPostId: tip.id,
              amount: price,
              type: 'CONTACT_UNLOCK',
            },
          });
        }
      }

      if (price > 0) {
        await tx.user.update({
          where: { id: buyerUserId },
          data: { creditBalance: { decrement: price } },
        });
        await tx.user.update({
          where: { id: creditRecipientId },
          data: { creditBalance: { increment: price } },
        });
        await tx.creditLedger.create({
          data: {
            userId: buyerUserId,
            amount: -price,
            type: 'CONTACT_UNLOCK',
            referenceId: propertyId,
            description: `Odemčení kontaktu: ${property.title}`,
          },
        });
      }

      await tx.contactLead.create({
        data: {
          listingId: propertyId,
          tipId: tip?.id ?? null,
          interestedUserId: buyerUserId,
          ownerUserId: property.userId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          unlockPrice: price,
          creditCharged: price > 0,
        },
      });
    });

    await this.notifyOwner({
      buyerUserId,
      ownerUserId: property.userId,
      propertyId: property.id,
      propertyTitle: property.title,
      lead,
    });

    return {
      phone: contact.phone,
      email: contact.email,
      contactName: contact.contactName,
      alreadyUnlocked: false,
      creditCharged: price,
    };
  }

  private async notifyOwner(input: {
    buyerUserId: string;
    ownerUserId: string;
    propertyId: string;
    propertyTitle: string;
    lead: { name: string; email: string; phone: string };
  }) {
    const listingUrl = this.listingUrl(input.propertyId);
    const now = new Date();
    const dateStr = now.toLocaleDateString('cs-CZ');
    const timeStr = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

    try {
      await this.notifications.create(
        input.ownerUserId,
        'CONTACT_LEAD',
        'Zájemce o váš inzerát',
        'Uživatel projevil zájem o váš inzerát a zobrazil si kontakt.',
        {
          propertyId: input.propertyId,
          listingUrl,
          leadName: input.lead.name,
          leadEmail: input.lead.email,
          leadPhone: input.lead.phone,
          date: dateStr,
          time: timeStr,
        },
      );
    } catch (err) {
      this.logger.warn(`Notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const buyerConv = await this.messages.getOrCreateConversation(
        input.buyerUserId,
        input.propertyId,
      );
      await this.messages.sendMessage(
        input.buyerUserId,
        buyerConv.id,
        [
          '[Kontakt odemčen]',
          `Jméno: ${input.lead.name}`,
          `E-mail: ${input.lead.email}`,
          `Telefon: ${input.lead.phone}`,
          '',
          'Uživatel projevil zájem o váš inzerát a zobrazil si kontakt.',
          `Inzerát: ${listingUrl}`,
          `Datum: ${dateStr} ${timeStr}`,
        ].join('\n'),
      );
    } catch (err) {
      this.logger.warn(`Internal message failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const owner = await this.prisma.user.findUnique({
        where: { id: input.ownerUserId },
        select: { email: true, name: true },
      });
      if (owner?.email?.trim()) {
        await this.emails.sendContactLeadEmail({
          to: owner.email.trim(),
          ownerName: owner.name || 'inzerente',
          listingTitle: input.propertyTitle,
          listingUrl,
          leadName: input.lead.name,
          leadEmail: input.lead.email,
          leadPhone: input.lead.phone,
          date: dateStr,
          time: timeStr,
        });
      }
    } catch (err) {
      this.logger.warn(`Lead email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private listingUrl(propertyId: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_SITE_URL')?.trim() ||
      'https://www.xxrealit.cz';
    return `${base.replace(/\/+$/, '')}/nemovitost/${propertyId}`;
  }
}
