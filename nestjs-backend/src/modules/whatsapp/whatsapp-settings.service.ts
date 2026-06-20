import { Injectable, OnModuleInit, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  validateSystemTemplateForSlot,
  type SystemTemplateSlot,
} from './whatsapp-system-templates.util';
import type { SaveSystemTemplatesDto } from './dto/save-system-templates.dto';

export type WhatsAppSystemTemplatesPublic = Pick<
  WhatsAppIntegrationSettings,
  | 'whatsappVerifyMetaTemplateId'
  | 'whatsappVerifyTemplateName'
  | 'whatsappVerifyTemplateLanguage'
  | 'welcomeMetaTemplateId'
  | 'welcomeTemplateName'
  | 'welcomeTemplateLanguage'
  | 'welcomeEnabled'
  | 'postUploadedAuthorMetaTemplateId'
  | 'postUploadedTemplateName'
  | 'postUploadedTemplateLanguage'
  | 'postNotifyAuthorEnabled'
  | 'newPostNotificationMetaTemplateId'
  | 'newPostTemplateName'
  | 'newPostTemplateLanguage'
  | 'postNotifyFollowersEnabled'
>;

export type WhatsAppIntegrationSettings = {
  enabled: boolean;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  testPhone: string;
  welcomeEnabled: boolean;
  welcomeTemplates: Record<string, string>;
  batchSize: number;
  batchDelayMs: number;
  /** Upozornění autorovi po nahrání příspěvku (Meta šablona). */
  postNotifyAuthorEnabled: boolean;
  /** Upozornění sledujícím při novém příspěvku. */
  postNotifyFollowersEnabled: boolean;
  /** DB id schválené šablony post_uploaded_author. */
  postUploadedAuthorMetaTemplateId: string;
  postUploadedTemplateName: string;
  postUploadedTemplateLanguage: string;
  /** DB id schválené šablony new_post_notification. */
  newPostNotificationMetaTemplateId: string;
  newPostTemplateName: string;
  newPostTemplateLanguage: string;
  /** DB id šablony whatsapp_verify_code. */
  whatsappVerifyMetaTemplateId: string;
  whatsappVerifyTemplateName: string;
  whatsappVerifyTemplateLanguage: string;
  /** DB id uvítací Meta šablony (má prioritu před textovými šablonami). */
  welcomeMetaTemplateId: string;
  welcomeTemplateName: string;
  welcomeTemplateLanguage: string;
};

export type WhatsAppIntegrationSettingsPublic = Omit<
  WhatsAppIntegrationSettings,
  'accessToken' | 'webhookVerifyToken'
> & {
  accessTokenSet: boolean;
  webhookVerifyTokenSet: boolean;
  /** Meta App ID z env — není WABA ID. */
  metaAppId: string;
  /** Meta Business ID z env — není WABA ID. */
  metaBusinessId: string;
  /** Efektivní Phone Number ID (DB nebo env). */
  effectivePhoneNumberId: string;
  /** Efektivní WABA ID (DB nebo env). */
  effectiveWabaId: string;
};

export type EffectiveWhatsAppConfig = {
  enabled: boolean;
  accessToken: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  webhookVerifyToken: string | null;
  testPhone: string | null;
  batchSize: number;
  batchDelayMs: number;
};

const SETTINGS_KEY = 'whatsapp_integration_settings';

export const DEFAULT_WHATSAPP_INTEGRATION_SETTINGS: WhatsAppIntegrationSettings = {
  enabled: false,
  accessToken: '',
  phoneNumberId: '',
  businessAccountId: '',
  webhookVerifyToken: '',
  testPhone: '',
  welcomeEnabled: false,
  welcomeTemplates: {
    USER: 'Vítejte na XXrealit, {jmeno}! Váš účet je připraven. Portál: {odkaz}',
    AGENT: 'Vítejte, {jmeno}! Jako makléř máte na XXrealit připravený profil. {odkaz}',
    COMPANY: 'Vítejte, {jmeno}! Váš firemní účet na XXrealit je aktivní. {odkaz}',
    INVESTOR: 'Vítejte, {jmeno}! Sledujte investiční příležitosti na {odkaz}',
    FINANCIAL_ADVISOR:
      'Vítejte, {jmeno}! Finanční poradce na XXrealit — váš účet je připraven. {odkaz}',
    AGENCY: 'Vítejte, {jmeno}! Realitní kancelář na XXrealit — {odkaz}',
  },
  batchSize: 20,
  batchDelayMs: 1000,
  postNotifyAuthorEnabled: false,
  postNotifyFollowersEnabled: false,
  postUploadedAuthorMetaTemplateId: '',
  postUploadedTemplateName: '',
  postUploadedTemplateLanguage: '',
  newPostNotificationMetaTemplateId: '',
  newPostTemplateName: '',
  newPostTemplateLanguage: '',
  whatsappVerifyMetaTemplateId: '',
  whatsappVerifyTemplateName: '',
  whatsappVerifyTemplateLanguage: '',
  welcomeMetaTemplateId: '',
  welcomeTemplateName: '',
  welcomeTemplateLanguage: '',
};

@Injectable()
export class WhatsAppSettingsService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppSettingsService.name);
  private stored: WhatsAppIntegrationSettings = DEFAULT_WHATSAPP_INTEGRATION_SETTINGS;
  private effective: EffectiveWhatsAppConfig = this.buildEffective(
    DEFAULT_WHATSAPP_INTEGRATION_SETTINGS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  private str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
  }

  private num(v: unknown, fallback: number): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  normalize(raw: unknown): WhatsAppIntegrationSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_WHATSAPP_INTEGRATION_SETTINGS;
    const templatesRaw =
      o.welcomeTemplates && typeof o.welcomeTemplates === 'object'
        ? (o.welcomeTemplates as Record<string, unknown>)
        : {};
    const welcomeTemplates: Record<string, string> = { ...d.welcomeTemplates };
    for (const [k, v] of Object.entries(templatesRaw)) {
      if (typeof v === 'string' && v.trim()) welcomeTemplates[k] = v.trim();
    }

    return {
      enabled: o.enabled === true,
      accessToken: this.str(o.accessToken),
      phoneNumberId: this.str(o.phoneNumberId),
      businessAccountId: this.str(o.businessAccountId),
      webhookVerifyToken: this.str(o.webhookVerifyToken),
      testPhone: this.str(o.testPhone),
      welcomeEnabled: o.welcomeEnabled === true,
      welcomeTemplates,
      batchSize: Math.min(100, this.num(o.batchSize, d.batchSize)),
      batchDelayMs: Math.min(10000, this.num(o.batchDelayMs, d.batchDelayMs)),
      postNotifyAuthorEnabled: o.postNotifyAuthorEnabled === true,
      postNotifyFollowersEnabled: o.postNotifyFollowersEnabled === true,
      postUploadedAuthorMetaTemplateId: this.str(o.postUploadedAuthorMetaTemplateId),
      postUploadedTemplateName: this.str(o.postUploadedTemplateName),
      postUploadedTemplateLanguage: this.str(o.postUploadedTemplateLanguage),
      newPostNotificationMetaTemplateId: this.str(o.newPostNotificationMetaTemplateId),
      newPostTemplateName: this.str(o.newPostTemplateName),
      newPostTemplateLanguage: this.str(o.newPostTemplateLanguage),
      whatsappVerifyMetaTemplateId: this.str(o.whatsappVerifyMetaTemplateId),
      whatsappVerifyTemplateName: this.str(o.whatsappVerifyTemplateName),
      whatsappVerifyTemplateLanguage: this.str(o.whatsappVerifyTemplateLanguage),
      welcomeMetaTemplateId: this.str(o.welcomeMetaTemplateId),
      welcomeTemplateName: this.str(o.welcomeTemplateName),
      welcomeTemplateLanguage: this.str(o.welcomeTemplateLanguage),
    };
  }

  private systemTemplateSlotByMetaIdKey(
    key: keyof WhatsAppIntegrationSettings,
  ): SystemTemplateSlot | null {
    switch (key) {
      case 'whatsappVerifyMetaTemplateId':
        return 'verify';
      case 'postUploadedAuthorMetaTemplateId':
        return 'postUploaded';
      case 'newPostNotificationMetaTemplateId':
        return 'newPost';
      case 'welcomeMetaTemplateId':
        return 'welcome';
      default:
        return null;
    }
  }

  private nameKeyForMetaId(key: keyof WhatsAppIntegrationSettings): keyof WhatsAppIntegrationSettings | null {
    switch (key) {
      case 'whatsappVerifyMetaTemplateId':
        return 'whatsappVerifyTemplateName';
      case 'postUploadedAuthorMetaTemplateId':
        return 'postUploadedTemplateName';
      case 'newPostNotificationMetaTemplateId':
        return 'newPostTemplateName';
      case 'welcomeMetaTemplateId':
        return 'welcomeTemplateName';
      default:
        return null;
    }
  }

  private languageKeyForMetaId(
    key: keyof WhatsAppIntegrationSettings,
  ): keyof WhatsAppIntegrationSettings | null {
    switch (key) {
      case 'whatsappVerifyMetaTemplateId':
        return 'whatsappVerifyTemplateLanguage';
      case 'postUploadedAuthorMetaTemplateId':
        return 'postUploadedTemplateLanguage';
      case 'newPostNotificationMetaTemplateId':
        return 'newPostTemplateLanguage';
      case 'welcomeMetaTemplateId':
        return 'welcomeTemplateLanguage';
      default:
        return null;
    }
  }

  private async resolveMetaTemplateRow(
    metaId: string,
    templateName: string,
    language: string,
  ): Promise<{
    id: string;
    templateName: string;
    language: string;
    variablesCount: number;
    usable: boolean;
    isStale: boolean;
  } | null> {
    const trimmedId = metaId.trim();
    if (trimmedId) {
      const byId = await this.prisma.whatsAppMetaTemplate.findUnique({
        where: { id: trimmedId },
        select: {
          id: true,
          templateName: true,
          language: true,
          variablesCount: true,
          usable: true,
          isStale: true,
        },
      });
      if (byId) return byId;
    }

    const trimmedName = templateName.trim();
    if (!trimmedName) return null;

    const trimmedLang = language.trim();
    return this.prisma.whatsAppMetaTemplate.findFirst({
      where: {
        templateName: { equals: trimmedName, mode: 'insensitive' },
        ...(trimmedLang
          ? { language: { equals: trimmedLang, mode: 'insensitive' } }
          : {}),
      },
      select: {
        id: true,
        templateName: true,
        language: true,
        variablesCount: true,
        usable: true,
        isStale: true,
      },
      orderBy: [{ usable: 'desc' }, { isStale: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  private clearSystemTemplateSlot(
    next: WhatsAppIntegrationSettings,
    metaKey: keyof WhatsAppIntegrationSettings,
  ) {
    if (metaKey === 'whatsappVerifyMetaTemplateId') {
      next.whatsappVerifyMetaTemplateId = '';
      next.whatsappVerifyTemplateName = '';
      next.whatsappVerifyTemplateLanguage = '';
    } else if (metaKey === 'postUploadedAuthorMetaTemplateId') {
      next.postUploadedAuthorMetaTemplateId = '';
      next.postUploadedTemplateName = '';
      next.postUploadedTemplateLanguage = '';
    } else if (metaKey === 'newPostNotificationMetaTemplateId') {
      next.newPostNotificationMetaTemplateId = '';
      next.newPostTemplateName = '';
      next.newPostTemplateLanguage = '';
    } else if (metaKey === 'welcomeMetaTemplateId') {
      next.welcomeMetaTemplateId = '';
      next.welcomeTemplateName = '';
      next.welcomeTemplateLanguage = '';
    }
  }

  private applyResolvedSystemTemplateSlot(
    next: WhatsAppIntegrationSettings,
    metaKey: keyof WhatsAppIntegrationSettings,
    row: {
      id: string;
      templateName: string;
      language: string;
    },
  ) {
    if (metaKey === 'whatsappVerifyMetaTemplateId') {
      next.whatsappVerifyMetaTemplateId = row.id;
      next.whatsappVerifyTemplateName = row.templateName;
      next.whatsappVerifyTemplateLanguage = row.language;
    } else if (metaKey === 'postUploadedAuthorMetaTemplateId') {
      next.postUploadedAuthorMetaTemplateId = row.id;
      next.postUploadedTemplateName = row.templateName;
      next.postUploadedTemplateLanguage = row.language;
    } else if (metaKey === 'newPostNotificationMetaTemplateId') {
      next.newPostNotificationMetaTemplateId = row.id;
      next.newPostTemplateName = row.templateName;
      next.newPostTemplateLanguage = row.language;
    } else if (metaKey === 'welcomeMetaTemplateId') {
      next.welcomeMetaTemplateId = row.id;
      next.welcomeTemplateName = row.templateName;
      next.welcomeTemplateLanguage = row.language;
    }
  }

  private async resolveSystemTemplateFields(
    settings: WhatsAppIntegrationSettings,
  ): Promise<WhatsAppIntegrationSettings> {
    const next = { ...settings };
    const metaKeys: Array<keyof WhatsAppIntegrationSettings> = [
      'whatsappVerifyMetaTemplateId',
      'postUploadedAuthorMetaTemplateId',
      'newPostNotificationMetaTemplateId',
      'welcomeMetaTemplateId',
    ];

    for (const metaKey of metaKeys) {
      const slot = this.systemTemplateSlotByMetaIdKey(metaKey);
      const nameKey = this.nameKeyForMetaId(metaKey);
      const langKey = this.languageKeyForMetaId(metaKey);
      if (!slot || !nameKey || !langKey) continue;

      const metaId = String(next[metaKey] ?? '').trim();
      const templateName = String(next[nameKey] ?? '').trim();
      const language = String(next[langKey] ?? '').trim();

      if (!metaId && !templateName) {
        this.clearSystemTemplateSlot(next, metaKey);
        continue;
      }

      const row = await this.resolveMetaTemplateRow(metaId, templateName, language);
      if (!row) {
        throw new BadRequestException(
          `Vybraná systémová šablona (${metaKey}) není v databázi — synchronizujte šablony z Meta.`,
        );
      }

      const validationError = validateSystemTemplateForSlot(slot, {
        templateName: row.templateName,
        language: row.language,
        variablesCount: row.variablesCount,
        usable: row.usable,
        isStale: row.isStale,
      });
      if (validationError) {
        throw new BadRequestException(validationError);
      }

      this.applyResolvedSystemTemplateSlot(next, metaKey, row);
    }

    return next;
  }

  private envMetaAppId(): string {
    return this.config.get<string>('FACEBOOK_APP_ID')?.trim() || '';
  }

  private envMetaBusinessId(): string {
    return (
      this.config.get<string>('META_BUSINESS_ID')?.trim() ||
      this.config.get<string>('FACEBOOK_BUSINESS_ID')?.trim() ||
      ''
    );
  }

  private assertWabaIdNotConfused(wabaId: string) {
    const trimmed = wabaId.trim();
    if (!trimmed) return;
    const appId = this.envMetaAppId();
    const businessId = this.envMetaBusinessId();
    if (appId && trimmed === appId) {
      throw new BadRequestException(
        'WhatsApp Business Account ID nesmí být stejné jako Meta App ID. Použijte WABA ID z WhatsApp Manageru.',
      );
    }
    if (businessId && trimmed === businessId) {
      throw new BadRequestException(
        'WhatsApp Business Account ID nesmí být stejné jako Meta Business ID. Použijte WABA ID z WhatsApp Manageru.',
      );
    }
  }

  toPublic(settings: WhatsAppIntegrationSettings): WhatsAppIntegrationSettingsPublic {
    const { accessToken, webhookVerifyToken, ...rest } = settings;
    const effective = this.buildEffective(settings);
    return {
      ...rest,
      accessTokenSet: Boolean(accessToken.trim()),
      webhookVerifyTokenSet: Boolean(webhookVerifyToken.trim()),
      metaAppId: this.envMetaAppId(),
      metaBusinessId: this.envMetaBusinessId(),
      effectivePhoneNumberId: effective.phoneNumberId ?? '',
      effectiveWabaId: effective.businessAccountId ?? '',
    };
  }

  private envOr(stored: string, envKey: string): string | null {
    const fromStored = stored.trim();
    if (fromStored) return fromStored;
    return this.config.get<string>(envKey)?.trim() || null;
  }

  private buildEffective(stored: WhatsAppIntegrationSettings): EffectiveWhatsAppConfig {
    return {
      enabled: stored.enabled,
      accessToken: this.envOr(stored.accessToken, 'WHATSAPP_ACCESS_TOKEN'),
      phoneNumberId: this.envOr(stored.phoneNumberId, 'WHATSAPP_PHONE_NUMBER_ID'),
      businessAccountId: this.envOr(
        stored.businessAccountId,
        'WHATSAPP_BUSINESS_ACCOUNT_ID',
      ),
      webhookVerifyToken: this.envOr(
        stored.webhookVerifyToken,
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      ),
      testPhone: stored.testPhone.trim() || null,
      batchSize: stored.batchSize,
      batchDelayMs: stored.batchDelayMs,
    };
  }

  async reload() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    this.stored = this.normalize(row?.valueJson ?? null);
    this.effective = this.buildEffective(this.stored);
    this.logLoadedSystemTemplates(this.stored);
  }

  extractSystemTemplates(
    settings: WhatsAppIntegrationSettings = this.stored,
  ): WhatsAppSystemTemplatesPublic {
    return {
      whatsappVerifyMetaTemplateId: settings.whatsappVerifyMetaTemplateId,
      whatsappVerifyTemplateName: settings.whatsappVerifyTemplateName,
      whatsappVerifyTemplateLanguage: settings.whatsappVerifyTemplateLanguage,
      welcomeMetaTemplateId: settings.welcomeMetaTemplateId,
      welcomeTemplateName: settings.welcomeTemplateName,
      welcomeTemplateLanguage: settings.welcomeTemplateLanguage,
      welcomeEnabled: settings.welcomeEnabled,
      postUploadedAuthorMetaTemplateId: settings.postUploadedAuthorMetaTemplateId,
      postUploadedTemplateName: settings.postUploadedTemplateName,
      postUploadedTemplateLanguage: settings.postUploadedTemplateLanguage,
      postNotifyAuthorEnabled: settings.postNotifyAuthorEnabled,
      newPostNotificationMetaTemplateId: settings.newPostNotificationMetaTemplateId,
      newPostTemplateName: settings.newPostTemplateName,
      newPostTemplateLanguage: settings.newPostTemplateLanguage,
      postNotifyFollowersEnabled: settings.postNotifyFollowersEnabled,
    };
  }

  logLoadedSystemTemplates(settings: WhatsAppIntegrationSettings) {
    this.logger.log(
      `Loaded verify template: ${settings.whatsappVerifyTemplateName || '—'} (${settings.whatsappVerifyTemplateLanguage || '—'})`,
    );
    this.logger.log(
      `Loaded welcome template: ${settings.welcomeTemplateName || '—'} (${settings.welcomeTemplateLanguage || '—'})`,
    );
    this.logger.log(
      `Loaded post uploaded template: ${settings.postUploadedTemplateName || '—'} (${settings.postUploadedTemplateLanguage || '—'})`,
    );
    this.logger.log(
      `Loaded new post template: ${settings.newPostTemplateName || '—'} (${settings.newPostTemplateLanguage || '—'})`,
    );
  }

  async getSystemTemplates(): Promise<WhatsAppSystemTemplatesPublic> {
    await this.reload();
    return this.extractSystemTemplates(this.stored);
  }

  async updateSystemTemplates(
    patch: SaveSystemTemplatesDto,
  ): Promise<WhatsAppSystemTemplatesPublic> {
    const current = this.normalize(this.stored);
    const merged = this.normalize({
      ...current,
      ...patch,
    });
    const validated = await this.resolveSystemTemplateFields(merged);

    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        valueJson: validated as unknown as Prisma.InputJsonValue,
      },
      update: { valueJson: validated as unknown as Prisma.InputJsonValue },
    });

    this.stored = validated;
    this.effective = this.buildEffective(validated);
    this.logLoadedSystemTemplates(validated);
    const saved = this.extractSystemTemplates(validated);
    this.logger.log(
      `Saved system templates response: verify=${saved.whatsappVerifyTemplateName || '—'}/${saved.whatsappVerifyTemplateLanguage || '—'}`,
    );
    return saved;
  }

  getEffectiveConfig(): EffectiveWhatsAppConfig {
    return this.effective;
  }

  getStoredSettings(): WhatsAppIntegrationSettings {
    return this.stored;
  }

  async getSettings(): Promise<WhatsAppIntegrationSettingsPublic> {
    await this.reload();
    return this.toPublic(this.stored);
  }

  async updateSettings(
    patch: Partial<WhatsAppIntegrationSettings>,
  ): Promise<WhatsAppIntegrationSettingsPublic> {
    const current = this.normalize(this.stored);
    const merged = this.normalize({
      ...current,
      ...patch,
      welcomeTemplates: {
        ...current.welcomeTemplates,
        ...(patch.welcomeTemplates ?? {}),
      },
      accessToken:
        patch.accessToken !== undefined
          ? patch.accessToken
          : current.accessToken,
      webhookVerifyToken:
        patch.webhookVerifyToken !== undefined
          ? patch.webhookVerifyToken
          : current.webhookVerifyToken,
    });

    this.assertWabaIdNotConfused(merged.businessAccountId);

    const validated = await this.resolveSystemTemplateFields(merged);

    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        valueJson: validated as unknown as Prisma.InputJsonValue,
      },
      update: { valueJson: validated as unknown as Prisma.InputJsonValue },
    });

    this.stored = validated;
    this.effective = this.buildEffective(validated);
    return this.toPublic(validated);
  }
}
