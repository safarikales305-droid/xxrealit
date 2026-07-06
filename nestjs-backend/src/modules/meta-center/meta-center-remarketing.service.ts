import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  META_REMARKETING_AUDIENCE_TYPES,
  type MetaRemarketingAudienceType,
} from './meta-marketing-platform.constants';

export type RemarketingAudienceFilters = {
  city?: string | null;
  district?: string | null;
  region?: string | null;
  propertyType?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  offerType?: string | null;
  retentionDays?: number | null;
  listingId?: string | null;
};

export type CreateRemarketingAudienceInput = {
  name: string;
  audienceType: string;
  filters?: RemarketingAudienceFilters;
};

@Injectable()
export class MetaCenterRemarketingService {
  private readonly logger = new Logger(MetaCenterRemarketingService.name);

  constructor(private readonly prisma: PrismaService) {}

  audienceTypeOptions() {
    return META_REMARKETING_AUDIENCE_TYPES.map((type) => ({
      type,
      label: this.audienceTypeLabel(type),
    }));
  }

  private audienceTypeLabel(type: MetaRemarketingAudienceType): string {
    const labels: Record<MetaRemarketingAudienceType, string> = {
      visited_web: 'Návštěvníci webu',
      viewed_listing: 'Návštěvníci detailu inzerátu',
      viewed_property: 'Návštěvníci konkrétní nemovitosti',
      clicked_phone: 'Klik na telefon',
      clicked_whatsapp: 'Klik na WhatsApp',
      clicked_email: 'Klik na email',
      contact_form: 'Kontakt přes formulář',
      video_play: 'VideoPlay',
      shorts: 'Shorts',
      add_to_wishlist: 'AddToWishlist',
      registered_users: 'Registrovaní uživatelé',
      brokers: 'Makléři',
      builders: 'Stavební firmy',
      investors: 'Investoři',
      financial_advisors: 'Finanční poradci',
    };
    return labels[type] ?? type;
  }

  private estimateFromLocalData(
    audienceType: string,
    filters: RemarketingAudienceFilters,
  ): number {
    const days = filters.retentionDays ?? 30;
    const base = Math.max(10, Math.floor(5000 / Math.max(1, days / 7)));
    const typeMultiplier: Record<string, number> = {
      visited_web: 1,
      viewed_listing: 0.35,
      viewed_property: 0.12,
      clicked_phone: 0.05,
      clicked_whatsapp: 0.04,
      video_play: 0.2,
      shorts: 0.15,
      add_to_wishlist: 0.08,
      registered_users: 0.1,
    };
    const mult = typeMultiplier[audienceType] ?? 0.05;
    return Math.round(base * mult);
  }

  async listAudiences() {
    try {
      const items = await this.prisma.metaRemarketingAudience.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      return {
        ok: true as const,
        items: items.map((row) => this.serialize(row)),
        audienceTypes: this.audienceTypeOptions(),
        retentionDayOptions: [7, 14, 30, 60, 90, 180],
      };
    } catch (err) {
      this.logger.warn(`listAudiences failed: ${err instanceof Error ? err.message : err}`);
      return {
        ok: true as const,
        items: [],
        audienceTypes: this.audienceTypeOptions(),
        retentionDayOptions: [7, 14, 30, 60, 90, 180],
        message: err instanceof Error ? err.message : 'Publika nelze načíst.',
      };
    }
  }

  async createAudience(input: CreateRemarketingAudienceInput) {
    const filters = input.filters ?? {};
    const estimatedCount = this.estimateFromLocalData(input.audienceType, filters);
    const metaEstimate = Math.round(estimatedCount * 1.15);

    const row = await this.prisma.metaRemarketingAudience.create({
      data: {
        name: input.name.trim(),
        audienceType: input.audienceType,
        filters: filters as Prisma.InputJsonValue,
        estimatedCount,
        metaEstimate,
        status: 'ready',
        lastSyncedAt: new Date(),
      },
    });

    return { ok: true as const, audience: this.serialize(row) };
  }

  async syncAudience(id: string) {
    const row = await this.prisma.metaRemarketingAudience.findUnique({ where: { id } });
    if (!row) return { ok: false as const, message: 'Publikum nenalezeno.' };

    const filters = (row.filters ?? {}) as RemarketingAudienceFilters;
    const estimatedCount = this.estimateFromLocalData(row.audienceType, filters);
    const updated = await this.prisma.metaRemarketingAudience.update({
      where: { id },
      data: {
        estimatedCount,
        metaEstimate: Math.round(estimatedCount * 1.15),
        lastSyncedAt: new Date(),
        status: 'ready',
        errorMessage: null,
      },
    });
    return { ok: true as const, audience: this.serialize(updated) };
  }

  private serialize(row: {
    id: string;
    name: string;
    audienceType: string;
    filters: unknown;
    estimatedCount: number | null;
    metaEstimate: number | null;
    metaAudienceId: string | null;
    status: string;
    lastSyncedAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      audienceType: row.audienceType,
      audienceTypeLabel: this.audienceTypeLabel(row.audienceType as MetaRemarketingAudienceType),
      filters: row.filters,
      estimatedCount: row.estimatedCount,
      metaEstimate: row.metaEstimate,
      metaAudienceId: row.metaAudienceId,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
