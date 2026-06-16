import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

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
};

export type WhatsAppIntegrationSettingsPublic = Omit<
  WhatsAppIntegrationSettings,
  'accessToken' | 'webhookVerifyToken'
> & {
  accessTokenSet: boolean;
  webhookVerifyTokenSet: boolean;
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
};

@Injectable()
export class WhatsAppSettingsService implements OnModuleInit {
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
    };
  }

  toPublic(settings: WhatsAppIntegrationSettings): WhatsAppIntegrationSettingsPublic {
    const { accessToken, webhookVerifyToken, ...rest } = settings;
    return {
      ...rest,
      accessTokenSet: Boolean(accessToken.trim()),
      webhookVerifyTokenSet: Boolean(webhookVerifyToken.trim()),
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

    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        valueJson: merged as unknown as Prisma.InputJsonValue,
      },
      update: { valueJson: merged as unknown as Prisma.InputJsonValue },
    });

    this.stored = merged;
    this.effective = this.buildEffective(merged);
    return this.toPublic(merged);
  }
}
