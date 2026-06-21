import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WebPushService } from '../web-push/web-push.service';
import { toPrismaInputJson } from './prisma-json.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushService,
  ) {}

  async create(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const row = await this.prisma.userNotification.create({
      data: {
        userId,
        type,
        title,
        body,
        ...(data != null ? { data: toPrismaInputJson(data) } : {}),
      },
    });

    void this.webPush
      .sendForInAppNotification(userId, { title, body, type, data })
      .catch((err) => {
        this.logger.warn(
          `[notifications] web push failed userId=${userId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });

    return row;
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
