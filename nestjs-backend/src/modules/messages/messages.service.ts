import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const MESSAGE_MAX_LEN = 1000;

function sortedUserPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertParticipant(conversationId: string, userId: string) {
    const c = await this.prisma.propertyConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userLowId: true, userHighId: true },
    });
    if (!c) throw new NotFoundException('Konverzace nenalezena');
    if (c.userLowId !== userId && c.userHighId !== userId) {
      throw new ForbiddenException('Nemáte přístup k této konverzaci');
    }
    return c;
  }

  counterpartId(
    c: { userLowId: string; userHighId: string },
    viewerId: string,
  ): string {
    return c.userLowId === viewerId ? c.userHighId : c.userLowId;
  }

  async getOrCreateConversation(viewerId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { userId: true, title: true, price: true, city: true, images: true },
    });
    if (!property) {
      throw new NotFoundException('Nemovitost nenalezena');
    }
    if (property.userId === viewerId) {
      throw new BadRequestException('Nelze psát sám sobě k vlastnímu inzerátu');
    }
    const [low, high] = sortedUserPair(property.userId, viewerId);
    const conv = await this.prisma.propertyConversation.upsert({
      where: {
        propertyId_userLowId_userHighId: {
          propertyId,
          userLowId: low,
          userHighId: high,
        },
      },
      create: {
        propertyId,
        userLowId: low,
        userHighId: high,
      },
      update: {},
      include: {
        property: {
          select: {
            id: true,
            title: true,
            price: true,
            city: true,
            images: true,
            userId: true,
          },
        },
      },
    });
    return conv;
  }

  async sendMessage(viewerId: string, conversationId: string, bodyRaw: string) {
    const body = bodyRaw.trim();
    if (!body.length) {
      throw new BadRequestException('Zpráva nesmí být prázdná');
    }
    if (body.length > MESSAGE_MAX_LEN) {
      throw new BadRequestException(
        `Zpráva může mít maximálně ${MESSAGE_MAX_LEN} znaků`,
      );
    }
    await this.assertParticipant(conversationId, viewerId);
    const msg = await this.prisma.propertyMessage.create({
      data: {
        conversationId,
        senderId: viewerId,
        body,
      },
    });
    await this.prisma.propertyConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return msg;
  }

  async markConversationRead(viewerId: string, conversationId: string) {
    await this.assertParticipant(conversationId, viewerId);
    await this.prisma.propertyMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: viewerId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async unreadCount(viewerId: string): Promise<number> {
    return this.prisma.propertyMessage.count({
      where: {
        readAt: null,
        senderId: { not: viewerId },
        conversation: {
          OR: [{ userLowId: viewerId }, { userHighId: viewerId }],
        },
      },
    });
  }

  async listConversations(
    viewerId: string,
    folder: 'inbox' | 'sent' | 'all' = 'all',
  ) {
    const rows = await this.prisma.propertyConversation.findMany({
      where: {
        OR: [{ userLowId: viewerId }, { userHighId: viewerId }],
        messages: { some: {} },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            price: true,
            city: true,
            images: true,
            userId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const enriched = await Promise.all(
      rows.map(async (c) => {
        const unread = await this.prisma.propertyMessage.count({
          where: {
            conversationId: c.id,
            readAt: null,
            senderId: { not: viewerId },
          },
        });
        const last = c.messages[0];
        const otherId = this.counterpartId(c, viewerId);
        const other = await this.prisma.user.findUnique({
          where: { id: otherId },
          select: { id: true, name: true, email: true },
        });
        const cover =
          c.property.images?.[0]?.trim() ||
          (await this.prisma.propertyMedia.findFirst({
            where: { propertyId: c.propertyId, type: 'image' },
            orderBy: { sortOrder: 'asc' },
            select: { url: true },
          }))?.url ||
          null;
        return {
          id: c.id,
          propertyId: c.propertyId,
          propertyTitle: c.property.title,
          propertyPrice: c.property.price,
          propertyCity: c.property.city,
          propertyImageUrl: cover,
          counterpart: {
            id: other?.id ?? otherId,
            name: other?.name ?? null,
            email: other?.email ?? '',
          },
          lastMessage: last
            ? {
                body: last.body,
                createdAt: last.createdAt.toISOString(),
                senderId: last.senderId,
              }
            : null,
          unreadCount: unread,
        };
      }),
    );

    if (folder === 'all') return enriched;
    return enriched.filter((e) => {
      const last = e.lastMessage;
      if (!last) return false;
      if (folder === 'inbox') {
        return e.unreadCount > 0 || last.senderId !== viewerId;
      }
      return e.unreadCount === 0 && last.senderId === viewerId;
    });
  }

  async getConversationDetail(viewerId: string, conversationId: string) {
    const c = await this.prisma.propertyConversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ userLowId: viewerId }, { userHighId: viewerId }],
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            price: true,
            city: true,
            images: true,
            userId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            senderId: true,
            createdAt: true,
            readAt: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Konverzace nenalezena');

    const otherId = this.counterpartId(c, viewerId);
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, name: true, email: true },
    });
    const cover =
      c.property.images?.[0]?.trim() ||
      (await this.prisma.propertyMedia.findFirst({
        where: { propertyId: c.propertyId, type: 'image' },
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      }))?.url ||
      null;

    return {
      id: c.id,
      property: {
        id: c.property.id,
        title: c.property.title,
        price: c.property.price,
        city: c.property.city,
        imageUrl: cover,
      },
      counterpart: {
        id: other?.id ?? otherId,
        name: other?.name ?? null,
        email: other?.email ?? '',
      },
      messages: c.messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      })),
    };
  }
}
