import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from './notifications.service';

const PREFIX = '[Nabídka služeb makléře]';
const USER_MESSAGE_MAX = 900;

@Injectable()
export class BrokerLeadOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
  ) {}

  async submitOwnerLeadOffer(brokerId: string, propertyId: string, messageRaw: string) {
    const text = messageRaw.trim();
    if (text.length < 10) {
      throw new BadRequestException('Zpráva musí mít alespoň 10 znaků.');
    }
    if (text.length > USER_MESSAGE_MAX) {
      throw new BadRequestException(`Zpráva může mít maximálně ${USER_MESSAGE_MAX} znaků.`);
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        userId: true,
        isOwnerListing: true,
        title: true,
        city: true,
        deletedAt: true,
      },
    });
    if (!property || property.deletedAt) {
      throw new NotFoundException('Nemovitost nenalezena');
    }
    if (!property.isOwnerListing) {
      throw new BadRequestException('Tato akce platí jen pro inzeráty od přímého vlastníka.');
    }
    if (property.userId === brokerId) {
      throw new BadRequestException('Nelze oslovit sám sebe.');
    }

    const broker = await this.prisma.user.findUnique({
      where: { id: brokerId },
      select: {
        role: true,
        isPremiumBroker: true,
        brokerFreeLeads: true,
      },
    });
    if (!broker || broker.role !== UserRole.AGENT) {
      throw new ForbiddenException('Oslovování vlastníků je určeno makléřům (účet AGENT).');
    }

    const existing = await this.prisma.brokerLeadOffer.findUnique({
      where: {
        brokerId_propertyId: { brokerId, propertyId },
      },
    });

    const conv = await this.messages.getOrCreateConversation(brokerId, propertyId);

    if (!existing) {
      if (!broker.isPremiumBroker) {
        if (broker.brokerFreeLeads <= 0) {
          throw new ForbiddenException(
            'Pro oslovení vlastníka potřebujete prémiový účet makléře nebo dostupné odměnové leady (body).',
          );
        }
      }

      const body = `${PREFIX}\n\n${text}`;
      await this.messages.sendMessage(brokerId, conv.id, body);

      if (!broker.isPremiumBroker) {
        await this.prisma.user.update({
          where: { id: brokerId },
          data: { brokerFreeLeads: { decrement: 1 } },
        });
      }

      await this.prisma.brokerLeadOffer.create({
        data: {
          brokerId,
          propertyId,
          usedFreeLead: !broker.isPremiumBroker,
        },
      });

      await this.notifications.create(
        property.userId,
        'BROKER_LEAD',
        'Nová nabídka od makléře',
        `Makléř vám nabízí služby k inzerátu „${property.title}“ (${property.city}).`,
        { propertyId, brokerId },
      );

      return { ok: true, firstOffer: true, usedFreeLead: !broker.isPremiumBroker };
    }

    await this.messages.sendMessage(brokerId, conv.id, text);
    return { ok: true, firstOffer: false, usedFreeLead: false };
  }
}
