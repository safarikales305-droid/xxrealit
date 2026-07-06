import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import {
  META_CAMPAIGN_TARGETING_MODES,
  META_CREATIVE_TYPES,
  type MetaCampaignTargetingMode,
  type MetaCreativeType,
} from './meta-marketing-platform.constants';

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

    const row = await this.getSettingsRow();
    let audienceMetaId: string | null = null;
    if (dto.audienceId?.trim()) {
      const audience = await this.prisma.metaRemarketingAudience
        .findUnique({ where: { id: dto.audienceId.trim() } })
        .catch(() => null);
      audienceMetaId = audience?.metaAudienceId ?? null;
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
    const targeting = await this.buildTargeting(dto, audienceMetaId);
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

    let metaProductSetId: string | null = null;
    let metaCreativeId: string | null = null;
    let metaAdId: string | null = null;

    const creativeType = this.resolveCreativeType(dto.creativeType);
    const catalogId = ids.catalogId;

    if (
      catalogId &&
      dto.selectedProductIds?.length &&
      (creativeType === 'catalog_products' || dto.objective === 'catalog')
    ) {
      const productSetRes = await this.graph.post<{ id?: string }>(
        `/${catalogId}/product_sets`,
        token,
        {
          name: `${dto.name.trim()} — produkty`,
          filter: JSON.stringify({
            retailer_id: { is_any: dto.selectedProductIds },
          }),
        },
      );
      if (productSetRes.ok && productSetRes.data.id) {
        metaProductSetId = productSetRes.data.id;
        this.logger.log(`[meta-campaign] product_set=${metaProductSetId} draft=${draftId}`);
      } else {
        this.logger.warn(
          `[meta-campaign] product_set failed draft=${draftId}: ${
            !productSetRes.ok ? productSetRes.errorMessage : 'no id'
          }`,
        );
      }
    }

    const pageId = row?.pageId?.trim() ?? process.env.FACEBOOK_PAGE_ID?.trim() ?? null;
    const creativePayload = dto.creativePayload ?? {};
    const linkUrl =
      (typeof creativePayload.link === 'string' && creativePayload.link) ||
      (typeof creativePayload.detailUrl === 'string' && creativePayload.detailUrl) ||
      this.frontendBase();
    const message =
      (typeof creativePayload.text === 'string' && creativePayload.text) ||
      dto.name.trim();
    const imageUrl =
      typeof creativePayload.image === 'string' ? creativePayload.image : undefined;
    const ctaType =
      (typeof creativePayload.cta === 'string' && creativePayload.cta) || 'LEARN_MORE';

    const creativeBody: Record<string, string> = {
      name: `${dto.name.trim()} — kreativa`,
    };

    if (metaProductSetId && pageId) {
      creativeBody.product_set_id = metaProductSetId;
      creativeBody.object_story_spec = JSON.stringify({
        page_id: pageId,
        template_data: {
          link: linkUrl,
          message,
          call_to_action: { type: ctaType },
        },
      });
    } else if (pageId) {
      creativeBody.object_story_spec = JSON.stringify({
        page_id: pageId,
        link_data: {
          link: linkUrl,
          message,
          ...(imageUrl ? { picture: imageUrl } : {}),
          call_to_action: { type: ctaType, value: { link: linkUrl } },
        },
      });
    } else {
      creativeBody.object_story_spec = JSON.stringify({
        link_data: {
          link: linkUrl,
          message,
          ...(imageUrl ? { picture: imageUrl } : {}),
        },
      });
    }

    const creativeRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/adcreatives`,
      token,
      creativeBody,
    );

    if (creativeRes.ok && creativeRes.data.id) {
      metaCreativeId = creativeRes.data.id;
      this.logger.log(`[meta-campaign] creative=${metaCreativeId} draft=${draftId}`);
    } else {
      const msg =
        (!creativeRes.ok ? creativeRes.errorMessage : null) ||
        'Vytvoření kreativy v Meta selhalo.';
      await this.prisma.metaMarketingCampaignDraft.update({
        where: { id: draftId },
        data: {
          metaCampaignId,
          metaAdSetId,
          metaProductSetId,
          status: 'error',
          errorMessage: msg,
        },
      });
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    const adRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/ads`,
      token,
      {
        name: `${dto.name.trim()} — reklama`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: metaCreativeId }),
        status: 'PAUSED',
      },
    );

    if (!adRes.ok || !adRes.data.id) {
      const msg =
        (!adRes.ok ? adRes.errorMessage : null) || 'Vytvoření reklamy v Meta selhalo.';
      await this.prisma.metaMarketingCampaignDraft.update({
        where: { id: draftId },
        data: {
          metaCampaignId,
          metaAdSetId,
          metaProductSetId,
          metaCreativeId,
          status: 'error',
          errorMessage: msg,
        },
      });
      return { ok: false as const, status: 'error' as const, message: msg, campaign: null };
    }

    metaAdId = adRes.data.id;
    this.logger.log(`[meta-campaign] ad=${metaAdId} draft=${draftId}`);

    const updated = await this.prisma.metaMarketingCampaignDraft.update({
      where: { id: draftId },
      data: {
        metaCampaignId,
        metaAdSetId,
        metaProductSetId,
        metaCreativeId,
        metaAdId,
        status: 'active',
        errorMessage: null,
      },
    });

    this.logger.log(
      `[meta-campaign] live created campaign=${metaCampaignId} adset=${metaAdSetId} product_set=${metaProductSetId ?? '—'} creative=${metaCreativeId} ad=${metaAdId} draft=${draftId}`,
    );

    return {
      ok: true as const,
      status: 'active' as const,
      message: `Kampaň vytvořena v Meta (stav PAUSED). Campaign ID: ${metaCampaignId}`,
      campaign: this.serializeDraft(updated),
    };
  }

  private resolveCreativeType(value: string | undefined): MetaCreativeType {
    if (value && (META_CREATIVE_TYPES as readonly string[]).includes(value)) {
      return value as MetaCreativeType;
    }
    return 'catalog_products';
  }

  private resolveTargetingMode(value: string | undefined): MetaCampaignTargetingMode {
    if (value && (META_CAMPAIGN_TARGETING_MODES as readonly string[]).includes(value)) {
      return value as MetaCampaignTargetingMode;
    }
    return 'map';
  }

  private async buildTargeting(
    dto: CreateMetaCampaignDto,
    audienceMetaId?: string | null,
  ): Promise<Record<string, unknown>> {
    const mode = this.resolveTargetingMode(dto.targetingMode);
    const lat = dto.latitude;
    const lng = dto.longitude;
    let geo: Record<string, unknown> = {};
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = {
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
    } else if (dto.cityName?.trim()) {
      geo = {
        geo_locations: {
          cities: [{ key: dto.cityName.trim(), radius: dto.radiusKm, distance_unit: 'kilometer' }],
        },
      };
    }

    if (mode === 'remarketing' && audienceMetaId) {
      return { custom_audiences: [{ id: audienceMetaId }] };
    }
    if (mode === 'map_remarketing' && audienceMetaId) {
      return {
        ...geo,
        custom_audiences: [{ id: audienceMetaId }],
      };
    }
    return geo;
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
      creativeType: this.resolveCreativeType(dto.creativeType),
      targetingMode: this.resolveTargetingMode(dto.targetingMode),
      audienceId: dto.audienceId?.trim() ?? null,
      creativePayload: dto.creativePayload
        ? (dto.creativePayload as Prisma.InputJsonValue)
        : undefined,
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
    creativeType?: string | null;
    targetingMode?: string | null;
    audienceId?: string | null;
    creativePayload?: unknown;
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
    metaProductSetId?: string | null;
    metaCreativeId?: string | null;
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
      creativeType: row.creativeType ?? 'catalog_products',
      targetingMode: row.targetingMode ?? 'map',
      audienceId: row.audienceId ?? null,
      creativePayload: row.creativePayload ?? null,
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
      metaProductSetId: row.metaProductSetId ?? null,
      metaCreativeId: row.metaCreativeId ?? null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
