import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    return this.prisma.userNotification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ?? undefined,
      },
    });
  }

  async listForUser(userId: string, take = 50) {
    return this.prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const row = await this.prisma.userNotification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!row) return null;
    return this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.userNotification.count({
      where: { userId, readAt: null },
    });
  }
}
