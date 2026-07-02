import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { LeadPrice, PublicPortalMonthlyStat, PublicPortalStat } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateLeadPriceDto,
  UpdateLeadPriceDto,
  UpdatePublicPortalStatDto,
  UpsertPublicPortalMonthlyStatDto,
} from './dto/o-portalu.dto';
import { DEFAULT_LEAD_PRICES, DEFAULT_PUBLIC_PORTAL_STATS } from './o-portalu.defaults';
import {
  labelToPrismaSource,
  OPortaluStatsImportService,
  prismaSourceToLabel,
  type StatValueSourceLabel,
} from './o-portalu-stats-import.service';
import { computeDisplayedValue } from './o-portalu-stat.util';

export { computeDisplayedValue } from './o-portalu-stat.util';

function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  const months = [
    'leden',
    'únor',
    'březen',
    'duben',
    'květen',
    'červen',
    'červenec',
    'srpen',
    'září',
    'říjen',
    'listopad',
    'prosinec',
  ];
  const idx = Number(mon) - 1;
  if (!year || idx < 0 || idx > 11) return month;
  return `${months[idx]} ${year}`;
}

@Injectable()
export class OPortaluService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsImport: OPortaluStatsImportService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
    await this.statsImport.ensureStatValueSources();
  }

  async ensureDefaults(): Promise<void> {
    for (const stat of DEFAULT_PUBLIC_PORTAL_STATS) {
      const existing = await this.prisma.publicPortalStat.findUnique({
        where: { key: stat.key },
      });
      if (!existing) {
        const displayedValue = computeDisplayedValue({
          realValue: stat.realValue ?? 0,
          multiplier: stat.multiplier ?? 1,
          manualValue: null,
        });
        await this.prisma.publicPortalStat.create({
          data: {
            key: stat.key,
            label: stat.label,
            order: stat.order,
            category: stat.category ?? null,
            icon: stat.icon ?? null,
            realValue: stat.realValue ?? 0,
            multiplier: stat.multiplier ?? 1,
            displayedValue,
            valueSource: labelToPrismaSource(stat.valueSource ?? 'manual'),
          },
        });
      }
    }

    const leadCount = await this.prisma.leadPrice.count();
    if (leadCount === 0) {
      for (const lead of DEFAULT_LEAD_PRICES) {
        await this.prisma.leadPrice.create({ data: lead });
      }
    }
  }

  private serializeStatPublic(stat: PublicPortalStat) {
    return {
      key: stat.key,
      label: stat.label,
      value: stat.displayedValue,
      category: stat.category,
      icon: stat.icon,
    };
  }

  private serializeStatAdmin(stat: PublicPortalStat) {
    return {
      id: stat.id,
      key: stat.key,
      label: stat.label,
      realValue: stat.realValue,
      multiplier: stat.multiplier,
      manualValue: stat.manualValue,
      displayedValue: stat.displayedValue,
      enabled: stat.enabled,
      order: stat.order,
      category: stat.category,
      icon: stat.icon,
      valueSource: prismaSourceToLabel(stat.valueSource),
      lastFetchedAt: stat.lastFetchedAt?.toISOString() ?? null,
      lastFetchError: stat.lastFetchError,
      updatedAt: stat.updatedAt.toISOString(),
    };
  }

  private serializeMonthlyPublic(row: PublicPortalMonthlyStat) {
    const multiplier = row.multiplier ?? 1;
    return {
      month: row.month,
      label: monthLabel(row.month),
      visits: Math.round(row.visits * multiplier),
      views: Math.round(row.views * multiplier),
      socialReach: Math.round(row.socialReach * multiplier),
      leads: Math.round(row.leads * multiplier),
    };
  }

  private serializeMonthlyAdmin(row: PublicPortalMonthlyStat) {
    const multiplier = row.multiplier ?? 1;
    return {
      id: row.id,
      month: row.month,
      label: monthLabel(row.month),
      visits: row.visits,
      views: row.views,
      socialReach: row.socialReach,
      leads: row.leads,
      multiplier: row.multiplier,
      displayedVisits: Math.round(row.visits * multiplier),
      displayedViews: Math.round(row.views * multiplier),
      displayedSocialReach: Math.round(row.socialReach * multiplier),
      displayedLeads: Math.round(row.leads * multiplier),
      enabled: row.enabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeLeadPublic(lead: LeadPrice) {
    return {
      id: lead.id,
      title: lead.title,
      description: lead.description,
      priceCzk: lead.priceCzk,
      priceCredits: lead.priceCredits,
      appliesToRoles: lead.appliesToRoles,
      billedToLabel: lead.billedToLabel,
    };
  }

  private serializeLeadAdmin(lead: LeadPrice) {
    return {
      id: lead.id,
      title: lead.title,
      description: lead.description,
      priceCzk: lead.priceCzk,
      priceCredits: lead.priceCredits,
      appliesToRoles: lead.appliesToRoles,
      billedToLabel: lead.billedToLabel,
      active: lead.active,
      order: lead.order,
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  async getPublicPayload() {
    const [stats, monthly, leadPrices] = await Promise.all([
      this.prisma.publicPortalStat.findMany({
        where: { enabled: true },
        orderBy: { order: 'asc' },
      }),
      this.prisma.publicPortalMonthlyStat.findMany({
        where: { enabled: true },
        orderBy: { month: 'asc' },
      }),
      this.prisma.leadPrice.findMany({
        where: { active: true },
        orderBy: { order: 'asc' },
      }),
    ]);

    const monthlyPublic = monthly.map((row) => this.serializeMonthlyPublic(row));
    const chartMode = monthlyPublic.length > 0 ? 'monthly' : 'summary';

    let summaryChart: Array<{
      label: string;
      visits: number;
      views: number;
      socialReach: number;
      leads: number;
    }> = [];

    if (chartMode === 'summary') {
      const byKey = Object.fromEntries(stats.map((s) => [s.key, s.displayedValue]));
      const socialReach =
        (byKey.facebook_reach ?? 0) +
        (byKey.tiktok_reach ?? 0) +
        (byKey.youtube_reach ?? 0) +
        (byKey.instagram_reach ?? 0);
      summaryChart = [
        {
          label: 'Aktuálně',
          visits: byKey.web_visits ?? 0,
          views: (byKey.listing_views ?? 0) + (byKey.reel_views ?? 0),
          socialReach,
          leads: byKey.leads_sent ?? 0,
        },
      ];
    }

    return {
      title: 'Aktuální dosah portálu XXrealit',
      stats: stats.map((s) => this.serializeStatPublic(s)),
      monthly: monthlyPublic,
      chartMode,
      summaryChart,
      leadPrices: leadPrices.map((l) => this.serializeLeadPublic(l)),
    };
  }

  async getAdminStats() {
    const [stats, monthly, importLogs] = await Promise.all([
      this.prisma.publicPortalStat.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.publicPortalMonthlyStat.findMany({ orderBy: { month: 'asc' } }),
      this.prisma.publicPortalStatImportLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    return {
      stats: stats.map((s) => this.serializeStatAdmin(s)),
      monthly: monthly.map((m) => this.serializeMonthlyAdmin(m)),
      importLogs: importLogs.map((log) => ({
        id: log.id,
        statKey: log.statKey,
        source: log.source,
        fetchedValue: log.fetchedValue,
        error: log.error,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async updateAdminStats(input: {
    stats?: UpdatePublicPortalStatDto[];
    monthly?: UpsertPublicPortalMonthlyStatDto[];
  }) {
    if (input.stats?.length) {
      for (const patch of input.stats) {
        const current = await this.prisma.publicPortalStat.findUnique({
          where: { id: patch.id },
        });
        if (!current) continue;

        const realValue = patch.realValue ?? current.realValue;
        const multiplier = patch.multiplier ?? current.multiplier;
        const manualValue =
          patch.manualValue !== undefined ? patch.manualValue : current.manualValue;
        const displayedValue = computeDisplayedValue({ realValue, multiplier, manualValue });
        const valueSource = patch.valueSource
          ? labelToPrismaSource(patch.valueSource as StatValueSourceLabel)
          : current.valueSource;

        await this.prisma.publicPortalStat.update({
          where: { id: patch.id },
          data: {
            label: patch.label ?? current.label,
            realValue,
            multiplier,
            manualValue,
            displayedValue,
            enabled: patch.enabled ?? current.enabled,
            order: patch.order ?? current.order,
            valueSource,
          },
        });
      }
    }

    if (input.monthly?.length) {
      for (const row of input.monthly) {
        if (row.id) {
          const current = await this.prisma.publicPortalMonthlyStat.findUnique({
            where: { id: row.id },
          });
          if (!current) continue;
          await this.prisma.publicPortalMonthlyStat.update({
            where: { id: row.id },
            data: {
              month: row.month ?? current.month,
              visits: row.visits ?? current.visits,
              views: row.views ?? current.views,
              socialReach: row.socialReach ?? current.socialReach,
              leads: row.leads ?? current.leads,
              multiplier: row.multiplier ?? current.multiplier,
              enabled: row.enabled ?? current.enabled,
            },
          });
        } else {
          await this.prisma.publicPortalMonthlyStat.upsert({
            where: { month: row.month },
            create: {
              month: row.month,
              visits: row.visits ?? 0,
              views: row.views ?? 0,
              socialReach: row.socialReach ?? 0,
              leads: row.leads ?? 0,
              multiplier: row.multiplier ?? 1,
              enabled: row.enabled ?? true,
            },
            update: {
              visits: row.visits ?? 0,
              views: row.views ?? 0,
              socialReach: row.socialReach ?? 0,
              leads: row.leads ?? 0,
              multiplier: row.multiplier ?? 1,
              enabled: row.enabled ?? true,
            },
          });
        }
      }
    }

    return this.getAdminStats();
  }

  async deleteMonthlyStat(id: string) {
    await this.prisma.publicPortalMonthlyStat.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Měsíční řádek nenalezen');
    });
    return { ok: true };
  }

  async listLeadPricesAdmin() {
    const rows = await this.prisma.leadPrice.findMany({ orderBy: { order: 'asc' } });
    return { items: rows.map((r) => this.serializeLeadAdmin(r)) };
  }

  async createLeadPrice(dto: CreateLeadPriceDto) {
    const maxOrder = await this.prisma.leadPrice.aggregate({ _max: { order: true } });
    const row = await this.prisma.leadPrice.create({
      data: {
        title: dto.title,
        description: dto.description,
        priceCzk: dto.priceCzk,
        priceCredits: dto.priceCredits,
        appliesToRoles: dto.appliesToRoles,
        billedToLabel: dto.billedToLabel ?? null,
        active: dto.active ?? true,
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
      },
    });
    return this.serializeLeadAdmin(row);
  }

  async updateLeadPrice(id: string, dto: UpdateLeadPriceDto) {
    const current = await this.prisma.leadPrice.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Položka ceníku nenalezena');
    const row = await this.prisma.leadPrice.update({
      where: { id },
      data: {
        title: dto.title ?? current.title,
        description: dto.description ?? current.description,
        priceCzk: dto.priceCzk ?? current.priceCzk,
        priceCredits: dto.priceCredits ?? current.priceCredits,
        appliesToRoles: dto.appliesToRoles ?? current.appliesToRoles,
        billedToLabel:
          dto.billedToLabel !== undefined ? dto.billedToLabel : current.billedToLabel,
        active: dto.active ?? current.active,
        order: dto.order ?? current.order,
      },
    });
    return this.serializeLeadAdmin(row);
  }

  async deleteLeadPrice(id: string) {
    await this.prisma.leadPrice.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Položka ceníku nenalezena');
    });
    return { ok: true };
  }

  async refreshDatabaseStats() {
    const result = await this.statsImport.collectDatabaseStats();
    const stats = await this.getAdminStats();
    return { ...result, stats: stats.stats, importLogs: stats.importLogs };
  }

  async refreshFacebookStats() {
    const result = await this.statsImport.collectFacebookStats();
    const stats = await this.getAdminStats();
    return { ...result, stats: stats.stats, importLogs: stats.importLogs };
  }

  async refreshInstagramStats() {
    const result = await this.statsImport.collectInstagramStats();
    const stats = await this.getAdminStats();
    return { ...result, stats: stats.stats, importLogs: stats.importLogs };
  }

  async refreshStatById(statId: string) {
    const stat = await this.prisma.publicPortalStat.findUnique({ where: { id: statId } });
    if (!stat) throw new NotFoundException('Statistika nenalezena');
    const result = await this.statsImport.refreshStatFromSource(stat.key);
    const stats = await this.getAdminStats();
    return { ...result, stats: stats.stats, importLogs: stats.importLogs };
  }

  async recalculatePublicValues() {
    const result = await this.statsImport.recalculateDisplayedValues();
    const stats = await this.getAdminStats();
    return { ok: true, ...result, stats: stats.stats };
  }
}
