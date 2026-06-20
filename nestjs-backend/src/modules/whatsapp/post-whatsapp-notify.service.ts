import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppDiagnosticService } from './whatsapp-diagnostic.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import {
  buildTemplateMessageRequest,
  formatMetaApiError,
  formatTemplateLogLabel,
} from './whatsapp-template-send.util';
import { resolveTemplateRequirementsFromRaw } from './whatsapp-template-sync.util';
import { normalizeToE164, whatsAppDigits } from './whatsapp-phone.util';

export const POST_WHATSAPP_NOTIFICATION_TYPES = {
  POST_UPLOADED_AUTHOR: 'POST_UPLOADED_AUTHOR',
  NEW_POST_NOTIFICATION: 'NEW_POST_NOTIFICATION',
} as const;

export type PostWhatsAppNotificationType =
  (typeof POST_WHATSAPP_NOTIFICATION_TYPES)[keyof typeof POST_WHATSAPP_NOTIFICATION_TYPES];

const PORTAL_NAME = 'XXrealit';

@Injectable()
export class PostWhatsAppNotifyService {
  private readonly logger = new Logger(PostWhatsAppNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: WhatsAppSettingsService,
    private readonly config: WhatsAppConfigService,
    private readonly metaTemplates: WhatsAppMetaTemplatesService,
    private readonly cloudApi: WhatsAppCloudApiService,
    private readonly diagnostic: WhatsAppDiagnosticService,
    private readonly env: ConfigService,
  ) {}

  async onPostPublished(authorId: string, postId: string): Promise<void> {
    if (!this.config.isCloudApiConfigured()) return;
    await this.settings.reload();
    const stored = this.settings.getStoredSettings();
    await Promise.all([
      stored.postNotifyAuthorEnabled
        ? this.notifyAuthor(authorId, postId).catch((err) =>
            this.logger.warn(
              `[post-wa] author notify failed post=${postId}: ${err instanceof Error ? err.message : err}`,
            ),
          )
        : Promise.resolve(),
      stored.postNotifyFollowersEnabled
        ? this.notifyFollowers(authorId, postId).catch((err) =>
            this.logger.warn(
              `[post-wa] followers notify failed post=${postId}: ${err instanceof Error ? err.message : err}`,
            ),
          )
        : Promise.resolve(),
    ]);
  }

  async testAuthorNotification(toPhone?: string): Promise<{ ok: boolean; error?: string }> {
    const phone = this.resolveTestPhone(toPhone);
    if (!phone) {
      return { ok: false, error: 'Zadejte platné testovací telefonní číslo (+420…).' };
    }
    await this.settings.reload();
    const metaTemplateId =
      this.settings.getStoredSettings().postUploadedAuthorMetaTemplateId?.trim() || '';
    if (!metaTemplateId) {
      return { ok: false, error: 'Vyberte šablonu pro upozornění autorovi.' };
    }
    return this.sendPostTemplate({
      metaTemplateId,
      phoneE164: phone,
      recipientUserId: null,
      recipientName: 'Test',
      postId: null,
      notificationType: POST_WHATSAPP_NOTIFICATION_TYPES.POST_UPLOADED_AUTHOR,
      bodyParamValues: [PORTAL_NAME],
      urlButtonSuffix: '',
    });
  }

  async testNewPostNotification(toPhone?: string): Promise<{ ok: boolean; error?: string }> {
    const phone = this.resolveTestPhone(toPhone);
    if (!phone) {
      return { ok: false, error: 'Zadejte platné testovací telefonní číslo (+420…).' };
    }
    await this.settings.reload();
    const metaTemplateId =
      this.settings.getStoredSettings().newPostNotificationMetaTemplateId?.trim() || '';
    if (!metaTemplateId) {
      return { ok: false, error: 'Vyberte šablonu pro upozornění na nový příspěvek.' };
    }
    return this.sendPostTemplate({
      metaTemplateId,
      phoneE164: phone,
      recipientUserId: null,
      recipientName: 'Test',
      postId: null,
      notificationType: POST_WHATSAPP_NOTIFICATION_TYPES.NEW_POST_NOTIFICATION,
      bodyParamValues: ['Test Uživatel', 'Nový příspěvek na portálu'],
      urlButtonSuffix: '',
    });
  }

  private async notifyAuthor(authorId: string, postId: string): Promise<void> {
    const metaTemplateId =
      this.settings.getStoredSettings().postUploadedAuthorMetaTemplateId?.trim() || '';
    if (!metaTemplateId) return;

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappPhone: true,
        whatsappNotifyMyUploads: true,
        whatsappMarketingOptOut: true,
      },
    });
    if (!author?.whatsappNotifyMyUploads || author.whatsappMarketingOptOut) return;

    const phone = this.userPhone(author);
    if (!phone) return;

    if (
      await this.alreadySent(
        postId,
        author.id,
        POST_WHATSAPP_NOTIFICATION_TYPES.POST_UPLOADED_AUTHOR,
      )
    ) {
      return;
    }

    await this.sendPostTemplate({
      metaTemplateId,
      phoneE164: phone,
      recipientUserId: author.id,
      recipientName: author.name ?? undefined,
      postId,
      notificationType: POST_WHATSAPP_NOTIFICATION_TYPES.POST_UPLOADED_AUTHOR,
      bodyParamValues: [PORTAL_NAME],
      urlButtonSuffix: this.postPathSuffix(postId),
    });
  }

  private async notifyFollowers(authorId: string, postId: string): Promise<void> {
    const metaTemplateId =
      this.settings.getStoredSettings().newPostNotificationMetaTemplateId?.trim() || '';
    if (!metaTemplateId) return;

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, name: true },
    });
    if (!author) return;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { title: true, description: true },
    });
    const postLabel =
      post?.title?.trim() ||
      post?.description?.trim().slice(0, 80) ||
      'nový příspěvek';

    const follows = await this.prisma.follow.findMany({
      where: { followingId: authorId },
      select: {
        follower: {
          select: {
            id: true,
            name: true,
            phone: true,
            whatsappPhone: true,
            whatsappNotifyNewPosts: true,
            whatsappMarketingOptOut: true,
          },
        },
      },
    });

    for (const row of follows) {
      const follower = row.follower;
      if (follower.id === authorId) continue;
      if (!follower.whatsappNotifyNewPosts || follower.whatsappMarketingOptOut) continue;

      const phone = this.userPhone(follower);
      if (!phone) continue;

      if (
        await this.alreadySent(
          postId,
          follower.id,
          POST_WHATSAPP_NOTIFICATION_TYPES.NEW_POST_NOTIFICATION,
        )
      ) {
        continue;
      }

      await this.sendPostTemplate({
        metaTemplateId,
        phoneE164: phone,
        recipientUserId: follower.id,
        recipientName: follower.name ?? undefined,
        postId,
        notificationType: POST_WHATSAPP_NOTIFICATION_TYPES.NEW_POST_NOTIFICATION,
        bodyParamValues: [author.name?.trim() || 'Uživatel', postLabel],
        urlButtonSuffix: this.postPathSuffix(postId),
      });
    }
  }

  private async sendPostTemplate(input: {
    metaTemplateId: string;
    phoneE164: string;
    recipientUserId: string | null;
    recipientName?: string;
    postId: string | null;
    notificationType: PostWhatsAppNotificationType;
    bodyParamValues: string[];
    urlButtonSuffix: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.isCloudApiConfigured()) {
      return { ok: false, error: 'WhatsApp Cloud API není nakonfigurováno.' };
    }

    try {
      await this.diagnostic.assertPhoneBelongsToConfiguredWaba();
      const tplRow = await this.metaTemplates.requireApprovedTemplate(input.metaTemplateId);
      const reqs = resolveTemplateRequirementsFromRaw(tplRow.rawTemplate);

      const variablesCount = reqs.variablesCount ?? 0;
      const bodyParameters: string[] = [];
      for (let i = 0; i < variablesCount; i += 1) {
        bodyParameters.push(
          String(input.bodyParamValues[i] ?? input.bodyParamValues[input.bodyParamValues.length - 1] ?? PORTAL_NAME).trim(),
        );
      }

      const urlButtonParameters =
        reqs.urlButtonParamCount > 0
          ? [{ index: 0, text: input.urlButtonSuffix.trim() || 'posts' }]
          : [];

      const headerRaw = reqs.headerFormat ?? reqs.headerType ?? 'NONE';
      const headerType =
        headerRaw === 'IMAGE' || headerRaw === 'TEXT' ? headerRaw : ('NONE' as const);

      const requestBody = buildTemplateMessageRequest(
        whatsAppDigits(input.phoneE164),
        {
          templateName: tplRow.templateName,
          languageCode: tplRow.language,
          bodyParameters,
          variablesCount,
          headerType,
          headerImageMediaId: undefined,
          urlButtonParameters,
          urlButtonParamCount: reqs.urlButtonParamCount,
          needsHeaderImage: reqs.needsHeaderImage,
          needsUrlButtonParameter: reqs.needsUrlButtonParameter,
        },
      );

      const logLabel = formatTemplateLogLabel(
        tplRow.templateName,
        tplRow.language,
        bodyParameters,
        headerType,
      );

      const { providerMessageId, error } = await this.cloudApi.sendMessages(requestBody, {
        recipientPhone: input.phoneE164,
        recipientName: input.recipientName,
        recipientUserId: input.recipientUserId ?? undefined,
        logLabel,
        templateName: tplRow.templateName,
        templateLanguage: tplRow.language,
        variablesCount,
        headerType,
        urlButtonParamCount: reqs.urlButtonParamCount,
        needsHeaderImage: reqs.needsHeaderImage,
        needsUrlButtonParameter: reqs.needsUrlButtonParameter,
      });

      const status = providerMessageId
        ? WhatsAppMessageStatus.SENT
        : WhatsAppMessageStatus.FAILED;
      const errorMessage = providerMessageId ? null : formatMetaApiError(error);

      await this.prisma.whatsAppMessage.create({
        data: {
          userId: input.recipientUserId,
          postId: input.postId,
          notificationType: input.notificationType,
          direction: WhatsAppMessageDirection.OUTBOUND,
          fromPhone: '',
          toPhone: input.phoneE164,
          message: logLabel,
          status,
          providerMessageId,
          errorMessage,
        },
      });

      if (!providerMessageId) {
        return { ok: false, error: errorMessage ?? 'Meta nevrátilo ID zprávy.' };
      }
      return { ok: true };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.whatsAppMessage.create({
        data: {
          userId: input.recipientUserId,
          postId: input.postId,
          notificationType: input.notificationType,
          direction: WhatsAppMessageDirection.OUTBOUND,
          fromPhone: '',
          toPhone: input.phoneE164,
          message: `template:${input.notificationType}`,
          status: WhatsAppMessageStatus.FAILED,
          errorMessage,
        },
      });
      return { ok: false, error: errorMessage };
    }
  }

  private async alreadySent(
    postId: string,
    userId: string,
    notificationType: PostWhatsAppNotificationType,
  ): Promise<boolean> {
    const existing = await this.prisma.whatsAppMessage.findFirst({
      where: {
        postId,
        userId,
        notificationType,
        status: {
          in: [
            WhatsAppMessageStatus.PENDING,
            WhatsAppMessageStatus.SENT,
            WhatsAppMessageStatus.DELIVERED,
          ],
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private userPhone(u: { phone: string; whatsappPhone: string }): string | null {
    const wa = u.whatsappPhone?.trim();
    if (wa) {
      const normalized = normalizeToE164(wa);
      if (normalized) return normalized;
    }
    const phone = u.phone?.trim();
    if (!phone) return null;
    return normalizeToE164(phone);
  }

  private resolveTestPhone(toPhone?: string): string | null {
    const raw = toPhone?.trim() || this.config.getTestPhone() || '';
    return normalizeToE164(raw);
  }

  private postPathSuffix(postId: string): string {
    const base = this.env.get<string>('FRONTEND_URL')?.trim() || 'https://www.xxrealit.cz';
    const path = `?tab=posts&post=${postId}`;
    try {
      const url = new URL(base);
      return `${url.pathname.replace(/\/$/, '')}${path}`.replace(/^\//, '');
    } catch {
      return path.replace(/^\?/, '');
    }
  }
}
