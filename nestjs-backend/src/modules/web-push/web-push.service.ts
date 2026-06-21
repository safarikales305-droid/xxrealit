import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import {
  resolveVapidConfig,
  VAPID_SETUP_INSTRUCTIONS,
} from './vapid-config.util';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const vapid = resolveVapidConfig(this.config);
    if (vapid.configured) {
      this.logger.log('[web-push] VAPID klíče nakonfigurovány');
    } else {
      this.logger.warn(`[web-push] VAPID není připraveno: ${vapid.issues.join('; ')}`);
    }
  }

  private vapid() {
    return resolveVapidConfig(this.config);
  }

  getVapidPublicKey(): string | null {
    return this.vapid().publicKey;
  }

  isConfigured(): boolean {
    return this.vapid().configured;
  }

  getAdminStatus() {
    const vapid = this.vapid();
    return {
      configured: vapid.configured,
      issues: vapid.issues,
      hasPublicKey: Boolean(vapid.publicKey),
      hasPrivateKey: Boolean(vapid.privateKey),
      subject: vapid.subject,
      instructions: [...VAPID_SETUP_INSTRUCTIONS],
    };
  }

  async getNotificationPrefs(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyNewPosts: true,
        notifyNewMessages: true,
        notifyWhatsAppAlerts: true,
        notifyPwaPush: true,
      },
    });
    if (!user) return null;
    return {
      notifyNewPosts: user.notifyNewPosts,
      notifyNewMessages: user.notifyNewMessages,
      notifyWhatsAppAlerts: user.notifyWhatsAppAlerts,
      notifyPwaPush: user.notifyPwaPush,
      pushConfigured: this.isConfigured(),
      pushSubscribed: await this.prisma.webPushSubscription
        .count({ where: { userId } })
        .then((n) => n > 0),
      pushSetupIssues: this.vapid().issues,
      pushSetupInstructions: this.isConfigured() ? [] : [...VAPID_SETUP_INSTRUCTIONS],
    };
  }

  async updateNotificationPrefs(
    userId: string,
    input: {
      notifyNewPosts?: boolean;
      notifyNewMessages?: boolean;
      notifyWhatsAppAlerts?: boolean;
      notifyPwaPush?: boolean;
    },
  ) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.notifyNewPosts !== undefined ? { notifyNewPosts: input.notifyNewPosts } : {}),
        ...(input.notifyNewMessages !== undefined
          ? { notifyNewMessages: input.notifyNewMessages }
          : {}),
        ...(input.notifyWhatsAppAlerts !== undefined
          ? { notifyWhatsAppAlerts: input.notifyWhatsAppAlerts }
          : {}),
        ...(input.notifyPwaPush !== undefined ? { notifyPwaPush: input.notifyPwaPush } : {}),
      },
      select: {
        notifyNewPosts: true,
        notifyNewMessages: true,
        notifyWhatsAppAlerts: true,
        notifyPwaPush: true,
      },
    });

    if (input.notifyPwaPush === false) {
      await this.prisma.webPushSubscription.deleteMany({ where: { userId } });
    }

    return {
      ...updated,
      pushConfigured: this.isConfigured(),
      pushSubscribed: await this.prisma.webPushSubscription
        .count({ where: { userId } })
        .then((n) => n > 0),
      pushSetupIssues: this.vapid().issues,
      pushSetupInstructions: this.isConfigured() ? [] : [...VAPID_SETUP_INSTRUCTIONS],
    };
  }

  async subscribe(userId: string, input: { endpoint: string; p256dh: string; auth: string }) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Web push není na serveru nakonfigurován (chybí VAPID klíče).',
      );
    }

    await this.prisma.webPushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: input.endpoint },
      },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { notifyPwaPush: true },
    });

    this.logger.log(`WEB_PUSH_SUBSCRIBE userId=${userId}`);
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint?: string) {
    if (endpoint?.trim()) {
      await this.prisma.webPushSubscription.deleteMany({
        where: { userId, endpoint: endpoint.trim() },
      });
    } else {
      await this.prisma.webPushSubscription.deleteMany({ where: { userId } });
    }
    return { ok: true };
  }
}
