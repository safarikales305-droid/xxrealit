import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';

const SETTINGS_ID = 'default';

export type MetaCampaignProductItem = {
  id: string;
  listingId: string;
  catalogItemId: string | null;
  title: string;
  price: number | null;
  currency: string;
  city: string | null;
  address: string | null;
  propertyType: string | null;
  availability: string;
  imageUrl: string | null;
  detailUrl: string;
  exportStatus: string;
  lastSyncedAt: string | null;
};

export type MetaCampaignLaunchBlocker = {
  key: string;
  message: string;
};

@Injectable()
export class MetaCenterCampaignsService {
  private readonly logger = new Logger(MetaCenterCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  private frontendBase(): string {
    return (
      this.fbConfig.resolveFrontendUrl()?.replace(/\/+$/, '') || 'https://www.xxrealit.cz'
    );
  }

  private isLiveEnabled(): boolean {
    const raw = process.env.META_CAMPAIGNS_LIVE_ENABLED?.trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  async listCampaignProducts(): Promise<{
    ok: true;
    items: MetaCampaignProductItem[];
    message: string | null;
  }> {
    try {
      const exports = await this.prisma.metaCatalogExportItem.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      if (!exports.length) {
        return { ok: true, items: [], message: 'Feed zatím neobsahuje žádné položky.' };
      }

      const propertyIds = exports.map((e) => e.propertyId);
      const properties = await this.prisma.property.findMany({
        where: { id: { in: propertyIds } },
        select: {
          id: true,
          title: true,
          slug: true,
          price: true,
          currency: true,
          city: true,
          address: true,
          propertyType: true,
          mainImage: true,
          thumbnailUrl: true,
          facebookShareImageUrl: true,
        },
      });
      const propMap = new Map(properties.map((p) => [p.id, p]));
      const base = this.frontendBase();

      const items: MetaCampaignProductItem[] = exports.map((e) => {
        const p = propMap.get(e.propertyId);
        const slugPath = p?.slug?.trim()
          ? `/nemovitosti/${p.slug.trim()}`
          : `/nemovitost/${e.propertyId}`;
        const imageUrl =
          p?.facebookShareImageUrl ?? p?.mainImage ?? p?.thumbnailUrl ?? null;
        return {
          id: e.propertyId,
          listingId: e.propertyId,
          catalogItemId: e.metaProductId ?? e.propertyId,
          title: p?.title ?? e.propertyId,
          price: p?.price ?? null,
          currency: p?.currency ?? 'CZK',
          city: p?.city ?? null,
          address: p?.address?.trim() ? p.address : null,
          propertyType: p?.propertyType ?? null,
          availability: e.exportStatus === 'exported' ? 'in stock' : 'pending',
          imageUrl,
          detailUrl: `${base}${slugPath}`,
          exportStatus: e.exportStatus,
          lastSyncedAt: e.lastExportedAt?.toISOString() ?? e.updatedAt.toISOString(),
        };
      });

      return { ok: true, items, message: null };
    } catch (err) {
      this.logger.warn(
        `listCampaignProducts failed: ${err instanceof Error ? err.message : err}`,
      );
      return {
        ok: true,
        items: [],
        message: err instanceof Error ? err.message : 'Produkty nelze načíst.',
      };
    }
  }

  computeLaunchBlockers(
    dto: CreateMetaCampaignDto,
    row: Awaited<ReturnType<typeof this.getSettingsRow>>,
  ): MetaCampaignLaunchBlocker[] {
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const blockers: MetaCampaignLaunchBlocker[] = [];

    if (!isMarketingAdsTokenActive(row ?? {})) {
      blockers.push({ key: 'ads_api', message: 'Ads API není připojeno.' });
    }
    if (!ids.adAccountId) {
      blockers.push({ key: 'ad_account', message: 'Reklamní účet není připojen.' });
    }
    if (!ids.catalogId) {
      blockers.push({ key: 'catalog', message: 'Catalog ID chybí.' });
    }
    if (!ids.datasetId && !ids.pixelId) {
      blockers.push({ key: 'dataset', message: 'Dataset ID chybí.' });
    }
    if (!dto.name?.trim()) {
      blockers.push({ key: 'name', message: 'Název kampaně je prázdný.' });
    }
    if (!dto.cityName?.trim()) {
      blockers.push({ key: 'city', message: 'Lokalita (město) není zadaná.' });
    }
    if (!dto.dailyBudgetCzk || dto.dailyBudgetCzk <= 0) {
      blockers.push({ key: 'budget', message: 'Denní rozpočet musí být větší než 0.' });
    }
    if (!dto.selectedProductIds?.length) {
      blockers.push({
        key: 'products',
        message: 'Vyberte alespoň jeden katalogový inzerát.',
      });
    }

    const start = this.parseDate(dto.startDate);
    const end = this.parseDate(dto.endDate);
    if (!start) {
      blockers.push({ key: 'start_date', message: 'Datum spuštění není platné.' });
    }
    if (!end) {
      blockers.push({ key: 'end_date', message: 'Datum ukončení není platné.' });
    }
    if (start && end && end.getTime() < start.getTime()) {
      blockers.push({
        key: 'date_range',
        message: 'Datum ukončení musí být po datu spuštění.',
      });
    }

    return blockers;
  }

  async listCampaignDrafts() {
    try {
      const items = await this.prisma.metaMarketingCampaignDraft.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      return {
        ok: true as const,
        items: items.map((row) => this.serializeDraft(row)),
      };
    } catch (err) {
      return {
        ok: true as const,
        items: [] as ReturnType<typeof this.serializeDraft>[],
        message: err instanceof Error ? err.message : 'Koncepty nelze načíst.',
      };
    }
  }

  async createCampaign(dto: CreateMetaCampaignDto, mode: 'draft' | 'launch' = 'draft') {
    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const blockers = this.computeLaunchBlockers(dto, row);

    if (mode === 'launch' && blockers.length > 0) {
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: blockers.map((b) => b.message).join(' '),
        blockers,
        campaign: null,
      };
    }

    const data = this.buildDraftData(dto, ids);
    const draft = await this.prisma.metaMarketingCampaignDraft.create({ data });

    if (mode === 'draft' || !this.isLiveEnabled()) {
      const message = this.isLiveEnabled()
        ? 'Kampaň byla uložena jako koncept.'
        : 'Kampaň byla uložena jako koncept. Ostré spouštění je vypnuté.';
      return {
        ok: true as const,
        status: 'draft' as const,
        message,
        liveEnabled: this.isLiveEnabled(),
        campaign: this.serializeDraft(draft),
      };
    }

    const launched = await this.launchLiveCampaign(draft.id, dto, ids);
    return launched;
  }

  private async launchLiveCampaign(
    draftId: string,
    dto: CreateMetaCampaignDto,
    ids: ReturnType<typeof resolveMetaCenterIds>,
  ) {
    let token: string;
    try {
      token = await this.oauth.resolveMarketingAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Marketing token chybí.';
      await this.markDraftError(draftId, msg);
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    const actId = (ids.adAccountId ?? '').replace(/^act_/, '');
    if (!actId) {
      const msg = 'Chybí reklamní účet.';
      await this.markDraftError(draftId, msg);
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    const objective = this.mapObjective(dto.objective);
    const campaignRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/campaigns`,
      token,
      {
        name: dto.name.trim(),
        objective,
        status: 'PAUSED',
        special_ad_categories: JSON.stringify(['HOUSING']),
      },
    );

    if (!campaignRes.ok || !campaignRes.data.id) {
      const msg =
        (!campaignRes.ok ? campaignRes.errorMessage : null) ||
        'Vytvoření kampaně v Meta selhalo.';
      await this.markDraftError(draftId, msg);
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    const metaCampaignId = campaignRes.data.id;
    const targeting = this.buildTargeting(dto);
    const dailyBudgetMinor = Math.round(dto.dailyBudgetCzk * 100);
    const startTime = this.parseDate(dto.startDate)?.toISOString() ?? undefined;
    const endTime = this.parseDate(dto.endDate)?.toISOString() ?? undefined;

    const adSetRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/adsets`,
      token,
      {
        name: `${dto.name.trim()} — sada`,
        campaign_id: metaCampaignId,
        daily_budget: String(dailyBudgetMinor),
        billing_event: 'IMPRESSIONS',
        optimization_goal: dto.objective === 'catalog' ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: JSON.stringify(targeting),
        start_time: startTime,
        end_time: endTime,
        status: 'PAUSED',
      },
    );

    if (!adSetRes.ok || !adSetRes.data.id) {
      const msg =
        (!adSetRes.ok ? adSetRes.errorMessage : null) || 'Vytvoření ad setu v Meta selhalo.';
      await this.prisma.metaMarketingCampaignDraft.update({
        where: { id: draftId },
        data: { metaCampaignId, status: 'error', errorMessage: msg },
      });
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    const metaAdSetId = adSetRes.data.id;
    const updated = await this.prisma.metaMarketingCampaignDraft.update({
      where: { id: draftId },
      data: {
        metaCampaignId,
        metaAdSetId,
        status: 'active',
        errorMessage: null,
      },
    });

    this.logger.log(
      `[meta-campaign] live created campaign=${metaCampaignId} adset=${metaAdSetId} draft=${draftId}`,
    );

    return {
      ok: true as const,
      status: 'active' as const,
      message: `Kampaň vytvořena v Meta (stav PAUSED). Campaign ID: ${metaCampaignId}`,
      campaign: this.serializeDraft(updated),
    };
  }

  private buildTargeting(dto: CreateMetaCampaignDto): Record<string, unknown> {
    const lat = dto.latitude;
    const lng = dto.longitude;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        geo_locations: {
          custom_locations: [
            {
              latitude: lat,
              longitude: lng,
              radius: dto.radiusKm,
              distance_unit: 'kilometer',
            },
          ],
        },
      };
    }
    return {
      geo_locations: {
        cities: [{ key: dto.cityName.trim(), radius: dto.radiusKm, distance_unit: 'kilometer' }],
      },
    };
  }

  private mapObjective(objective: string): string {
    switch (objective) {
      case 'catalog':
        return 'OUTCOME_SALES';
      case 'lead':
        return 'OUTCOME_LEADS';
      case 'messages':
        return 'OUTCOME_ENGAGEMENT';
      case 'traffic':
      default:
        return 'OUTCOME_TRAFFIC';
    }
  }

  private async markDraftError(draftId: string, message: string) {
    await this.prisma.metaMarketingCampaignDraft.update({
      where: { id: draftId },
      data: { status: 'error', errorMessage: message },
    });
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value?.trim()) return null;
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private async getSettingsRow() {
    return this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
  }

  private buildDraftData(
    dto: CreateMetaCampaignDto,
    ids: ReturnType<typeof resolveMetaCenterIds>,
  ): Prisma.MetaMarketingCampaignDraftCreateInput {
    return {
      name: dto.name.trim(),
      objective: dto.objective,
      status: 'draft',
      adAccountId: ids.adAccountId,
      catalogId: ids.catalogId,
      datasetId: ids.datasetId ?? ids.pixelId,
      propertyType: dto.propertyType ?? null,
      cityName: dto.cityName.trim(),
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      radiusKm: dto.radiusKm,
      dailyBudgetCzk: dto.dailyBudgetCzk,
      startDate: this.parseDate(dto.startDate),
      endDate: this.parseDate(dto.endDate),
      selectedProductIds: dto.selectedProductIds as Prisma.InputJsonValue,
    };
  }

  private serializeDraft(row: {
    id: string;
    name: string;
    objective: string;
    status: string;
    adAccountId: string | null;
    catalogId: string | null;
    datasetId: string | null;
    propertyType: string | null;
    cityName: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number | null;
    dailyBudgetCzk: number | null;
    startDate: Date | null;
    endDate: Date | null;
    selectedProductIds: unknown;
    metaCampaignId: string | null;
    metaAdSetId: string | null;
    metaAdId: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const productIds = Array.isArray(row.selectedProductIds)
      ? row.selectedProductIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      id: row.id,
      name: row.name,
      objective: row.objective,
      status: row.status,
      adAccountId: row.adAccountId,
      catalogId: row.catalogId,
      datasetId: row.datasetId,
      propertyType: row.propertyType,
      cityName: row.cityName,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusKm: row.radiusKm,
      dailyBudgetCzk: row.dailyBudgetCzk,
      startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
      selectedProductIds: productIds,
      metaCampaignId: row.metaCampaignId,
      metaAdSetId: row.metaAdSetId,
      metaAdId: row.metaAdId,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
