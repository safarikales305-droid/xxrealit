import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import {
  getWebPushClient,
  isWebPushClientReady,
} from './web-push-client.util';
import {
  resolveVapidConfig,
  VAPID_SETUP_INSTRUCTIONS,
} from './vapid-config.util';

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badge?: number;
};

type PushPref = 'messages' | 'posts' | 'any';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private vapidInitialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bootstrapVapid();
  }

  private bootstrapVapid(): void {
    try {
      if (!isWebPushClientReady()) {
        this.logger.warn('[web-push] web-push není dostupný');
        return;
      }

      const vapid = resolveVapidConfig(this.config);
      if (!vapid.configured || !vapid.publicKey || !vapid.privateKey || !vapid.subject) {
        this.logger.warn('VAPID keys missing, push notifications disabled');
        if (vapid.issues.length > 0) {
          this.logger.warn(`[web-push] ${vapid.issues.join('; ')}`);
        }
        return;
      }

      const webpush = getWebPushClient();
      if (!webpush?.setVapidDetails) {
        this.logger.warn('[web-push] web-push není dostupný');
        return;
      }

      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
      this.vapidInitialized = true;
      this.logger.log('[web-push] VAPID aktivní (setVapidDetails)');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[web-push] init selhalo — push disabled, backend pokračuje: ${message}`,
      );
      this.vapidInitialized = false;
    }
  }

  private vapid() {
    return resolveVapidConfig(this.config);
  }

  private ensureVapidReady(): boolean {
    if (this.vapidInitialized) return true;
    this.bootstrapVapid();
    return this.vapidInitialized;
  }

  getVapidPublicKey(): string | null {
    return this.vapid().publicKey;
  }

  isConfigured(): boolean {
    return this.vapid().configured && this.vapidInitialized;
  }

  getAdminStatus() {
    const vapid = this.vapid();
    return {
      configured: this.isConfigured(),
      issues: vapid.issues,
      hasPublicKey: Boolean(vapid.publicKey),
      hasPrivateKey: Boolean(vapid.privateKey),
      subject: vapid.subject,
      instructions: [...VAPID_SETUP_INSTRUCTIONS],
      vapidActive: this.isConfigured(),
      pushActive: this.isConfigured(),
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
    const pushSubscribed =
      (await this.prisma.webPushSubscription.count({ where: { userId } })) > 0;
    return {
      notifyNewPosts: user.notifyNewPosts,
      notifyNewMessages: user.notifyNewMessages,
      notifyWhatsAppAlerts: user.notifyWhatsAppAlerts,
      notifyPwaPush: user.notifyPwaPush,
      pushConfigured: this.isConfigured(),
      pushSubscribed,
      pushSetupIssues: this.vapid().issues,
      pushSetupInstructions: this.isConfigured() ? [] : [...VAPID_SETUP_INSTRUCTIONS],
      vapidActive: this.isConfigured(),
      pushActive: this.isConfigured() && pushSubscribed,
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

    const pushSubscribed =
      (await this.prisma.webPushSubscription.count({ where: { userId } })) > 0;

    return {
      ...updated,
      pushConfigured: this.isConfigured(),
      pushSubscribed,
      pushSetupIssues: this.vapid().issues,
      pushSetupInstructions: this.isConfigured() ? [] : [...VAPID_SETUP_INSTRUCTIONS],
      vapidActive: this.isConfigured(),
      pushActive: this.isConfigured() && pushSubscribed,
    };
  }

  async subscribe(
    userId: string,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
  ) {
    if (!this.ensureVapidReady()) {
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
        userAgent: input.userAgent?.slice(0, 512) || null,
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent?.slice(0, 512) || null,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { notifyPwaPush: true },
    });

    this.logger.log(`WEB_PUSH_SUBSCRIBE userId=${userId}`);
    return { ok: true, vapidActive: true, pushActive: true };
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

  async sendTestPush(userId: string) {
    await this.prisma.userNotification.create({
      data: {
        userId,
        type: 'TEST_PUSH',
        title: 'XXrealit — test push',
        body: 'PWA push notifikace fungují správně.',
      },
    });
    return this.sendToUser(
      userId,
      {
        title: 'XXrealit — test push',
        body: 'PWA push notifikace fungují správně.',
        url: '/profil/dashboard',
        tag: 'test-push',
      },
      'any',
    );
  }

  async sendForInAppNotification(
    userId: string,
    input: { title: string; body: string; type: string; data?: Record<string, unknown> },
  ) {
    const url = this.urlForNotificationType(input.type, input.data);
    if (!(await this.userAllowsPush(userId, 'any', input.type))) {
      return { sent: 0, failed: 0 };
    }
    return this.sendToUser(
      userId,
      {
        title: input.title,
        body: input.body,
        url,
        tag: input.type,
      },
      'any',
    );
  }

  async notifyNewMessage(recipientId: string, senderName: string, conversationId: string) {
    const preview = senderName.trim() ? `${senderName} vám poslal zprávu` : 'Máte novou zprávu';
    return this.sendToUser(
      recipientId,
      {
        title: 'Nová zpráva',
        body: preview,
        url: `/profil/zpravy/${conversationId}`,
        tag: `message-${conversationId}`,
      },
      'messages',
    );
  }

  async notifyFollowersNewPost(authorId: string, postId: string) {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { name: true },
    });
    const authorLabel = author?.name?.trim() || 'Sledovaný uživatel';
    const followers = await this.prisma.follow.findMany({
      where: { followingId: authorId },
      select: { followerId: true },
    });
    let sent = 0;
    for (const row of followers) {
      const r = await this.sendToUser(
        row.followerId,
        {
          title: 'Nový příspěvek',
          body: `${authorLabel} publikoval nový příspěvek`,
          url: `/post/${postId}`,
          tag: `post-${postId}`,
        },
        'posts',
      );
      sent += r.sent;
    }
    return { followers: followers.length, sent };
  }

  async notifyBrokerApproved(userId: string) {
    return this.sendToUser(
      userId,
      {
        title: 'Profil schválen',
        body: 'Váš profesionální profil byl schválen administrátorem.',
        url: '/profil/dashboard',
        tag: 'broker-approved',
      },
      'any',
    );
  }

  private urlForNotificationType(type: string, data?: Record<string, unknown>): string {
    if (type === 'NEW_FOLLOWER' && typeof data?.followerId === 'string') {
      return `/profile/${data.followerId}`;
    }
    if (type === 'BROKER_LEAD' && typeof data?.propertyId === 'string') {
      return `/nemovitost/${data.propertyId}`;
    }
    if (type === 'OWNER_LISTING_NEW' && typeof data?.propertyId === 'string') {
      return `/nemovitost/${data.propertyId}`;
    }
    return '/profil/dashboard';
  }

  private async userAllowsPush(userId: string, pref: PushPref, leadType?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyPwaPush: true,
        notifyNewMessages: true,
        notifyNewPosts: true,
        brokerLeadNotificationEnabled: true,
      },
    });
    if (!user?.notifyPwaPush) return false;
    if (pref === 'messages' && !user.notifyNewMessages) return false;
    if (pref === 'posts' && !user.notifyNewPosts) return false;
    if (
      (leadType === 'OWNER_LISTING_NEW' || leadType === 'BROKER_LEAD') &&
      !user.brokerLeadNotificationEnabled
    ) {
      return false;
    }
    return true;
  }

  private async unreadBadgeCount(userId: string): Promise<number> {
    const [messages, notifications] = await Promise.all([
      this.prisma.propertyMessage.count({
        where: {
          readAt: null,
          conversation: {
            OR: [{ userLowId: userId }, { userHighId: userId }],
          },
          senderId: { not: userId },
        },
      }),
      this.prisma.userNotification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return Math.min(99, messages + notifications);
  }

  async sendToUser(userId: string, payload: WebPushPayload, pref: PushPref = 'any') {
    if (!this.ensureVapidReady()) return { sent: 0, failed: 0 };
    if (!(await this.userAllowsPush(userId, pref))) return { sent: 0, failed: 0 };

    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { sent: 0, failed: 0 };

    const badge =
      payload.badge ?? (await this.unreadBadgeCount(userId).catch(() => undefined));
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag,
      badge,
    });

    let sent = 0;
    let failed = 0;
    const webpush = getWebPushClient();
    if (!webpush?.sendNotification) {
      this.logger.warn('[web-push] send skipped — web-push není dostupný');
      return { sent: 0, failed: 0 };
    }

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await this.prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        this.logger.warn(
          `[web-push] send failed userId=${userId} status=${status ?? '?'}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    if (sent > 0) {
      this.logger.log(`WEB_PUSH_SENT userId=${userId} sent=${sent} title=${payload.title}`);
    }
    return { sent, failed };
  }
}
