import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UserRole,
  WhatsAppMarketingCampaignStatus,
  WhatsAppMarketingCampaignType,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import {
  portalBaseUrl,
  renderWhatsAppTemplate,
  roleLabel,
} from './whatsapp-message-template.util';
import { isValidWhatsAppPhone, whatsAppDigits } from './whatsapp-phone.util';
import type {
  CreateWhatsAppMarketingCampaignDto,
  PreviewWhatsAppCampaignDto,
} from './dto/whatsapp-admin.dto';

type Recipient = {
  phone: string;
  userId?: string;
  name?: string;
  role?: UserRole;
  credit?: number;
};

@Injectable()
export class WhatsAppMarketingService {
  private readonly logger = new Logger(WhatsAppMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
    private readonly cloudApi: WhatsAppCloudApiService,
  ) {}

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizePhone(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withPlus = trimmed.startsWith('+') ? trimmed : `+${whatsAppDigits(trimmed)}`;
    return isValidWhatsAppPhone(withPlus) ? withPlus : null;
  }

  private userPhone(u: {
    phone: string;
    whatsappPhone: string;
  }): string | null {
    const wa = u.whatsappPhone?.trim();
    if (wa && isValidWhatsAppPhone(wa)) return wa;
    const phone = u.phone?.trim();
    if (phone && isValidWhatsAppPhone(phone.startsWith('+') ? phone : `+${whatsAppDigits(phone)}`)) {
      return phone.startsWith('+') ? phone : `+${whatsAppDigits(phone)}`;
    }
    return null;
  }

  private templateVarsForUser(u: {
    name?: string | null;
    role: UserRole;
    creditBalance?: number;
    realCreditBalance?: number;
    bonusCreditBalance?: number;
  }) {
    const credit =
      (u.realCreditBalance ?? 0) + (u.bonusCreditBalance ?? 0) + (u.creditBalance ?? 0);
    return {
      jmeno: u.name?.trim() || 'uživateli',
      role: roleLabel(u.role),
      odkaz: portalBaseUrl(),
      kredit: String(credit),
    };
  }

  async sendCloudToPhone(
    toPhone: string,
    message: string,
    meta?: {
      campaignId?: string;
      recipientUserId?: string;
      recipientName?: string;
      campaignType?: WhatsAppMarketingCampaignType | null;
      isWelcome?: boolean;
    },
  ): Promise<{ ok: boolean; error?: string }> {
    const toDigits = whatsAppDigits(toPhone);
    const requestBody = {
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: message },
    };

    try {
      const { providerMessageId } = await this.cloudApi.sendMessages(requestBody, {
        recipientPhone: toPhone,
        recipientName: meta?.recipientName,
        campaignId: meta?.campaignId,
        campaignType: meta?.campaignType ?? null,
        isWelcome: meta?.isWelcome,
        logLabel: message.slice(0, 500),
      });

      if (providerMessageId) {
        await this.prisma.whatsAppMessage.create({
          data: {
            userId: meta?.recipientUserId ?? null,
            direction: WhatsAppMessageDirection.OUTBOUND,
            fromPhone: '',
            toPhone,
            message,
            status: WhatsAppMessageStatus.SENT,
            providerMessageId,
          },
        });
      }

      return { ok: true };
    } catch (err: unknown) {
      const detail = this.extractMetaError(err);
      return { ok: false, error: detail.message };
    }
  }

  private extractMetaError(err: unknown): { message: string; code?: number; type?: string } {
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { message?: unknown } }).response;
      const msg = response?.message;
      if (msg && typeof msg === 'object') {
        const o = msg as { message?: string; code?: number; type?: string };
        return {
          message: o.message || 'Meta API chyba',
          code: o.code,
          type: o.type,
        };
      }
    }
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      if (m && typeof m === 'object') {
        const o = m as { message?: string; code?: number; type?: string };
        return {
          message: o.message || 'Meta API chyba',
          code: o.code,
          type: o.type,
        };
      }
      if (typeof m === 'string') return { message: m };
    }
    return { message: err instanceof Error ? err.message : 'Neznámá chyba' };
  }

  async sendTestMessage(toPhone?: string) {
    await this.settings.reload();

    const phone = this.normalizePhone(toPhone?.trim() || this.config.getTestPhone() || '');
    if (!phone) {
      throw new BadRequestException('Zadejte platné testovací telefonní číslo (+420…).');
    }

    const toDigits = whatsAppDigits(phone);
    const requestBody = {
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' },
      },
    };

    const { providerMessageId, attempt } = await this.cloudApi.sendMessages(requestBody, {
      recipientPhone: phone,
      recipientName: 'Test',
      logLabel: 'test:hello_world',
    });

    if (providerMessageId) {
      await this.prisma.whatsAppMessage.create({
        data: {
          direction: WhatsAppMessageDirection.OUTBOUND,
          fromPhone: '',
          toPhone: phone,
          message: 'template:hello_world',
          status: WhatsAppMessageStatus.SENT,
          providerMessageId,
        },
      });
    }

    return {
      ok: true,
      toPhone: phone,
      toDigits,
      phoneNumberId: attempt.phoneNumberId,
      providerMessageId,
    };
  }

  async getLastLog() {
    return this.cloudApi.getLastAdminLog();
  }

  async sendWelcomeOnRegister(user: Pick<User, 'id' | 'name' | 'phone' | 'role'>) {
    const stored = this.settings.getStoredSettings();
    if (!stored.welcomeEnabled || !this.config.isCloudApiConfigured()) return;

    const phone = this.normalizePhone(user.phone);
    if (!phone) return;

    const template =
      stored.welcomeTemplates[user.role] ||
      stored.welcomeTemplates.USER ||
      DEFAULT_WELCOME_FALLBACK;

    const message = renderWhatsAppTemplate(template, this.templateVarsForUser(user));

    await this.prisma.user.update({
      where: { id: user.id },
      data: { whatsappMarketingConsentAt: new Date() },
    });

    await this.sendCloudToPhone(phone, message, {
      recipientUserId: user.id,
      recipientName: user.name ?? undefined,
      campaignType: WhatsAppMarketingCampaignType.PORTAL_INVITE,
      isWelcome: true,
    });
  }

  async listCampaigns() {
    const rows = await this.prisma.whatsAppMarketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.campaignRow(r));
  }

  async getCampaign(id: string) {
    const row = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kampaň nenalezena.');
    return this.campaignRow(row);
  }

  async createCampaign(adminUserId: string, dto: CreateWhatsAppMarketingCampaignDto) {
    const row = await this.prisma.whatsAppMarketingCampaign.create({
      data: {
        name: dto.name.trim(),
        campaignType: dto.campaignType,
        messageTemplate: dto.messageTemplate.trim(),
        targetRoles: dto.targetRoles ?? [],
        targetRegions: (dto.targetRegions ?? []).map((s) => s.trim()).filter(Boolean),
        targetCities: (dto.targetCities ?? []).map((s) => s.trim()).filter(Boolean),
        manualPhones: (dto.manualPhones ?? [])
          .map((p) => this.normalizePhone(p))
          .filter((p): p is string => Boolean(p)),
        createdByUserId: adminUserId,
      },
    });
    return this.campaignRow(row);
  }

  async updateCampaign(id: string, dto: Partial<CreateWhatsAppMarketingCampaignDto>) {
    const existing = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň právě odesílá — nelze upravit.');
    }

    const row = await this.prisma.whatsAppMarketingCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.campaignType !== undefined ? { campaignType: dto.campaignType } : {}),
        ...(dto.messageTemplate !== undefined
          ? { messageTemplate: dto.messageTemplate.trim() }
          : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.targetRegions !== undefined
          ? {
              targetRegions: dto.targetRegions.map((s) => s.trim()).filter(Boolean),
            }
          : {}),
        ...(dto.targetCities !== undefined
          ? { targetCities: dto.targetCities.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(dto.manualPhones !== undefined
          ? {
              manualPhones: dto.manualPhones
                .map((p) => this.normalizePhone(p))
                .filter((p): p is string => Boolean(p)),
            }
          : {}),
      },
    });
    return this.campaignRow(row);
  }

  async deleteCampaign(id: string) {
    const existing = await this.prisma.whatsAppMarketingCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (existing.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň právě odesílá — nelze smazat.');
    }
    await this.prisma.whatsAppMarketingCampaign.delete({ where: { id } });
    return { ok: true };
  }

  previewMessage(dto: PreviewWhatsAppCampaignDto) {
    const sampleRole = dto.sampleRole ?? UserRole.USER;
    const vars = {
      jmeno: dto.sampleName?.trim() || 'Jan Novák',
      role: roleLabel(sampleRole),
      odkaz: portalBaseUrl(),
      kredit: '1500',
    };
    return {
      preview: renderWhatsAppTemplate(dto.messageTemplate, vars),
    };
  }

  async testCampaign(campaignId: string, toPhone?: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const phone = this.normalizePhone(toPhone?.trim() || this.config.getTestPhone() || '');
    if (!phone) {
      throw new BadRequestException('Zadejte platné testovací telefonní číslo.');
    }

    const message = renderWhatsAppTemplate(
      campaign.messageTemplate,
      this.templateVarsForUser({
        name: 'Test Uživatel',
        role: campaign.targetRoles[0] ?? UserRole.USER,
        creditBalance: 1500,
        realCreditBalance: 1000,
        bonusCreditBalance: 500,
      }),
    );

    const result = await this.sendCloudToPhone(phone, message, {
      campaignId: campaign.id,
      recipientName: 'Test',
      campaignType: campaign.campaignType,
    });
    if (!result.ok) {
      throw new BadRequestException(result.error || 'Test kampaně selhal.');
    }
    return { ok: true, toPhone: phone, preview: message };
  }

  private async resolveRecipients(campaign: {
    targetRoles: UserRole[];
    targetRegions: string[];
    targetCities: string[];
    manualPhones: string[];
  }): Promise<Recipient[]> {
    const where: Record<string, unknown> = {
      whatsappMarketingOptOut: false,
      role: { not: UserRole.ADMIN },
    };

    if (campaign.targetRoles.length > 0) {
      where.role = { in: campaign.targetRoles };
    }

    const regionFilters = campaign.targetRegions
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    const cityFilters = campaign.targetCities
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        role: true,
        phone: true,
        whatsappPhone: true,
        city: true,
        brokerRegionLabel: true,
        brokerPreferredRegions: true,
        creditBalance: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
      },
      take: 5000,
    });

    const recipients: Recipient[] = [];
    const seen = new Set<string>();

    for (const u of users) {
      if (regionFilters.length > 0) {
        const regionLabel = u.brokerRegionLabel?.trim().toLowerCase() || '';
        const city = u.city?.trim().toLowerCase() || '';
        const preferred = u.brokerPreferredRegions.map((s) => s.trim().toLowerCase());
        const matchesRegion = regionFilters.some(
          (r) =>
            regionLabel.includes(r) ||
            city.includes(r) ||
            preferred.some((p) => p.includes(r) || r.includes(p)),
        );
        if (!matchesRegion) continue;
      }

      if (cityFilters.length > 0) {
        const city = u.city?.trim().toLowerCase() || '';
        if (!cityFilters.some((c) => city.includes(c) || c.includes(city))) continue;
      }

      const phone = this.userPhone(u);
      if (!phone) continue;

      const key = whatsAppDigits(phone);
      if (seen.has(key)) continue;
      seen.add(key);

      recipients.push({
        phone,
        userId: u.id,
        name: u.name ?? undefined,
        role: u.role,
        credit:
          (u.realCreditBalance ?? 0) +
          (u.bonusCreditBalance ?? 0) +
          (u.creditBalance ?? 0),
      });
    }

    for (const raw of campaign.manualPhones) {
      const phone = this.normalizePhone(raw);
      if (!phone) continue;
      const key = whatsAppDigits(phone);
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({ phone });
    }

    return recipients;
  }

  async runCampaign(campaignId: string) {
    const campaign = await this.prisma.whatsAppMarketingCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    if (campaign.status === WhatsAppMarketingCampaignStatus.SENDING) {
      throw new BadRequestException('Kampaň už probíhá.');
    }
    if (!this.config.isCloudApiConfigured()) {
      throw new ServiceUnavailableException('WhatsApp Cloud API není připraveno.');
    }

    await this.prisma.whatsAppMarketingCampaign.update({
      where: { id: campaignId },
      data: { status: WhatsAppMarketingCampaignStatus.SENDING },
    });

    const recipients = await this.resolveRecipients(campaign);
    const batchSize = this.config.getBatchSize();
    const batchDelayMs = this.config.getBatchDelayMs();

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]!;
      const message = renderWhatsAppTemplate(
        campaign.messageTemplate,
        r.userId
          ? this.templateVarsForUser({
              name: r.name,
              role: r.role ?? UserRole.USER,
              creditBalance: r.credit,
            })
          : {
              jmeno: r.name || 'uživateli',
              role: r.role ? roleLabel(r.role) : '',
              odkaz: portalBaseUrl(),
              kredit: String(r.credit ?? 0),
            },
      );

      const dup = await this.prisma.whatsAppMarketingCampaignLog.findFirst({
        where: {
          recipientPhone: r.phone,
          campaignId,
          status: WhatsAppMessageStatus.SENT,
        },
        select: { id: true },
      });
      if (dup) {
        skipped += 1;
        continue;
      }

      const result = await this.sendCloudToPhone(r.phone, message, {
        campaignId: campaign.id,
        recipientUserId: r.userId,
        recipientName: r.name,
        campaignType: campaign.campaignType,
      });

      if (result.ok) {
        sent += 1;
        if (r.userId) {
          await this.prisma.user.updateMany({
            where: { id: r.userId, whatsappMarketingConsentAt: null },
            data: { whatsappMarketingConsentAt: new Date() },
          });
        }
      } else {
        failed += 1;
      }

      if ((i + 1) % batchSize === 0 && i + 1 < recipients.length) {
        await this.sleep(batchDelayMs);
      }
    }

    const status =
      failed > 0 && sent === 0
        ? WhatsAppMarketingCampaignStatus.FAILED
        : WhatsAppMarketingCampaignStatus.SENT;

    const updated = await this.prisma.whatsAppMarketingCampaign.update({
      where: { id: campaignId },
      data: {
        status,
        sentAt: new Date(),
        recipientCount: recipients.length,
        sentCount: sent,
        failedCount: failed,
        skippedCount: skipped,
      },
    });

    return this.campaignRow(updated);
  }

  async listHistory(limit = 100, campaignId?: string) {
    const rows = await this.prisma.whatsAppMarketingCampaignLog.findMany({
      where: campaignId ? { campaignId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, limit),
      include: {
        recipient: { select: { name: true, email: true } },
        campaign: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      recipientName: r.recipientName || r.recipient?.name || null,
      recipientPhone: r.recipientPhone,
      campaignType: r.campaignType,
      campaignName: r.campaign?.name ?? (r.isWelcome ? 'Uvítací zpráva' : null),
      status: r.status,
      errorMessage: r.errorMessage,
      message: r.message,
      isWelcome: r.isWelcome,
      campaignId: r.campaignId,
    }));
  }

  private campaignRow(r: {
    id: string;
    name: string;
    campaignType: WhatsAppMarketingCampaignType;
    messageTemplate: string;
    targetRoles: UserRole[];
    targetRegions: string[];
    targetCities: string[];
    manualPhones: string[];
    status: WhatsAppMarketingCampaignStatus;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    createdAt: Date;
    updatedAt: Date;
    sentAt: Date | null;
  }) {
    return {
      id: r.id,
      name: r.name,
      campaignType: r.campaignType,
      messageTemplate: r.messageTemplate,
      targetRoles: r.targetRoles,
      targetRegions: r.targetRegions,
      targetCities: r.targetCities,
      manualPhones: r.manualPhones,
      status: r.status,
      recipientCount: r.recipientCount,
      sentCount: r.sentCount,
      failedCount: r.failedCount,
      skippedCount: r.skippedCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    };
  }
}

const DEFAULT_WELCOME_FALLBACK =
  'Vítejte na XXrealit, {jmeno}! Váš účet je připraven. {odkaz}';
