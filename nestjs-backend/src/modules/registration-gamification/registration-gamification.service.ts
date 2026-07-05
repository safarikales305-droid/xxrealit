import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import { normalizeToE164 } from '../whatsapp/whatsapp-phone.util';
import {
  DEFAULT_GAMIFICATION_CONFIG,
  DEFAULT_GAMIFICATION_SETTINGS,
  type GamificationConfig,
} from './registration-gamification.defaults';
import type {
  RecordGamificationEventDto,
  SubmitGamificationLeadDto,
  UpdateRegistrationGamificationDto,
} from './dto/registration-gamification.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class RegistrationGamificationService {
  private readonly logger = new Logger(RegistrationGamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importedBrokers: ImportedBrokerContactService,
  ) {}

  private mergeConfig(raw: Prisma.JsonValue | null): GamificationConfig {
    const base = DEFAULT_GAMIFICATION_CONFIG;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const o = raw as Record<string, unknown>;
    return {
      ...base,
      ...(o as Partial<GamificationConfig>),
      colors: { ...base.colors, ...(o.colors as object) },
      buttons: { ...base.buttons, ...(o.buttons as object) },
      offers: Array.isArray(o.offers) ? (o.offers as GamificationConfig['offers']) : base.offers,
      resultPages: {
        ...base.resultPages,
        ...(o.resultPages as GamificationConfig['resultPages']),
      },
    };
  }

  private serializeSettings(row: {
    id: string;
    enabled: boolean;
    gameType: string;
    audience: string;
    showOnHome: boolean;
    showOnShorts: boolean;
    showOnClassic: boolean;
    showOnPosts: boolean;
    showOnProfessionalProfile: boolean;
    triggerType: string;
    triggerShortsViews: number;
    triggerSecondsOnSite: number;
    triggerPagesVisited: number;
    frequency: string;
    decisionsCount: number;
    offerIntervalSec: number;
    bonusCredits: number;
    bonusDescription: string;
    autoEmailMarketing: boolean;
    autoWhatsAppCampaign: boolean;
    autoCrm: boolean;
    config: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      enabled: row.enabled,
      gameType: row.gameType,
      audience: row.audience,
      showOnHome: row.showOnHome,
      showOnShorts: row.showOnShorts,
      showOnClassic: row.showOnClassic,
      showOnPosts: row.showOnPosts,
      showOnProfessionalProfile: row.showOnProfessionalProfile,
      triggerType: row.triggerType,
      triggerShortsViews: row.triggerShortsViews,
      triggerSecondsOnSite: row.triggerSecondsOnSite,
      triggerPagesVisited: row.triggerPagesVisited,
      frequency: row.frequency,
      decisionsCount: row.decisionsCount,
      offerIntervalSec: row.offerIntervalSec,
      bonusCredits: row.bonusCredits,
      bonusDescription: row.bonusDescription,
      autoEmailMarketing: row.autoEmailMarketing,
      autoWhatsAppCampaign: row.autoWhatsAppCampaign,
      autoCrm: row.autoCrm,
      config: this.mergeConfig(row.config),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getOrCreate() {
    const existing = await this.prisma.registrationGamificationSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.registrationGamificationSetting.create({
      data: {
        id: SETTINGS_ID,
        ...DEFAULT_GAMIFICATION_SETTINGS,
        config: DEFAULT_GAMIFICATION_CONFIG as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async getAdminSettings() {
    const row = await this.getOrCreate();
    return this.serializeSettings(row);
  }

  async getPublicSettings() {
    const row = await this.getOrCreate();
    if (!row.enabled) return null;
    const serialized = this.serializeSettings(row);
    return {
      enabled: true,
      gameType: serialized.gameType,
      audience: serialized.audience,
      showOnHome: serialized.showOnHome,
      showOnShorts: serialized.showOnShorts,
      showOnClassic: serialized.showOnClassic,
      showOnPosts: serialized.showOnPosts,
      showOnProfessionalProfile: serialized.showOnProfessionalProfile,
      triggerType: serialized.triggerType,
      triggerShortsViews: serialized.triggerShortsViews,
      triggerSecondsOnSite: serialized.triggerSecondsOnSite,
      triggerPagesVisited: serialized.triggerPagesVisited,
      frequency: serialized.frequency,
      decisionsCount: serialized.decisionsCount,
      offerIntervalSec: serialized.offerIntervalSec,
      bonusCredits: serialized.bonusCredits,
      bonusDescription: serialized.bonusDescription,
      config: serialized.config,
    };
  }

  async updateSettings(dto: UpdateRegistrationGamificationDto) {
    await this.getOrCreate();
    const data: Prisma.RegistrationGamificationSettingUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.gameType !== undefined) data.gameType = dto.gameType.trim();
    if (dto.audience !== undefined) data.audience = dto.audience.trim();
    if (dto.showOnHome !== undefined) data.showOnHome = dto.showOnHome;
    if (dto.showOnShorts !== undefined) data.showOnShorts = dto.showOnShorts;
    if (dto.showOnClassic !== undefined) data.showOnClassic = dto.showOnClassic;
    if (dto.showOnPosts !== undefined) data.showOnPosts = dto.showOnPosts;
    if (dto.showOnProfessionalProfile !== undefined) {
      data.showOnProfessionalProfile = dto.showOnProfessionalProfile;
    }
    if (dto.triggerType !== undefined) data.triggerType = dto.triggerType.trim();
    if (dto.triggerShortsViews !== undefined) data.triggerShortsViews = dto.triggerShortsViews;
    if (dto.triggerSecondsOnSite !== undefined) {
      data.triggerSecondsOnSite = dto.triggerSecondsOnSite;
    }
    if (dto.triggerPagesVisited !== undefined) data.triggerPagesVisited = dto.triggerPagesVisited;
    if (dto.frequency !== undefined) data.frequency = dto.frequency.trim();
    if (dto.decisionsCount !== undefined) data.decisionsCount = dto.decisionsCount;
    if (dto.offerIntervalSec !== undefined) data.offerIntervalSec = dto.offerIntervalSec;
    if (dto.bonusCredits !== undefined) data.bonusCredits = dto.bonusCredits;
    if (dto.bonusDescription !== undefined) data.bonusDescription = dto.bonusDescription.trim();
    if (dto.autoEmailMarketing !== undefined) data.autoEmailMarketing = dto.autoEmailMarketing;
    if (dto.autoWhatsAppCampaign !== undefined) {
      data.autoWhatsAppCampaign = dto.autoWhatsAppCampaign;
    }
    if (dto.autoCrm !== undefined) data.autoCrm = dto.autoCrm;
    if (dto.config !== undefined) {
      const current = await this.getOrCreate();
      const merged = {
        ...this.mergeConfig(current.config),
        ...dto.config,
      };
      data.config = merged as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.registrationGamificationSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });
    return this.serializeSettings(updated);
  }

  async checkEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true },
    });
    const existingLead = await this.prisma.registrationGamificationLead.findFirst({
      where: { email: normalized },
      select: { id: true },
    });
    return {
      exists: Boolean(user),
      hasLead: Boolean(existingLead),
      suggestLogin: Boolean(user),
    };
  }

  private clientIp(req?: Request): string | null {
    const xf = req?.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]?.trim() ?? null;
    return req?.ip ?? null;
  }

  async submitLead(dto: SubmitGamificationLeadDto, req?: Request) {
    const email = dto.email.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new BadRequestException('Zadejte platný e-mail.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      return {
        ok: false,
        suggestLogin: true,
        message: 'Tento e-mail je již registrován. Přihlaste se prosím.',
      };
    }

    const settings = await this.getOrCreate();
    const phone = dto.phone?.trim() || null;
    const normalizedPhone = phone ? normalizeToE164(phone) : null;

    const lead = await this.prisma.registrationGamificationLead.create({
      data: {
        email,
        phone,
        fullName: dto.fullName?.trim() || null,
        companyName: dto.companyName?.trim() || null,
        visitorType: dto.visitorType.trim().slice(0, 32),
        score: dto.score,
        gameDurationSec: dto.gameDurationSec ?? null,
        decisions: (dto.decisions ?? []) as Prisma.InputJsonValue,
        gameResult: (dto.gameResult ?? {}) as Prisma.InputJsonValue,
        ipAddress: this.clientIp(req),
        landingPage: dto.landingPage?.trim() || null,
        referer: dto.referer?.trim() || null,
        visitSource: dto.visitSource?.trim() || null,
        utmSource: dto.utmSource?.trim() || null,
        utmMedium: dto.utmMedium?.trim() || null,
        utmCampaign: dto.utmCampaign?.trim() || null,
        utmContent: dto.utmContent?.trim() || null,
        utmTerm: dto.utmTerm?.trim() || null,
        gameSessionId: dto.gameSessionId?.trim() || null,
      },
    });

    await this.recordEvent({
      eventType: 'lead_submitted',
      visitorKey: dto.visitorKey,
      sessionId: dto.gameSessionId,
      metadata: { leadId: lead.id, visitorType: lead.visitorType },
    });

    if (settings.autoEmailMarketing || settings.autoCrm) {
      try {
        await this.importedBrokers.upsertFromDirectoryImport(
          {
            companyName: dto.companyName?.trim() || dto.fullName?.trim() || 'Lead z gamifikace',
            email,
            phone,
            normalizedPhone,
            website: null,
            city: null,
            address: null,
            sourceUrl: dto.landingPage?.trim() || 'gamification:real_estate_magnate',
            listingCount: 0,
          },
          'gamification_registrace',
        );
      } catch (e) {
        this.logger.warn(
          `CRM sync failed for gamification lead ${lead.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'registration_gamification_lead',
        leadId: lead.id,
        email,
        visitorType: lead.visitorType,
        score: lead.score,
      }),
    );

    return {
      ok: true,
      leadId: lead.id,
      bonusCredits: settings.bonusCredits,
      bonusDescription: settings.bonusDescription,
      thankYouTitle: this.mergeConfig(settings.config).thankYouTitle,
      thankYouSubtitle: this.mergeConfig(settings.config).thankYouSubtitle,
    };
  }

  async recordEvent(dto: RecordGamificationEventDto) {
    await this.prisma.registrationGamificationEvent.create({
      data: {
        eventType: dto.eventType.trim().slice(0, 64),
        visitorKey: dto.visitorKey?.trim() || null,
        sessionId: dto.sessionId?.trim() || null,
        pagePath: dto.pagePath?.trim() || null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return { ok: true };
  }

  async getStats() {
    const [starts, completions, leads, registered] = await this.prisma.$transaction([
      this.prisma.registrationGamificationEvent.count({
        where: { eventType: 'game_started' },
      }),
      this.prisma.registrationGamificationEvent.count({
        where: { eventType: 'game_completed' },
      }),
      this.prisma.registrationGamificationLead.count(),
      this.prisma.registrationGamificationLead.count({
        where: { userId: { not: null } },
      }),
    ]);

    const byType = await this.prisma.registrationGamificationLead.groupBy({
      by: ['visitorType'],
      _count: true,
    });

    const avgDuration = await this.prisma.registrationGamificationLead.aggregate({
      _avg: { gameDurationSec: true },
      where: { gameDurationSec: { not: null } },
    });

    return {
      gameStarts: starts,
      gameCompletions: completions,
      conversionRate: starts > 0 ? Math.round((leads / starts) * 1000) / 10 : 0,
      emailsCollected: leads,
      registrations: registered,
      visitorTypes: byType.map((r) => ({ type: r.visitorType, count: r._count })),
      avgGameDurationSec: Math.round(avgDuration._avg.gameDurationSec ?? 0),
    };
  }

  async listLeads(q: {
    search?: string;
    visitorType?: string;
    registered?: boolean;
    skip?: number;
    take?: number;
  }) {
    const take = Math.min(100, Math.max(1, q.take ?? 40));
    const skip = Math.max(0, q.skip ?? 0);
    const where: Prisma.RegistrationGamificationLeadWhereInput = {};

    if (q.visitorType?.trim()) where.visitorType = q.visitorType.trim();
    if (q.registered === true) where.userId = { not: null };
    if (q.registered === false) where.userId = null;

    const s = q.search?.trim();
    if (s) {
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { fullName: { contains: s, mode: 'insensitive' } },
        { companyName: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.registrationGamificationLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.registrationGamificationLead.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        email: r.email,
        phone: r.phone,
        fullName: r.fullName,
        companyName: r.companyName,
        visitorType: r.visitorType,
        score: r.score,
        gameDurationSec: r.gameDurationSec,
        visitSource: r.visitSource,
        landingPage: r.landingPage,
        utmSource: r.utmSource,
        utmCampaign: r.utmCampaign,
        registered: Boolean(r.userId),
        userId: r.userId,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      skip,
      take,
    };
  }

  async deleteLeads(ids: string[]) {
    const res = await this.prisma.registrationGamificationLead.deleteMany({
      where: { id: { in: ids } },
    });
    return { deleted: res.count };
  }

  async exportLeadsCsv(q: { search?: string; visitorType?: string; registered?: boolean }) {
    const { items } = await this.listLeads({ ...q, skip: 0, take: 10_000 });
    const esc = (v: string | null | undefined) => {
      const t = (v ?? '').replace(/"/g, '""');
      return `"${t}"`;
    };
    const header = [
      'fullName',
      'email',
      'phone',
      'companyName',
      'visitorType',
      'score',
      'gameDurationSec',
      'visitSource',
      'utmSource',
      'utmCampaign',
      'landingPage',
      'registered',
      'createdAt',
    ].join(',');
    const lines = items.map((r) =>
      [
        esc(r.fullName),
        esc(r.email),
        esc(r.phone),
        esc(r.companyName),
        esc(r.visitorType),
        r.score,
        r.gameDurationSec ?? '',
        esc(r.visitSource),
        esc(r.utmSource),
        esc(r.utmCampaign),
        esc(r.landingPage),
        r.registered ? '1' : '0',
        esc(r.createdAt),
      ].join(','),
    );
    return `\uFEFF${header}\n${lines.join('\n')}\n`;
  }
}
