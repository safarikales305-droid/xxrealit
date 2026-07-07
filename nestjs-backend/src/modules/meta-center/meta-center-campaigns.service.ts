import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ensureMetaCenterCampaignTables,
  META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE,
} from '../../database/ensure-meta-center-schema';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { PostsService } from '../posts/posts.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import { MetaCenterGeoService, type MetaGeoResolvedTargeting } from './meta-center-geo.service';
import { MetaCenterCreativeService } from './meta-center-creative.service';
import {
  buildMetaCampaignValidationDebug,
  computeMetaCampaignLaunchBlockers,
} from './meta-campaign-launch-validation.util';
import {
  buildAdSetPromotedObject,
  extractLeadFormId,
  mapCampaignObjectiveToMeta,
  normalizeCampaignObjectiveKey,
  resolveAdSetObjectiveSpec,
  serializeAdSetPayloadForMetaApi,
  validateAdSetPayloadForObjective,
} from './meta-adset-payload.util';
import { normalizeCreativeType } from './meta-campaign-creative.util';
import {
  META_CAMPAIGN_TARGETING_MODES,
  META_CREATIVE_TYPES,
  type MetaCampaignTargetingMode,
  type MetaCreativeType,
} from './meta-marketing-platform.constants';
import {
  emptyLaunchSteps,
  formatMetaApiFailure,
  resolveBudgetConfig,
  validateAdSetPayload,
  validateCampaignPayload,
  type MetaApiErrorDetail,
  type MetaCampaignLaunchBlocker,
  type MetaLaunchStep,
  type MetaLaunchSteps,
} from './meta-campaign-api-payload.util';
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

export type { MetaCampaignLaunchBlocker, MetaApiErrorDetail, MetaLaunchSteps, MetaLaunchStep } from './meta-campaign-api-payload.util';

export type MetaCampaignInsights = {
  reach: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  conversions: number | null;
  spend: number | null;
};

export type MetaCampaignOverviewItem = ReturnType<MetaCenterCampaignsService['serializeDraft']> & {
  metaStatus: string | null;
  metaEffectiveStatus: string | null;
  metaInsights: MetaCampaignInsights | null;
  metaLaunchedAt: string | null;
  metaStatusSyncedAt: string | null;
};

export type MetaCreativeSourcePostItem = {
  id: string;
  title: string;
  description: string;
  city: string;
  price: number | null;
  image: string | null;
  video: string | null;
  author: string;
  link: string;
  source: string;
  facebookPostType: string | null;
  objectStoryId: string | null;
};

@Injectable()
export class MetaCenterCampaignsService {
  private readonly logger = new Logger(MetaCenterCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly geo: MetaCenterGeoService,
    private readonly creative: MetaCenterCreativeService,
    private readonly posts: PostsService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  private frontendBase(): string {
    return (
      this.fbConfig.resolveFrontendUrl()?.replace(/\/+$/, '') || 'https://www.xxrealit.cz'
    );
  }

  private async isLiveEnabled(): Promise<boolean> {
    const row = await this.getSettingsRow();
    return row?.campaignsLiveEnabled === true;
  }

  async getLiveMode() {
    const enabled = await this.isLiveEnabled();
    return {
      ok: true as const,
      liveEnabled: enabled,
      mode: enabled ? ('live' as const) : ('draft' as const),
      label: enabled ? 'Ostré spuštění AKTIVNÍ' : 'Pouze koncepty',
    };
  }

  private dbNotSyncedResponse() {
    return {
      ok: false as const,
      status: 'db_not_synced' as const,
      message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE,
      campaign: null,
    };
  }

  private isMissingTableError(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021') {
      return true;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return /MetaMarketingCampaignDraft/i.test(msg) && /does not exist/i.test(msg);
  }

  private async ensureCampaignTableReady(): Promise<boolean> {
    if (this.prisma.metaCampaignDraftTableReady) return true;
    const ready = await ensureMetaCenterCampaignTables(this.prisma);
    this.prisma.metaCampaignDraftTableReady = ready;
    return ready;
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
    return computeMetaCampaignLaunchBlockers(dto, row, {
      parseDate: (value) => this.parseDate(value),
      resolveTargetingMode: (value) => this.resolveTargetingMode(value),
    });
  }

  private computeLaunchBlockersForMode(
    dto: CreateMetaCampaignDto,
    row: Awaited<ReturnType<typeof this.getSettingsRow>>,
    mode: 'draft' | 'launch',
    liveEnabled: boolean,
  ): MetaCampaignLaunchBlocker[] {
    const blockers = computeMetaCampaignLaunchBlockers(dto, row, {
      campaignsLiveEnabled: mode === 'launch' ? liveEnabled : true,
      parseDate: (value) => this.parseDate(value),
      resolveTargetingMode: (value) => this.resolveTargetingMode(value),
    });
    if (mode === 'launch') {
      const debug = buildMetaCampaignValidationDebug(dto, row, blockers);
      this.logger.log(`[meta-campaign] launch validation ${JSON.stringify(debug)}`);
    }
    return blockers;
  }

  async listCampaignDrafts() {
    if (!(await this.ensureCampaignTableReady())) {
      return {
        ok: false as const,
        items: [] as ReturnType<typeof this.serializeDraft>[],
        message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE,
      };
    }
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
      if (this.isMissingTableError(err)) {
        this.prisma.metaCampaignDraftTableReady = false;
        return {
          ok: false as const,
          items: [] as ReturnType<typeof this.serializeDraft>[],
          message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE,
        };
      }
      return {
        ok: true as const,
        items: [] as ReturnType<typeof this.serializeDraft>[],
        message: err instanceof Error ? err.message : 'Koncepty nelze načíst.',
      };
    }
  }

  async getCampaignDraft(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE, campaign: null };
    }
    try {
      const row = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
      if (!row) return { ok: false as const, message: 'Koncept nenalezen.', campaign: null };
      return { ok: true as const, campaign: this.serializeDraft(row) };
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.prisma.metaCampaignDraftTableReady = false;
        return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE, campaign: null };
      }
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Koncept nelze načíst.',
        campaign: null,
      };
    }
  }

  async updateCampaignDraft(id: string, dto: CreateMetaCampaignDto) {
    if (!(await this.ensureCampaignTableReady())) {
      return this.dbNotSyncedResponse();
    }
    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    try {
      const updated = await this.prisma.metaMarketingCampaignDraft.update({
        where: { id },
        data: {
          ...this.buildDraftData(dto, ids),
          status: 'draft',
          errorMessage: null,
        },
      });
      return {
        ok: true as const,
        status: 'draft' as const,
        message: 'Koncept aktualizován.',
        campaign: this.serializeDraft(updated),
      };
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.prisma.metaCampaignDraftTableReady = false;
        return this.dbNotSyncedResponse();
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return { ok: false as const, status: 'not_found' as const, message: 'Koncept nenalezen.', campaign: null };
      }
      return {
        ok: false as const,
        status: 'error' as const,
        message: err instanceof Error ? err.message : 'Aktualizace selhala.',
        campaign: null,
      };
    }
  }

  async deleteCampaignDraft(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE };
    }
    try {
      await this.prisma.metaMarketingCampaignDraft.delete({ where: { id } });
      return { ok: true as const, message: 'Koncept smazán.' };
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.prisma.metaCampaignDraftTableReady = false;
        return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE };
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return { ok: false as const, message: 'Koncept nenalezen.' };
      }
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Smazání selhalo.',
      };
    }
  }

  async duplicateCampaignDraft(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE, campaign: null };
    }
    const source = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    if (!source) {
      return { ok: false as const, message: 'Koncept nenalezen.', campaign: null };
    }
    const copy = await this.prisma.metaMarketingCampaignDraft.create({
      data: {
        name: `${source.name.trim()} (kopie)`,
        objective: source.objective,
        status: 'draft',
        creativeType: source.creativeType,
        targetingMode: source.targetingMode,
        audienceId: source.audienceId,
        creativePayload: source.creativePayload ?? Prisma.JsonNull,
        adAccountId: source.adAccountId,
        catalogId: source.catalogId,
        datasetId: source.datasetId,
        propertyType: source.propertyType,
        cityName: source.cityName,
        metaGeoKey: source.metaGeoKey,
        metaGeoCountry: source.metaGeoCountry,
        metaGeoRegion: source.metaGeoRegion,
        latitude: source.latitude,
        longitude: source.longitude,
        radiusKm: source.radiusKm,
        dailyBudgetCzk: source.dailyBudgetCzk,
        startDate: source.startDate,
        endDate: source.endDate,
        selectedProductIds: source.selectedProductIds as Prisma.InputJsonValue,
      },
    });
    return {
      ok: true as const,
      message: 'Kampaň byla zduplikována jako nový koncept.',
      campaign: this.serializeDraft(copy),
    };
  }

  async createCampaign(dto: CreateMetaCampaignDto, mode: 'draft' | 'launch' = 'draft') {
    if (!(await this.ensureCampaignTableReady())) {
      return this.dbNotSyncedResponse();
    }

    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const liveOn = await this.isLiveEnabled();

    if (mode === 'launch') {
      const blockers = this.computeLaunchBlockersForMode(dto, row, 'launch', liveOn);
      if (blockers.length > 0) {
        return {
          ok: false as const,
          status: 'validation_error' as const,
          message: blockers.map((b) => `❌ ${b.message}`).join('\n'),
          blockers,
          campaign: null,
        };
      }
    }

    const data = this.buildDraftData(dto, ids);
    let draft;
    try {
      draft = await this.prisma.metaMarketingCampaignDraft.create({ data });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        const recovered = await this.ensureCampaignTableReady();
        if (recovered) {
          try {
            draft = await this.prisma.metaMarketingCampaignDraft.create({ data });
          } catch (retryErr) {
            this.logger.error(
              `createCampaign retry failed: ${retryErr instanceof Error ? retryErr.message : retryErr}`,
            );
            return this.dbNotSyncedResponse();
          }
        } else {
          return this.dbNotSyncedResponse();
        }
      } else {
        this.logger.error(`createCampaign failed: ${err instanceof Error ? err.message : err}`);
        return {
          ok: false as const,
          status: 'error' as const,
          message: err instanceof Error ? err.message : 'Uložení kampaně selhalo.',
          campaign: null,
        };
      }
    }

    if (mode === 'draft' || !liveOn) {
      const message = liveOn
        ? 'Kampaň byla uložena jako koncept.'
        : 'Kampaň byla uložena jako koncept. Ostré spuštění je vypnuté — zapněte v Nastavení.';
      return {
        ok: true as const,
        status: 'draft' as const,
        message,
        liveEnabled: liveOn,
        campaign: this.serializeDraft(draft),
      };
    }

    const launched = await this.launchLiveCampaign(draft.id, dto, ids, 'ACTIVE');
    return launched;
  }

  async launchExistingDraft(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return this.dbNotSyncedResponse();
    }
    if (!(await this.isLiveEnabled())) {
      return {
        ok: false as const,
        status: 'draft_mode' as const,
        message: 'Ostré spuštění je vypnuté. Zapněte v Nastavení Meta Centra.',
        campaign: null,
      };
    }
    const row = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    if (!row) {
      return { ok: false as const, status: 'not_found' as const, message: 'Koncept nenalezen.', campaign: null };
    }
    if (row.metaCampaignId) {
      return {
        ok: false as const,
        status: 'already_live' as const,
        message: 'Kampaň již existuje v Meta.',
        campaign: this.serializeDraft(row),
      };
    }
    const dto = this.draftRowToDto(row);
    const settings = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(settings ?? ({} as never));
    const blockers = this.computeLaunchBlockersForMode(dto, settings, 'launch', true);
    if (blockers.length) {
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: blockers.map((b) => `❌ ${b.message}`).join('\n'),
        blockers,
        campaign: null,
      };
    }
    return this.launchLiveCampaign(id, dto, ids, 'ACTIVE');
  }

  async listCampaignsOverview() {
    const list = await this.listCampaignDrafts();
    if (!list.ok) return { ok: false as const, items: [], message: list.message };

    const enriched: MetaCampaignOverviewItem[] = [];
    for (const item of list.items) {
      if (item.metaCampaignId && (await this.isLiveEnabled())) {
        const synced = await this.syncDraftFromMeta(item.id).catch(() => null);
        enriched.push(synced?.campaign ? this.toOverviewItem(synced.campaign) : this.toOverviewItem(item));
      } else {
        enriched.push(this.toOverviewItem(item));
      }
    }
    return { ok: true as const, items: enriched, liveEnabled: await this.isLiveEnabled() };
  }

  async syncDraftFromMeta(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE, campaign: null };
    }
    const draft = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    if (!draft?.metaCampaignId) {
      return { ok: false as const, message: 'Kampaň nemá Meta Campaign ID.', campaign: null };
    }
    let token: string;
    try {
      token = await this.oauth.resolveMarketingAccessToken();
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Marketing token chybí.',
        campaign: null,
      };
    }
    const statusData = await this.fetchMetaCampaignStatus(draft.metaCampaignId, token);
    const insights = await this.fetchMetaCampaignInsights(draft.metaCampaignId, token);
    const updated = await this.prisma.metaMarketingCampaignDraft.update({
      where: { id },
      data: {
        metaStatus: statusData.status,
        metaEffectiveStatus: statusData.effectiveStatus,
        metaInsights: insights as Prisma.InputJsonValue,
        metaStatusSyncedAt: new Date(),
        status: this.mapMetaStatusToLocal(statusData.effectiveStatus ?? statusData.status),
      },
    });
    return { ok: true as const, campaign: this.serializeDraft(updated) };
  }

  async controlCampaign(id: string, action: 'activate' | 'pause' | 'resume' | 'delete') {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE };
    }
    if (!(await this.isLiveEnabled())) {
      return { ok: false as const, message: 'Ostré spuštění je vypnuté.' };
    }
    const draft = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    if (!draft?.metaCampaignId) {
      return { ok: false as const, message: 'Kampaň není publikovaná v Meta.' };
    }
    let token: string;
    try {
      token = await this.oauth.resolveMarketingAccessToken();
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : 'Marketing token chybí.' };
    }

    if (action === 'delete') {
      const del = await this.graph.delete<{ success?: boolean }>(`/${draft.metaCampaignId}`, token);
      if (!del.ok) {
        return { ok: false as const, message: del.errorMessage || 'Smazání v Meta selhalo.' };
      }
      await this.prisma.metaMarketingCampaignDraft.delete({ where: { id } });
      return { ok: true as const, message: 'Kampaň smazána v Meta i v databázi.' };
    }

    const metaStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    const campaignRes = await this.graph.post<{ success?: boolean }>(
      `/${draft.metaCampaignId}`,
      token,
      { status: metaStatus },
    );
    if (!campaignRes.ok) {
      return { ok: false as const, message: campaignRes.errorMessage || 'Změna stavu kampaně selhala.' };
    }
    if (draft.metaAdSetId) {
      await this.graph.post(`/${draft.metaAdSetId}`, token, { status: metaStatus });
    }
    if (draft.metaAdId) {
      await this.graph.post(`/${draft.metaAdId}`, token, { status: metaStatus });
    }

    const synced = await this.syncDraftFromMeta(id);
    const label =
      action === 'pause' ? 'pozastavena' : action === 'activate' || action === 'resume' ? 'spuštěna' : 'aktualizována';
    return {
      ok: true as const,
      message: `Kampaň ${label} v Meta.`,
      campaign: synced.campaign,
    };
  }

  private draftRowToDto(row: {
    name: string;
    objective: string;
    propertyType: string | null;
    cityName: string | null;
    metaGeoKey?: string | null;
    metaGeoCountry?: string | null;
    metaGeoRegion?: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number | null;
    dailyBudgetCzk: number | null;
    startDate: Date | null;
    endDate: Date | null;
    selectedProductIds: unknown;
    creativeType?: string | null;
    targetingMode?: string | null;
    audienceId?: string | null;
    creativePayload?: unknown;
  }): CreateMetaCampaignDto {
    const productIds = Array.isArray(row.selectedProductIds)
      ? row.selectedProductIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      name: row.name,
      objective: row.objective,
      propertyType: row.propertyType ?? undefined,
      cityName: row.cityName ?? '',
      metaGeoKey: row.metaGeoKey ?? undefined,
      metaGeoCountry: row.metaGeoCountry ?? undefined,
      metaGeoRegion: row.metaGeoRegion ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      radiusKm: row.radiusKm ?? 15,
      dailyBudgetCzk: row.dailyBudgetCzk ?? 100,
      startDate: row.startDate?.toISOString().slice(0, 10) ?? '',
      endDate: row.endDate?.toISOString().slice(0, 10) ?? '',
      selectedProductIds: productIds,
      creativeType: row.creativeType ?? undefined,
      targetingMode: row.targetingMode ?? undefined,
      audienceId: row.audienceId ?? undefined,
      creativePayload: (row.creativePayload as Record<string, unknown>) ?? undefined,
    };
  }

  private async fetchMetaCampaignStatus(campaignId: string, token: string) {
    const res = await this.graph.get<{
      status?: string;
      effective_status?: string;
      name?: string;
    }>(`/${campaignId}`, token, { fields: 'status,effective_status,name' });
    if (!res.ok) {
      return { status: null as string | null, effectiveStatus: null as string | null };
    }
    return {
      status: res.data.status ?? null,
      effectiveStatus: res.data.effective_status ?? null,
    };
  }

  private async fetchMetaCampaignInsights(
    campaignId: string,
    token: string,
  ): Promise<MetaCampaignInsights> {
    const empty: MetaCampaignInsights = {
      reach: null,
      impressions: null,
      clicks: null,
      ctr: null,
      cpc: null,
      conversions: null,
      spend: null,
    };
    const res = await this.graph.get<{
      data?: Array<{
        reach?: string;
        impressions?: string;
        clicks?: string;
        ctr?: string;
        cpc?: string;
        spend?: string;
        actions?: Array<{ action_type?: string; value?: string }>;
      }>;
    }>(`/${campaignId}/insights`, token, {
      fields: 'reach,impressions,clicks,ctr,cpc,spend,actions',
      date_preset: 'maximum',
    });
    if (!res.ok || !res.data.data?.length) return empty;
    const row = res.data.data[0];
    const parseNum = (v: string | undefined) => {
      if (v == null) return null;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const conversions =
      row.actions?.find((a) =>
        ['offsite_conversion', 'lead', 'purchase', 'complete_registration'].some((t) =>
          (a.action_type ?? '').includes(t),
        ),
      )?.value ?? null;
    return {
      reach: parseNum(row.reach),
      impressions: parseNum(row.impressions),
      clicks: parseNum(row.clicks),
      ctr: parseNum(row.ctr),
      cpc: parseNum(row.cpc),
      spend: parseNum(row.spend),
      conversions: conversions != null ? parseNum(conversions) : null,
    };
  }

  private mapMetaStatusToLocal(metaStatus: string | null): string {
    if (!metaStatus) return 'draft';
    const s = metaStatus.toUpperCase();
    if (s === 'ACTIVE') return 'active';
    if (s === 'PAUSED') return 'paused';
    if (s === 'ARCHIVED' || s === 'DELETED') return 'archived';
    if (s === 'IN_PROCESS' || s === 'PENDING_REVIEW' || s === 'IN_REVIEW') return 'in_review';
    if (s === 'WITH_ISSUES' || s === 'REJECTED') return 'error';
    if (s === 'LEARNING' || s === 'LEARNING_LIMITED') return 'learning';
    if (s === 'COMPLETED') return 'completed';
    return metaStatus.toLowerCase();
  }

  private toOverviewItem(
    draft: ReturnType<MetaCenterCampaignsService['serializeDraft']> & {
      metaStatus?: string | null;
      metaEffectiveStatus?: string | null;
      metaInsights?: unknown;
      metaLaunchedAt?: string | null;
      metaStatusSyncedAt?: string | null;
    },
  ): MetaCampaignOverviewItem {
    const insights = this.parseInsights(draft.metaInsights);
    return {
      ...draft,
      metaStatus: draft.metaStatus ?? null,
      metaEffectiveStatus: draft.metaEffectiveStatus ?? null,
      metaInsights: insights,
      metaLaunchedAt: draft.metaLaunchedAt ?? null,
      metaStatusSyncedAt: draft.metaStatusSyncedAt ?? null,
    };
  }

  private parseInsights(raw: unknown): MetaCampaignInsights | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    return {
      reach: typeof o.reach === 'number' ? o.reach : null,
      impressions: typeof o.impressions === 'number' ? o.impressions : null,
      clicks: typeof o.clicks === 'number' ? o.clicks : null,
      ctr: typeof o.ctr === 'number' ? o.ctr : null,
      cpc: typeof o.cpc === 'number' ? o.cpc : null,
      conversions: typeof o.conversions === 'number' ? o.conversions : null,
      spend: typeof o.spend === 'number' ? o.spend : null,
    };
  }

  private parseLaunchSteps(raw: unknown): MetaLaunchSteps | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const parseStep = (value: unknown) => {
      if (!value || typeof value !== 'object') return { ok: false };
      const s = value as Record<string, unknown>;
      return {
        ok: Boolean(s.ok),
        id: typeof s.id === 'string' ? s.id : null,
        error: typeof s.error === 'string' ? s.error : null,
      };
    };
    return {
      campaign: parseStep(o.campaign),
      adSet: parseStep(o.adSet),
      creative: parseStep(o.creative),
      ad: parseStep(o.ad),
    };
  }

  private async launchLiveCampaign(
    draftId: string,
    dto: CreateMetaCampaignDto,
    ids: ReturnType<typeof resolveMetaCenterIds>,
    publishStatus: 'ACTIVE' | 'PAUSED' = 'ACTIVE',
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
    const pageAccessToken = await this.oauth.resolvePageAccessToken().catch(() => null);
    const launchSteps = emptyLaunchSteps();
    let audienceMetaId: string | null = null;
    if (dto.audienceId?.trim()) {
      const audience = await this.prisma.metaRemarketingAudience
        .findUnique({ where: { id: dto.audienceId.trim() } })
        .catch(() => null);
      audienceMetaId = audience?.metaAudienceId ?? null;
    }

    const objective = mapCampaignObjectiveToMeta(normalizeCampaignObjectiveKey(dto.objective));
    const budgetConfig = resolveBudgetConfig(false);
    const dailyBudgetMinor = Math.round(dto.dailyBudgetCzk * 100);
    const catalogId = ids.catalogId;

    const campaignPayload: Record<string, unknown> = {
      name: dto.name.trim(),
      objective,
      status: publishStatus,
      special_ad_categories: JSON.stringify(['HOUSING']),
      is_adset_budget_sharing_enabled: budgetConfig.isAdsetBudgetSharingEnabled,
    };
    if (budgetConfig.useCampaignBudgetOptimization) {
      campaignPayload.daily_budget = String(dailyBudgetMinor);
    }

    const campaignBlockers = validateCampaignPayload(campaignPayload, budgetConfig);
    if (campaignBlockers.length) {
      const msg = campaignBlockers.map((b) => b.message).join(' ');
      await this.markDraftError(draftId, msg);
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        blockers: campaignBlockers,
        campaign: null,
      };
    }

    const campaignRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/campaigns`,
      token,
      campaignPayload,
    );

    if (!campaignRes.ok || !campaignRes.data.id) {
      const failure = formatMetaApiFailure(
        'Vytvoření kampaně',
        campaignPayload,
        campaignRes,
        'campaign',
      );
      launchSteps.campaign = { ok: false, error: failure.message };
      await this.persistLaunchState(draftId, {
        status: 'error',
        errorMessage: failure.message,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'error' as const,
        message: failure.message,
        metaApiError: failure.detail,
        failedStep: 'campaign' as const,
        launchSteps,
        campaign: null,
      };
    }

    const metaCampaignId = campaignRes.data.id;
    launchSteps.campaign = { ok: true, id: metaCampaignId };
    let resolvedGeo;
    try {
      resolvedGeo = await this.geo.resolveGeoForTargeting({
        metaGeoKey: dto.metaGeoKey,
        cityName: dto.cityName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusKm: dto.radiusKm,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lokalitu nelze namapovat na Meta Geo.';
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        status: 'error',
        errorMessage: msg,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        failedStep: 'adset' as const,
        launchSteps,
        campaign: null,
      };
    }

    const targeting = this.buildTargetingFromGeo(resolvedGeo, dto, audienceMetaId);
    const adSetBuild = this.buildAdSetLaunchPayload({
      dto,
      ids,
      row,
      metaCampaignId,
      targeting,
      publishStatus,
      budgetConfig,
      dailyBudgetMinor,
      catalogId,
      audienceMetaId,
    });

    if (!adSetBuild.ok) {
      const msg = adSetBuild.blockers.map((b) => b.message).join(' ');
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        status: 'error',
        errorMessage: msg,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        blockers: adSetBuild.blockers,
        failedStep: 'adset' as const,
        launchSteps,
        campaign: null,
        adSetPayloadPreview: adSetBuild.payload ?? null,
        adSetPayloadMeta: adSetBuild.metaForm ?? null,
      };
    }

    const adSetPayload = adSetBuild.payload;
    const adSetSpec = adSetBuild.spec;

    this.logger.log(
      `[meta-campaign] adset payload objective=${dto.objective} spec=${adSetSpec.objectiveKey} optimization_goal=${adSetSpec.optimizationGoal} draft=${draftId}\n${JSON.stringify(adSetPayload, null, 2)}`,
    );
    this.logger.log(
      `[meta-campaign] adset meta-form draft=${draftId}\n${JSON.stringify(adSetBuild.metaForm, null, 2)}`,
    );

    const adSetRes = await this.graph.postWithTransientRetry<{ id?: string }>(
      `/act_${actId}/adsets`,
      token,
      adSetPayload,
      { logLabel: `adsets draft=${draftId}` },
    );

    if (!adSetRes.ok || !adSetRes.data.id) {
      const failure = formatMetaApiFailure('Vytvoření ad setu', adSetPayload, adSetRes, 'adset');
      launchSteps.adSet = { ok: false, error: failure.message };
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        status: 'error',
        errorMessage: failure.message,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'error' as const,
        message: failure.message,
        metaApiError: failure.detail,
        failedStep: 'adset' as const,
        launchSteps,
        campaign: null,
      };
    }

    const metaAdSetId = adSetRes.data.id;
    launchSteps.adSet = { ok: true, id: metaAdSetId };

    let metaProductSetId: string | null = null;
    let metaCreativeId: string | null = null;
    let metaAdId: string | null = null;

    const creativeType = this.resolveCreativeType(dto.creativeType);

    if (creativeType === 'catalog_products' || dto.objective === 'catalog') {
      const productSetResult = await this.resolveCatalogProductSet(
        catalogId,
        token,
        dto.name.trim(),
        dto.selectedProductIds ?? [],
      );
      if (!productSetResult.ok) {
        launchSteps.creative = { ok: false, error: productSetResult.message };
        await this.persistLaunchState(draftId, {
          metaCampaignId,
          metaAdSetId,
          status: 'error',
          errorMessage: productSetResult.message,
          metaLaunchSteps: launchSteps,
        });
        return {
          ok: false as const,
          status: 'error' as const,
          message: productSetResult.message,
          metaApiError: productSetResult.metaApiError,
          failedStep: 'creative' as const,
          launchSteps,
          campaign: null,
        };
      }
      metaProductSetId = productSetResult.id;
      this.logger.log(`[meta-campaign] product_set=${metaProductSetId} draft=${draftId}`);
    }

    const pageIds = this.creative.resolvePageIds(row);
    const built = await this.creative.buildAdCreative({
      actId,
      token,
      pageAccessToken,
      campaignName: dto.name.trim(),
      creativeType,
      creativePayload: dto.creativePayload as Record<string, unknown> | undefined,
      pageId: pageIds.pageId,
      instagramActorId: pageIds.instagramActorId,
      catalogId,
      productSetId: metaProductSetId,
      frontendBase: this.frontendBase(),
    });

    if (!built.ok) {
      launchSteps.creative = { ok: false, error: built.message };
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        metaAdSetId,
        metaProductSetId,
        status: 'error',
        errorMessage: built.message,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: (built.metaApiError ? 'error' : 'validation_error') as 'error' | 'validation_error',
        message: built.message,
        metaApiError: built.metaApiError,
        failedStep: 'creative' as const,
        launchSteps,
        campaign: null,
      };
    }

    const creativeBody = built.body;

    const creativeRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/adcreatives`,
      token,
      creativeBody,
    );

    if (!creativeRes.ok || !creativeRes.data.id) {
      const failure = this.creative.formatCreativeApiFailure(creativeBody, creativeRes);
      launchSteps.creative = { ok: false, error: failure.message };
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        metaAdSetId,
        metaProductSetId,
        status: 'error',
        errorMessage: failure.message,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'error' as const,
        message: failure.message,
        metaApiError: failure.detail,
        failedStep: 'creative' as const,
        launchSteps,
        campaign: null,
      };
    }

    metaCreativeId = creativeRes.data.id;
    launchSteps.creative = { ok: true, id: metaCreativeId };
    this.logger.log(`[meta-campaign] creative=${metaCreativeId} draft=${draftId}`);

    const adPayload = {
      name: `${dto.name.trim()} — reklama`,
      adset_id: metaAdSetId,
      creative: JSON.stringify({ creative_id: metaCreativeId }),
      status: publishStatus,
    };

    const adRes = await this.graph.post<{ id?: string }>(
      `/act_${actId}/ads`,
      token,
      adPayload,
    );

    if (!adRes.ok || !adRes.data.id) {
      const failure = formatMetaApiFailure('Vytvoření reklamy', adPayload, adRes, 'ad');
      launchSteps.ad = { ok: false, error: failure.message };
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        metaAdSetId,
        metaProductSetId,
        metaCreativeId,
        status: 'error',
        errorMessage: failure.message,
        metaLaunchSteps: launchSteps,
      });
      return {
        ok: false as const,
        status: 'error' as const,
        message: failure.message,
        metaApiError: failure.detail,
        failedStep: 'ad' as const,
        launchSteps,
        campaign: null,
      };
    }

    metaAdId = adRes.data.id;
    launchSteps.ad = { ok: true, id: metaAdId };
    this.logger.log(`[meta-campaign] ad=${metaAdId} draft=${draftId}`);

    const creativePreviewUrl =
      (await this.creative.fetchCreativeThumbnailUrl(metaCreativeId, token)) ?? null;
    const previewHtml = (await this.creative.fetchAdPreviewHtml(metaAdId, token)) ?? null;

    const statusData = await this.fetchMetaCampaignStatus(metaCampaignId, token);
    const insights = await this.fetchMetaCampaignInsights(metaCampaignId, token);
    const now = new Date();

    const updated = await this.prisma.metaMarketingCampaignDraft.update({
      where: { id: draftId },
      data: {
        metaCampaignId,
        metaAdSetId,
        metaProductSetId,
        metaCreativeId,
        metaAdId,
        creativePreviewUrl,
        previewHtml,
        metaLaunchSteps: launchSteps as Prisma.InputJsonValue,
        creativePayload: built.payload as Prisma.InputJsonValue,
        metaStatus: statusData.status,
        metaEffectiveStatus: statusData.effectiveStatus,
        metaInsights: insights as Prisma.InputJsonValue,
        metaLaunchedAt: now,
        metaStatusSyncedAt: now,
        status: this.mapMetaStatusToLocal(statusData.effectiveStatus ?? statusData.status ?? publishStatus),
        errorMessage: null,
      },
    });

    this.logger.log(
      `[meta-campaign] live created campaign=${metaCampaignId} adset=${metaAdSetId} product_set=${metaProductSetId ?? '—'} creative=${metaCreativeId} ad=${metaAdId} status=${publishStatus} draft=${draftId}`,
    );

    return {
      ok: true as const,
      status: 'active' as const,
      message: `Kampaň publikována v Meta — Campaign, Ad Set, Creative i Ad vytvořeny. Campaign ID: ${metaCampaignId}`,
      liveEnabled: true,
      launchSteps,
      campaign: this.serializeDraft(updated),
    };
  }

  async listCreativeSourcePosts(
    source?: string,
    take = 40,
  ): Promise<
    | { ok: true; items: MetaCreativeSourcePostItem[] }
    | { ok: false; items: MetaCreativeSourcePostItem[]; message: string }
  > {
    const feed = await this.posts.listCommunityPosts(undefined, undefined, undefined, undefined, undefined, 0, take);
    const items = (feed.items ?? []).map((post) => {
      const p = post as {
        id: string;
        title?: string;
        description?: string;
        city?: string;
        price?: number | null;
        imageUrl?: string | null;
        videoUrl?: string | null;
        externalUrl?: string | null;
        facebookPermalink?: string | null;
        isFacebookPagePost?: boolean;
        facebookPostType?: string | null;
        source?: string;
        user?: { name?: string | null };
        media?: Array<{ url: string; type: string }>;
      };
      const image =
        p.imageUrl ??
        p.media?.find((m) => m.type === 'image')?.url ??
        p.media?.[0]?.url ??
        null;
      const video =
        p.videoUrl ?? p.media?.find((m) => m.type === 'video')?.url ?? null;
      const postSource = p.isFacebookPagePost
        ? 'facebook_post'
        : p.source === 'FACEBOOK'
          ? 'facebook_post'
          : 'public_post';
      return {
        id: p.id,
        title: p.title ?? '',
        description: p.description ?? '',
        city: p.city ?? '',
        price: p.price ?? null,
        image,
        video,
        author: p.user?.name ?? 'XXREALIT',
        link: p.facebookPermalink ?? p.externalUrl ?? `${this.frontendBase()}/prispevek/${p.id}`,
        source: postSource,
        facebookPostType: p.facebookPostType ?? null,
        objectStoryId: null as string | null,
      };
    });

    const filtered =
      source === 'facebook_post'
        ? items.filter((i) => i.source === 'facebook_post')
        : source === 'instagram_post'
          ? items.filter((i) => i.facebookPostType?.includes('REEL') || i.facebookPostType?.includes('VIDEO'))
          : source === 'public_post'
            ? items.filter((i) => i.source === 'public_post')
            : items;

    return { ok: true as const, items: filtered };
  }

  private resolveCreativeType(value: string | undefined): MetaCreativeType {
    return normalizeCreativeType(value);
  }

  private resolveTargetingMode(value: string | undefined): MetaCampaignTargetingMode {
    if (value && (META_CAMPAIGN_TARGETING_MODES as readonly string[]).includes(value)) {
      return value as MetaCampaignTargetingMode;
    }
    return 'map';
  }

  private buildTargetingFromGeo(
    geo: MetaGeoResolvedTargeting,
    dto: CreateMetaCampaignDto,
    audienceMetaId?: string | null,
  ): Record<string, unknown> {
    const mode = this.resolveTargetingMode(dto.targetingMode);
    let geoBlock: Record<string, unknown>;

    if (geo.mode === 'city') {
      geoBlock = {
        geo_locations: {
          cities: [
            {
              key: geo.key,
              radius: geo.radiusKm,
              distance_unit: 'kilometer',
            },
          ],
        },
      };
    } else {
      geoBlock = {
        geo_locations: {
          custom_locations: [
            {
              latitude: geo.latitude,
              longitude: geo.longitude,
              radius: geo.radiusKm,
              distance_unit: 'kilometer',
            },
          ],
        },
      };
    }

    if (mode === 'remarketing' && audienceMetaId) {
      return { custom_audiences: [{ id: audienceMetaId }] };
    }
    if (mode === 'map_remarketing' && audienceMetaId) {
      return {
        ...geoBlock,
        custom_audiences: [{ id: audienceMetaId }],
      };
    }
    return geoBlock;
  }

  async previewAdSetPayload(dto: CreateMetaCampaignDto) {
    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    let resolvedGeo;
    try {
      resolvedGeo = await this.geo.resolveGeoForTargeting({
        metaGeoKey: dto.metaGeoKey,
        cityName: dto.cityName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusKm: dto.radiusKm,
      });
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Lokalitu nelze namapovat na Meta Geo.',
        payload: null,
        metaForm: null,
        blockers: [],
      };
    }

    let audienceMetaId: string | null = null;
    if (dto.audienceId?.trim()) {
      const audience = await this.prisma.metaRemarketingAudience
        .findUnique({ where: { id: dto.audienceId.trim() } })
        .catch(() => null);
      audienceMetaId = audience?.metaAudienceId ?? null;
    }

    const targeting = this.buildTargetingFromGeo(resolvedGeo, dto, audienceMetaId);
    const budgetConfig = resolveBudgetConfig(false);
    const dailyBudgetMinor = Math.round(dto.dailyBudgetCzk * 100);

    const built = this.buildAdSetLaunchPayload({
      dto,
      ids,
      row,
      metaCampaignId: 'PREVIEW_CAMPAIGN_ID',
      targeting,
      publishStatus: 'PAUSED',
      budgetConfig,
      dailyBudgetMinor,
      catalogId: ids.catalogId,
      audienceMetaId,
    });

    if (!built.ok) {
      return {
        ok: false as const,
        message: built.blockers.map((b) => b.message).join('\n'),
        blockers: built.blockers,
        payload: built.payload,
        metaForm: built.metaForm,
        spec: built.spec,
      };
    }

    return {
      ok: true as const,
      message: 'Náhled Ad Set payloadu připraven.',
      blockers: [] as MetaCampaignLaunchBlocker[],
      payload: built.payload,
      metaForm: built.metaForm,
      spec: built.spec,
    };
  }

  private buildAdSetLaunchPayload(input: {
    dto: CreateMetaCampaignDto;
    ids: ReturnType<typeof resolveMetaCenterIds>;
    row: Awaited<ReturnType<typeof this.getSettingsRow>>;
    metaCampaignId: string;
    targeting: Record<string, unknown>;
    publishStatus: 'ACTIVE' | 'PAUSED';
    budgetConfig: ReturnType<typeof resolveBudgetConfig>;
    dailyBudgetMinor: number;
    catalogId: string | null;
    audienceMetaId: string | null;
  }):
    | {
        ok: true;
        payload: Record<string, unknown>;
        metaForm: Record<string, string>;
        spec: ReturnType<typeof resolveAdSetObjectiveSpec>;
      }
    | {
        ok: false;
        blockers: MetaCampaignLaunchBlocker[];
        payload?: Record<string, unknown>;
        metaForm?: Record<string, string>;
        spec?: ReturnType<typeof resolveAdSetObjectiveSpec>;
      } {
    const { dto, ids, row, metaCampaignId, targeting, publishStatus, budgetConfig, dailyBudgetMinor, catalogId } =
      input;

    const spec = resolveAdSetObjectiveSpec(dto.objective);
    const pageId = row?.pageId?.trim() ?? process.env.FACEBOOK_PAGE_ID?.trim() ?? null;
    const leadFormId = extractLeadFormId(dto);

    const promotedObject = buildAdSetPromotedObject(spec, {
      catalogId,
      pixelId: ids.pixelId,
      datasetId: ids.datasetId,
      pageId,
      leadFormId,
    });

    const startTime = this.parseDate(dto.startDate)?.toISOString() ?? undefined;
    const endTime = this.parseDate(dto.endDate)?.toISOString() ?? undefined;

    const adSetPayload: Record<string, unknown> = {
      name: `${dto.name.trim()} — sada`,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: spec.optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(targeting),
      start_time: startTime,
      end_time: endTime,
      status: publishStatus,
      is_adset_budget_sharing_enabled: budgetConfig.isAdsetBudgetSharingEnabled,
    };

    if (!budgetConfig.useCampaignBudgetOptimization) {
      adSetPayload.daily_budget = String(dailyBudgetMinor);
    }

    if (promotedObject) {
      adSetPayload.promoted_object = JSON.stringify(promotedObject);
    }

    const blockers = [
      ...validateAdSetPayload(adSetPayload, budgetConfig, {
        requiresPromotedObject: spec.requiresPromotedObject,
      }),
      ...validateAdSetPayloadForObjective(adSetPayload, spec),
    ];

    if (spec.objectiveKey === 'lead' && leadFormId && !promotedObject) {
      blockers.push({
        key: 'adset.lead_form_page',
        message: 'Ad set: pro Lead Form chybí page_id nebo lead_gen_form_id v promoted_object.',
      });
    }

    if (spec.objectiveKey === 'catalog' && !catalogId) {
      blockers.push({
        key: 'adset.catalog_id',
        message: 'Ad set: chybí Catalog ID pro katalogovou kampaň.',
      });
    }

    const metaForm = serializeAdSetPayloadForMetaApi(adSetPayload);

    if (blockers.length) {
      return { ok: false, blockers, payload: adSetPayload, metaForm, spec };
    }

    return { ok: true, payload: adSetPayload, metaForm, spec };
  }

  private async resolveCatalogProductSet(
    catalogId: string | null | undefined,
    token: string,
    campaignName: string,
    selectedProductIds: string[],
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; message: string; metaApiError?: MetaApiErrorDetail }
  > {
    if (!catalogId?.trim()) {
      return { ok: false, message: 'Chybí Catalog ID pro katalogovou kreativu.' };
    }

    if (selectedProductIds.length > 0) {
      const payload = {
        name: `${campaignName} — produkty`,
        filter: JSON.stringify({
          retailer_id: { is_any: selectedProductIds },
        }),
      };
      const productSetRes = await this.graph.post<{ id?: string }>(
        `/${catalogId}/product_sets`,
        token,
        payload,
      );
      if (productSetRes.ok && productSetRes.data.id) {
        return { ok: true, id: productSetRes.data.id };
      }
      const failure = formatMetaApiFailure(
        'Vytvoření product setu',
        payload,
        productSetRes,
        'creative',
      );
      return { ok: false, message: failure.message, metaApiError: failure.detail };
    }

    const listRes = await this.graph.get<{ data?: Array<{ id?: string }> }>(
      `/${catalogId}/product_sets`,
      token,
      { fields: 'id', limit: '1' },
    );
    const existingId = listRes.ok ? listRes.data.data?.[0]?.id : null;
    if (existingId) {
      return { ok: true, id: existingId };
    }

    const allPayload = {
      name: `${campaignName} — všechny produkty`,
      filter: JSON.stringify({}),
    };
    const allRes = await this.graph.post<{ id?: string }>(
      `/${catalogId}/product_sets`,
      token,
      allPayload,
    );
    if (allRes.ok && allRes.data.id) {
      return { ok: true, id: allRes.data.id };
    }
    const failure = formatMetaApiFailure(
      'Vytvoření product setu (celý katalog)',
      allPayload,
      allRes,
      'creative',
    );
    return { ok: false, message: failure.message, metaApiError: failure.detail };
  }

  private async persistLaunchState(
    draftId: string,
    data: {
      metaCampaignId?: string;
      metaAdSetId?: string;
      metaProductSetId?: string | null;
      metaCreativeId?: string | null;
      status?: string;
      errorMessage?: string;
      metaLaunchSteps?: MetaLaunchSteps;
    },
  ) {
    try {
      await this.prisma.metaMarketingCampaignDraft.update({
        where: { id: draftId },
        data: {
          ...(data.metaCampaignId ? { metaCampaignId: data.metaCampaignId } : {}),
          ...(data.metaAdSetId ? { metaAdSetId: data.metaAdSetId } : {}),
          ...(data.metaProductSetId !== undefined ? { metaProductSetId: data.metaProductSetId } : {}),
          ...(data.metaCreativeId !== undefined ? { metaCreativeId: data.metaCreativeId } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
          ...(data.metaLaunchSteps
            ? { metaLaunchSteps: data.metaLaunchSteps as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `persistLaunchState failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async markDraftError(draftId: string, message: string) {
    try {
      await this.prisma.metaMarketingCampaignDraft.update({
        where: { id: draftId },
        data: { status: 'error', errorMessage: message },
      });
    } catch (err) {
      this.logger.warn(
        `markDraftError failed: ${err instanceof Error ? err.message : err}`,
      );
    }
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
      metaGeoKey: dto.metaGeoKey?.trim() || null,
      metaGeoCountry: dto.metaGeoCountry?.trim() || null,
      metaGeoRegion: dto.metaGeoRegion?.trim() || null,
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
    metaGeoKey?: string | null;
    metaGeoCountry?: string | null;
    metaGeoRegion?: string | null;
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
    creativePreviewUrl?: string | null;
    previewHtml?: string | null;
    metaLaunchSteps?: unknown;
    metaStatus?: string | null;
    metaEffectiveStatus?: string | null;
    metaInsights?: unknown;
    metaLaunchedAt?: Date | null;
    metaStatusSyncedAt?: Date | null;
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
      metaGeoKey: row.metaGeoKey ?? null,
      metaGeoCountry: row.metaGeoCountry ?? null,
      metaGeoRegion: row.metaGeoRegion ?? null,
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
      creativePreviewUrl: row.creativePreviewUrl ?? null,
      previewHtml: row.previewHtml ?? null,
      metaLaunchSteps: this.parseLaunchSteps(row.metaLaunchSteps),
      metaStatus: row.metaStatus ?? null,
      metaEffectiveStatus: row.metaEffectiveStatus ?? null,
      metaInsights: this.parseInsights(row.metaInsights),
      metaLaunchedAt: row.metaLaunchedAt?.toISOString() ?? null,
      metaStatusSyncedAt: row.metaStatusSyncedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
