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
  buildMetaCampaignByMode,
  buildCombinationDiagnostics,
  validateMetaCampaignCombination,
  type MetaCampaignCombinationDiagnostics,
} from './meta-campaign-builder.util';
import {
  CATALOG_TRAFFIC_FALLBACK_MESSAGE,
  buildMetaLaunchGraphPaths,
  extractLeadFormId,
  resolveDsaDisclosureLabels,
  resolveMetaCampaignPayloadSpec,
  serializePayloadForMetaApi,
  validateAdSetPayloadCombination,
  validateMetaCampaignPayloadContext,
  type MetaCampaignPayloadSpec,
} from './meta-campaign-payload-map.util';
import {
  buildMetaAdSetProbeSteps,
  buildProbeGraphUrl,
  buildSupportedCatalogAdSetPayload,
  buildSupportedCatalogTrafficAdSetPayload,
  catalogSalesV25Validation,
  mapProbeGraphResult,
  summarizeProbeResult,
  type MetaAdSetProbeResult,
} from './meta-adset-probe.util';
import { normalizeCreativeType } from './meta-campaign-creative.util';
import {
  META_CAMPAIGN_TARGETING_MODES,
  META_CREATIVE_TYPES,
  type MetaCampaignTargetingMode,
  type MetaCreativeType,
} from './meta-marketing-platform.constants';
import {
  emptyLaunchSteps,
  emptyMetaCampaignLaunchResult,
  formatMetaApiFailure,
  resolveBudgetConfig,
  toMetaCampaignPayloadPreviewSpec,
  validateAdSetPayload,
  validateCampaignPayload,
  validateGeoTargetingPayload,
  type MetaApiErrorDetail,
  type MetaCampaignLaunchBlocker,
  type MetaCampaignLaunchResult,
  type MetaCampaignAdSetPayloadPreviewResult,
  type MetaLaunchPayloadSnapshot,
  type MetaLaunchStep,
  type MetaLaunchSteps,
} from './meta-campaign-api-payload.util';
import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import {
  MetaLaunchStepTracer,
  buildMetaLaunchDebugExport,
  buildMetaLaunchGraphUrl,
  isMetaInternalErrorCode2,
  metaCode2UserMessage,
  metaLaunchDebugDir,
  writeMetaDebugJson,
  type MetaLaunchDebugTrace,
} from './meta-launch-debug.util';
import type { MetaGraphResult } from './meta-graph-client.service';
import {
  MetaCatalogSalesAssetsVerifyService,
  type MetaCatalogSalesAssetsVerification,
} from './meta-catalog-sales-assets-verify.service';

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

export type { MetaCampaignLaunchBlocker, MetaApiErrorDetail, MetaLaunchSteps, MetaLaunchStep, MetaLaunchPayloadSnapshot } from './meta-campaign-api-payload.util';
export type { MetaLaunchDebugTrace } from './meta-launch-debug.util';
export type { MetaAdSetProbeResult } from './meta-adset-probe.util';
export type { MetaCatalogSalesAssetsVerification } from './meta-catalog-sales-assets-verify.service';

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
    private readonly catalogSalesAssetsVerify: MetaCatalogSalesAssetsVerifyService,
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
        locationTargetingMode: source.locationTargetingMode,
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

  async launchExistingDraft(id: string, body?: CreateMetaCampaignDto) {
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
    const settings = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(settings ?? ({} as never));

    if (body) {
      await this.updateDraftFromDto(id, body, ids);
    }
    const refreshed = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    const current = refreshed ?? row;

    if (current.metaCampaignId && current.metaAdId) {
      return {
        ok: false as const,
        status: 'already_live' as const,
        message: 'Kampaň již existuje v Meta.',
        campaign: this.serializeDraft(current),
      };
    }

    const dto = body ?? this.draftRowToDto(current);
    const blockers = this.computeLaunchBlockersForMode(dto, settings, 'launch', true);
    if (blockers.length) {
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: blockers.map((b) => `❌ ${b.message}`).join('\n'),
        blockers,
        campaign: this.serializeDraft(current),
      };
    }
    return this.launchLiveCampaign(id, dto, ids, 'ACTIVE');
  }

  async resetPartialMetaLaunch(id: string) {
    if (!(await this.ensureCampaignTableReady())) {
      return { ok: false as const, message: META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE, campaign: null };
    }
    const draft = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id } });
    if (!draft) {
      return { ok: false as const, message: 'Koncept nenalezen.', campaign: null };
    }
    if (draft.metaCampaignId && (await this.isLiveEnabled())) {
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
      const del = await this.graph.delete<{ success?: boolean }>(`/${draft.metaCampaignId}`, token);
      if (!del.ok) {
        return {
          ok: false as const,
          message: del.errorMessage ?? 'Kampaň v Meta se nepodařilo smazat.',
          campaign: this.serializeDraft(draft),
        };
      }
    }
    const updated = await this.prisma.metaMarketingCampaignDraft.update({
      where: { id },
      data: {
        metaCampaignId: null,
        metaAdSetId: null,
        metaAdId: null,
        metaCreativeId: null,
        metaProductSetId: null,
        metaLaunchSteps: Prisma.JsonNull,
        metaLaunchPayloads: Prisma.JsonNull,
        metaStatus: null,
        metaEffectiveStatus: null,
        status: 'draft',
        errorMessage: null,
      },
    });
    return {
      ok: true as const,
      message: 'Meta kampaň byla resetována — můžete spustit znovu.',
      campaign: this.serializeDraft(updated),
    };
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
    locationTargetingMode?: string | null;
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
      locationTargetingMode: row.locationTargetingMode ?? undefined,
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
    const draftRow = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id: draftId } });
    const launchSteps = this.parseLaunchSteps(draftRow?.metaLaunchSteps) ?? emptyLaunchSteps();
    const launchPayloads: MetaLaunchPayloadSnapshot =
      draftRow?.metaLaunchPayloads && typeof draftRow.metaLaunchPayloads === 'object'
        ? (draftRow.metaLaunchPayloads as MetaLaunchPayloadSnapshot)
        : {};
    let metaCampaignId = draftRow?.metaCampaignId ?? null;
    let metaAdSetId = draftRow?.metaAdSetId ?? null;
    let metaProductSetId = draftRow?.metaProductSetId ?? null;
    let metaCreativeId = draftRow?.metaCreativeId ?? null;
    let metaAdId = draftRow?.metaAdId ?? null;
    let audienceMetaId: string | null = null;
    if (dto.audienceId?.trim()) {
      const audience = await this.prisma.metaRemarketingAudience
        .findUnique({ where: { id: dto.audienceId.trim() } })
        .catch(() => null);
      audienceMetaId = audience?.metaAudienceId ?? null;
    }

    const catalogId = ids.catalogId;
    const debugEnabled = await this.isLaunchDebugEnabled();
    const graphVersion = this.fbConfig.getGraphApiVersion();
    const tracer = new MetaLaunchStepTracer(
      {
        graphApiVersion: graphVersion,
        businessId: ids.businessId,
        adAccountId: ids.adAccountId,
        pageId: row?.pageId ?? null,
        instagramBusinessId: row?.instagramBusinessId ?? null,
        pixelId: ids.pixelId,
        catalogId,
        datasetId: ids.datasetId,
        campaignId: metaCampaignId,
        adSetId: metaAdSetId,
        creativeId: metaCreativeId,
        adId: metaAdId,
        draftId,
      },
      this.graph.graphBase(graphVersion),
      debugEnabled,
      metaLaunchDebugDir(),
    );
    const launchContextIds = (verifiedPixelId?: string | null) =>
      this.buildLaunchContextIds(ids, row, {
        draftId,
        campaignId: metaCampaignId,
        adSetId: metaAdSetId,
        creativeId: metaCreativeId,
        adId: metaAdId,
        verifiedPixelId,
      });
    const persistDebug = () => tracer.getTrace();
    let payloadContext = this.buildPayloadContext(dto, ids, row, catalogId);
    let assetsVerification: MetaCatalogSalesAssetsVerification | null = null;
    let verifiedPixelId: string | null = null;
    let catalogLaunchMode: 'sales' | 'traffic' | null =
      launchPayloads.catalogLaunchMode ??
      (launchPayloads.campaign?.objective === 'OUTCOME_AWARENESS'
        ? 'traffic'
        : launchPayloads.campaign?.objective === 'OUTCOME_SALES'
          ? 'sales'
          : null);
    let fallbackReason: string | null = launchPayloads.fallbackReason ?? null;
    let combinationDiagnostics: MetaCampaignCombinationDiagnostics | null = null;

    if (payloadContext.goal === 'catalog' || dto.creativeType === 'catalog_products') {
      assetsVerification = await this.catalogSalesAssetsVerify.verifyForCatalogSalesLaunch();
      if (!assetsVerification.ok) {
        const msg = this.formatPartialLaunchUserMessage(launchSteps, assetsVerification.message);
        await this.persistLaunchState(draftId, {
          status: 'error',
          errorMessage: msg,
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
        });
        return {
          ok: false as const,
          status: 'validation_error' as const,
          message: msg,
          failedStep: 'adset' as const,
          launchSteps,
          assetsVerification,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }
      catalogLaunchMode = assetsVerification.catalogLaunchMode;
      verifiedPixelId = assetsVerification.verifiedPixelId;
      fallbackReason =
        catalogLaunchMode === 'traffic'
          ? assetsVerification.message.includes('Purchase')
            ? CATALOG_TRAFFIC_FALLBACK_MESSAGE
            : assetsVerification.message
          : null;
      payloadContext = this.buildPayloadContext(dto, ids, row, catalogId, catalogLaunchMode);
      if (catalogLaunchMode === 'sales' && verifiedPixelId) {
        payloadContext = {
          ...payloadContext,
          pixelId: verifiedPixelId,
        };
        tracer.updateContext({ pixelId: verifiedPixelId });
      }
      launchPayloads.catalogLaunchMode = catalogLaunchMode;
      launchPayloads.fallbackReason = fallbackReason;
    }

    const specResolved = resolveMetaCampaignPayloadSpec(payloadContext);
    if (!specResolved.ok) {
      const msg = specResolved.blockers.map((b) => b.message).join('\n');
      await this.markDraftError(draftId, msg);
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        blockers: specResolved.blockers,
        campaign: null,
      };
    }
    let metaSpec = specResolved.spec;

    const comboBlockers = validateMetaCampaignCombination({
      spec: metaSpec,
      ctx: payloadContext,
    });
    combinationDiagnostics = buildCombinationDiagnostics({
      spec: metaSpec,
      ctx: payloadContext,
      blockers: comboBlockers,
    });
    launchPayloads.combinationDiagnostics = combinationDiagnostics;
    if (comboBlockers.length) {
      const msg = comboBlockers.map((b) => b.message).join('\n');
      await this.markDraftError(draftId, msg);
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        blockers: comboBlockers,
        campaign: null,
      };
    }

    const budgetConfig = resolveBudgetConfig(false);
    const dailyBudgetMinor = Math.round(dto.dailyBudgetCzk * 100);

    let resolvedGeo;
    try {
      resolvedGeo = await this.geo.resolveGeoForTargeting({
        metaGeoKey: dto.metaGeoKey,
        cityName: dto.cityName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusKm: dto.radiusKm,
        locationTargetingMode:
          dto.locationTargetingMode ?? draftRow?.locationTargetingMode ?? 'city',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lokalitu nelze namapovat na Meta Geo.';
      await this.persistLaunchState(draftId, {
        ...(metaCampaignId ? { metaCampaignId } : {}),
        status: 'error',
        errorMessage: this.formatPartialLaunchUserMessage(launchSteps, msg),
        metaLaunchSteps: launchSteps,
        metaLaunchPayloads: launchPayloads,
      });
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: this.formatPartialLaunchUserMessage(launchSteps, msg),
        failedStep: 'adset' as const,
        launchSteps,
        assetsVerification,
        campaign: await this.loadSerializedDraft(draftId),
      };
    }

    const targeting = this.buildTargetingFromGeo(resolvedGeo, dto, audienceMetaId);
    launchPayloads.targeting = targeting;
    launchPayloads.combinationDiagnostics = combinationDiagnostics;
    launchPayloads.launchPhase = metaCampaignId ? 'CAMPAIGN_CREATED' : 'ADSET_PENDING';

    const objective = metaSpec.campaignObjective;

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
        campaign: await this.loadSerializedDraft(draftId),
      };
    }

    launchPayloads.campaign = campaignPayload;

    if (!metaCampaignId) {
      const campaignPath = `/act_${actId}/campaigns`;
      const campaignRes = await this.graph.post<{ id?: string }>(
        campaignPath,
        token,
        campaignPayload,
      );
      tracer.recordResult('campaign', campaignPath, campaignPayload, campaignRes);
      tracer.updateContext({ campaignId: campaignRes.ok ? campaignRes.data.id ?? null : null });

      if (!campaignRes.ok || !campaignRes.data.id) {
        const failure = this.formatLaunchApiFailure(
          'Vytvoření kampaně',
          campaignPayload,
          campaignRes,
          'campaign',
          tracer,
          launchContextIds(),
          serializePayloadForMetaApi(campaignPayload),
        );
        launchSteps.campaign = { ok: false, error: failure.message };
        await this.persistLaunchState(draftId, {
          status: 'error',
          errorMessage: failure.message,
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
          metaLaunchDebug: persistDebug(),
        });
        return {
          ok: false as const,
          status: 'error' as const,
          message: failure.message,
          metaApiError: failure.detail,
          failedStep: 'campaign' as const,
          launchSteps,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }

      metaCampaignId = campaignRes.data.id;
      launchSteps.campaign = { ok: true, id: metaCampaignId };
      tracer.updateContext({ campaignId: metaCampaignId });
    } else {
      launchSteps.campaign = { ok: true, id: metaCampaignId };
      tracer.recordSkipped(
        'campaign',
        `/act_${actId}/campaigns`,
        campaignPayload,
        `Campaign již existuje (${metaCampaignId})`,
      );
    }

    const effectivePayloadContext = payloadContext;
    const adSetBuild = this.buildAdSetLaunchPayload({
      dto,
      ids,
      row,
      metaCampaignId: metaCampaignId!,
      targeting,
      publishStatus,
      budgetConfig,
      dailyBudgetMinor,
      catalogId,
      metaSpec,
      payloadContext: effectivePayloadContext,
    });

    if (!adSetBuild.ok) {
      const msg = adSetBuild.blockers.map((b) => b.message).join(' ');
      launchPayloads.adSet = adSetBuild.payload ?? null;
      await this.persistLaunchState(draftId, {
        metaCampaignId,
        status: 'error',
        errorMessage: msg,
        metaLaunchSteps: launchSteps,
        metaLaunchPayloads: launchPayloads,
      });
      return {
        ok: false as const,
        status: 'validation_error' as const,
        message: msg,
        blockers: adSetBuild.blockers,
        failedStep: 'adset' as const,
        launchSteps,
        campaign: await this.loadSerializedDraft(draftId),
        adSetPayloadPreview: adSetBuild.payload ?? null,
        adSetPayloadMeta: adSetBuild.metaForm ?? null,
      };
    }

    const adSetPayload = adSetBuild.payload;
    const adSetSpec = adSetBuild.spec;
    launchPayloads.adSet = adSetPayload;

    if (!metaAdSetId) {
      const adSetPath = `/act_${actId}/adsets`;
      const adSetRes = await this.graph.post<{ id?: string }>(
        adSetPath,
        token,
        adSetPayload,
      );
      tracer.recordResult('adSet', adSetPath, adSetPayload, { ...adSetRes, attempts: 1 });

      if (!adSetRes.ok || !adSetRes.data.id) {
        const code2Failure = isMetaInternalErrorCode2(adSetRes);
        const userMessage =
          code2Failure && metaCampaignId
            ? metaCode2UserMessage('Ad Set')
            : null;
        const failure = this.formatLaunchApiFailure(
          'Vytvoření ad setu',
          adSetPayload,
          adSetRes,
          'adset',
          tracer,
          launchContextIds(verifiedPixelId),
          adSetBuild.metaForm,
          userMessage,
        );
        const graphPaths = buildMetaLaunchGraphPaths(actId);
        const graphBase = this.graph.graphBase(graphVersion);
        const debugExport = buildMetaLaunchDebugExport({
          trace: tracer.getTrace(),
          payloads: launchPayloads,
          graphUrls: {
            campaign: buildMetaLaunchGraphUrl(graphBase, graphPaths.campaign),
            adSet: buildMetaLaunchGraphUrl(graphBase, graphPaths.adSet),
            creative: buildMetaLaunchGraphUrl(graphBase, graphPaths.creative),
            ad: buildMetaLaunchGraphUrl(graphBase, graphPaths.ad),
          },
          failedStep: 'adset',
          metaError: code2Failure && !adSetRes.ok
            ? {
                httpStatus: adSetRes.httpStatus,
                errorCode: adSetRes.errorCode,
                errorMessage: adSetRes.errorMessage,
                requestPayload: adSetPayload,
                metaForm: adSetBuild.metaForm ?? null,
                response: adSetRes.data ?? null,
              }
            : null,
        });
        writeMetaDebugJson(metaLaunchDebugDir(), draftId, debugExport);
        let adSetProbe: MetaAdSetProbeResult | null = null;
        if (await this.isLaunchDebugEnabled()) {
          try {
            adSetProbe = await this.probeAdSetCreate(dto, { draftId, campaignId: metaCampaignId });
            writeMetaDebugJson(metaLaunchDebugDir(), draftId, {
              exportedAt: new Date().toISOString(),
              graphApiVersion: graphVersion,
              context: tracer.getTrace().context,
              steps: [],
              payloads: launchPayloads,
              graphUrls: debugExport.graphUrls,
              failedStep: 'adset',
              metaError: debugExport.metaError,
              adSetProbe,
            });
          } catch (probeErr) {
            this.logger.warn(
              `Ad set probe failed: ${probeErr instanceof Error ? probeErr.message : probeErr}`,
            );
          }
        }
        launchSteps.adSet = { ok: false, error: failure.message };
        await this.persistLaunchState(draftId, {
          metaCampaignId,
          status: 'error',
          errorMessage: failure.message,
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
          metaLaunchDebug: persistDebug(),
        });
        return {
          ok: false as const,
          status: 'error' as const,
          message: failure.message,
          metaApiError: { ...failure.detail, adSetProbe },
          failedStep: 'adset' as const,
          launchSteps,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }

      metaAdSetId = adSetRes.data.id;
      launchSteps.adSet = { ok: true, id: metaAdSetId };
      tracer.updateContext({ adSetId: metaAdSetId });
    } else {
      launchSteps.adSet = { ok: true, id: metaAdSetId };
      tracer.recordSkipped(
        'adSet',
        `/act_${actId}/adsets`,
        adSetPayload,
        `Ad Set již existuje (${metaAdSetId})`,
      );
    }

    const creativeType = this.resolveCreativeType(dto.creativeType);

    if (creativeType === 'catalog_products' || dto.objective === 'catalog') {
      if (!metaProductSetId) {
        const productSetResult = await this.resolveCatalogProductSet(
          catalogId,
          token,
          dto.name.trim(),
          dto.selectedProductIds ?? [],
          metaProductSetId,
        );
        if (!productSetResult.ok) {
          launchSteps.creative = { ok: false, error: productSetResult.message };
          await this.persistLaunchState(draftId, {
            metaCampaignId,
            metaAdSetId,
            status: 'error',
            errorMessage: this.formatPartialLaunchUserMessage(launchSteps, productSetResult.message),
            metaLaunchSteps: launchSteps,
            metaLaunchPayloads: launchPayloads,
          });
          return {
            ok: false as const,
            status: 'error' as const,
            message: productSetResult.message,
            metaApiError: productSetResult.metaApiError,
            failedStep: 'creative' as const,
            launchSteps,
            assetsVerification,
            campaign: await this.loadSerializedDraft(draftId),
          };
        }
        metaProductSetId = productSetResult.id;
        launchPayloads.productSetId = metaProductSetId;
        this.logger.log(`[meta-campaign] product_set=${metaProductSetId} draft=${draftId}`);
      } else {
        launchPayloads.productSetId = metaProductSetId;
      }
    }

    const pageIds = this.creative.resolvePageIds(row);
    const normalizedCatalogId = catalogId?.replace(/^catalog_/i, '') ?? catalogId;

    if (!metaCreativeId) {
      const built = await this.creative.buildAdCreative({
        actId,
        token,
        pageAccessToken,
        campaignName: dto.name.trim(),
        creativeType,
        creativePayload: dto.creativePayload as Record<string, unknown> | undefined,
        pageId: pageIds.pageId,
        instagramActorId: pageIds.instagramActorId,
        catalogId: normalizedCatalogId,
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
          errorMessage: this.formatPartialLaunchUserMessage(launchSteps, built.message),
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
        });
        return {
          ok: false as const,
          status: (built.metaApiError ? 'error' : 'validation_error') as 'error' | 'validation_error',
          message: built.message,
          metaApiError: built.metaApiError,
          failedStep: 'creative' as const,
          launchSteps,
          assetsVerification,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }

      const creativeBody = built.body;
      launchPayloads.creative = creativeBody;

      const creativePath = `/act_${actId}/adcreatives`;
      const creativeRes = await this.graph.postWithTransientRetry<{ id?: string }>(
        creativePath,
        token,
        creativeBody,
        { logLabel: `adcreatives draft=${draftId}`, retryDelaysMs: [3000, 3000, 3000] },
      );
      tracer.recordResult('creative', creativePath, creativeBody, creativeRes);

      if (!creativeRes.ok || !creativeRes.data.id) {
        const failure = this.formatLaunchApiFailure(
          'Vytvoření kreativy',
          creativeBody,
          creativeRes,
          'creative',
          tracer,
          launchContextIds(verifiedPixelId),
          serializePayloadForMetaApi(creativeBody),
          isMetaInternalErrorCode2(creativeRes) && metaCampaignId
            ? metaCode2UserMessage('Creative')
            : null,
        );
        launchSteps.creative = { ok: false, error: failure.message };
        await this.persistLaunchState(draftId, {
          metaCampaignId,
          metaAdSetId,
          metaProductSetId,
          status: 'error',
          errorMessage: this.formatPartialLaunchUserMessage(launchSteps, failure.message),
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
          metaLaunchDebug: persistDebug(),
        });
        return {
          ok: false as const,
          status: 'error' as const,
          message: failure.message,
          metaApiError: failure.detail,
          failedStep: 'creative' as const,
          launchSteps,
          assetsVerification,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }

      metaCreativeId = creativeRes.data.id;
      launchSteps.creative = { ok: true, id: metaCreativeId };
      tracer.updateContext({ creativeId: metaCreativeId });
      this.logger.log(`[meta-campaign] creative=${metaCreativeId} draft=${draftId}`);
    } else {
      launchSteps.creative = { ok: true, id: metaCreativeId };
      tracer.recordSkipped(
        'creative',
        `/act_${actId}/adcreatives`,
        launchPayloads.creative ?? {},
        `Creative již existuje (${metaCreativeId})`,
      );
    }

    if (!metaAdId) {
      const adPayload = {
        name: `${dto.name.trim()} — reklama`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: metaCreativeId }),
        status: 'PAUSED' as const,
      };
      launchPayloads.ad = adPayload;

      const adPath = `/act_${actId}/ads`;
      const adRes = await this.graph.postWithTransientRetry<{ id?: string }>(
        adPath,
        token,
        adPayload,
        { logLabel: `ads draft=${draftId}`, retryDelaysMs: [3000, 3000, 3000] },
      );
      tracer.recordResult('ad', adPath, adPayload, adRes);

      if (!adRes.ok || !adRes.data.id) {
        const failure = this.formatLaunchApiFailure(
          'Vytvoření reklamy',
          adPayload,
          adRes,
          'ad',
          tracer,
          launchContextIds(verifiedPixelId),
          serializePayloadForMetaApi(adPayload),
          isMetaInternalErrorCode2(adRes) && metaCampaignId
            ? metaCode2UserMessage('Ad')
            : null,
        );
        launchSteps.ad = { ok: false, error: failure.message };
        await this.persistLaunchState(draftId, {
          metaCampaignId,
          metaAdSetId,
          metaProductSetId,
          metaCreativeId,
          status: 'error',
          errorMessage: this.formatPartialLaunchUserMessage(launchSteps, failure.message),
          metaLaunchSteps: launchSteps,
          metaLaunchPayloads: launchPayloads,
          metaLaunchDebug: persistDebug(),
        });
        return {
          ok: false as const,
          status: 'error' as const,
          message: failure.message,
          metaApiError: failure.detail,
          failedStep: 'ad' as const,
          launchSteps,
          assetsVerification,
          campaign: await this.loadSerializedDraft(draftId),
        };
      }

      metaAdId = adRes.data.id;
      launchSteps.ad = { ok: true, id: metaAdId };
      tracer.updateContext({ adId: metaAdId });
    } else {
      launchSteps.ad = { ok: true, id: metaAdId };
      tracer.recordSkipped(
        'ad',
        `/act_${actId}/ads`,
        launchPayloads.ad ?? {},
        `Ad již existuje (${metaAdId})`,
      );
    }

    launchPayloads.launchPhase = 'COMPLETED';

    const creativePreviewUrl =
      (await this.creative.fetchCreativeThumbnailUrl(metaCreativeId!, token)) ?? null;
    const previewHtml = (await this.creative.fetchAdPreviewHtml(metaAdId!, token)) ?? null;

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
        metaLaunchPayloads: launchPayloads as Prisma.InputJsonValue,
        metaLaunchDebug: persistDebug() as Prisma.InputJsonValue,
        creativePayload: (dto.creativePayload ?? {}) as Prisma.InputJsonValue,
        metaStatus: statusData.status,
        metaEffectiveStatus: statusData.effectiveStatus,
        metaInsights: insights as Prisma.InputJsonValue,
        metaLaunchedAt: now,
        metaStatusSyncedAt: now,
        status: 'paused',
        errorMessage: null,
      },
    });

    this.logger.log(
      `[meta-campaign] live created campaign=${metaCampaignId} adset=${metaAdSetId} product_set=${metaProductSetId ?? '—'} creative=${metaCreativeId} ad=${metaAdId} draft=${draftId}`,
    );

    const modeLabel =
      catalogLaunchMode === 'traffic'
        ? ' (katalogová návštěvnost — automatický fallback)'
        : catalogLaunchMode === 'sales'
          ? ' (katalogový prodej)'
          : '';

    return {
      ok: true as const,
      status: 'paused' as const,
      message: `Reklama je připravena ke kontrole v Meta (PAUSED)${modeLabel}. Campaign ${metaCampaignId}, Ad Set ${metaAdSetId}, Creative ${metaCreativeId}, Ad ${metaAdId}.`,
      liveEnabled: true,
      launchSteps,
      assetsVerification,
      campaign: this.serializeDraft(updated),
    };
  }

  private formatPartialLaunchUserMessage(launchSteps: MetaLaunchSteps, detail: string): string {
    if (launchSteps.campaign?.ok && !launchSteps.adSet?.ok) {
      return [
        'Reklama zatím nebyla vytvořena. Kampaň existuje, ale chybí Ad Set, Creative a Ad.',
        detail,
        '1. Doplňte souřadnice nebo zvolte celé město.',
        '2. Ověřte zdroj událostí katalogu.',
        '3. Pokračujte ve vytvoření Ad Setu a reklamy.',
      ].join('\n\n');
    }
    if (launchSteps.campaign?.ok && launchSteps.adSet?.ok && !launchSteps.creative?.ok) {
      return [
        'Kampaň a Ad Set existují, ale chybí Creative a Ad.',
        detail,
      ].join('\n\n');
    }
    return detail;
  }

  private deriveLaunchDisplayStatus(row: {
    metaCampaignId: string | null;
    metaAdSetId: string | null;
    metaCreativeId?: string | null;
    metaAdId: string | null;
    metaLaunchSteps?: unknown;
    status: string;
    metaEffectiveStatus?: string | null;
  }): string {
    if (row.metaAdId && row.metaCreativeId && row.metaAdSetId && row.metaCampaignId) {
      if (row.metaEffectiveStatus === 'ACTIVE' || row.status === 'active') {
        return 'active';
      }
      return 'paused';
    }
    if (row.metaCampaignId && !row.metaAdSetId) {
      return 'partial_campaign';
    }
    if (row.metaCampaignId && row.metaAdSetId && !row.metaCreativeId) {
      return 'partial_adset';
    }
    if (row.status === 'error') {
      return 'error';
    }
    return row.status;
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

  private async updateDraftFromDto(
    id: string,
    dto: CreateMetaCampaignDto,
    ids: ReturnType<typeof resolveMetaCenterIds>,
  ) {
    await this.prisma.metaMarketingCampaignDraft.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        objective: dto.objective,
        creativeType: this.resolveCreativeType(dto.creativeType),
        targetingMode: this.resolveTargetingMode(dto.targetingMode),
        locationTargetingMode: this.resolveLocationTargetingMode(dto.locationTargetingMode),
        audienceId: dto.audienceId?.trim() ?? null,
        creativePayload: dto.creativePayload
          ? (dto.creativePayload as Prisma.InputJsonValue)
          : undefined,
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
        catalogId: ids.catalogId,
        datasetId: ids.datasetId ?? ids.pixelId,
      },
    });
  }

  private async loadSerializedDraft(draftId: string) {
    const row = await this.prisma.metaMarketingCampaignDraft.findUnique({ where: { id: draftId } });
    return row ? this.serializeDraft(row) : null;
  }

  private resolveTargetingMode(value: string | undefined): MetaCampaignTargetingMode {
    if (value && (META_CAMPAIGN_TARGETING_MODES as readonly string[]).includes(value)) {
      return value as MetaCampaignTargetingMode;
    }
    return 'map';
  }

  private resolveLocationTargetingMode(value: string | undefined): 'city' | 'radius' {
    return value === 'radius' ? 'radius' : 'city';
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
          cities: [{ key: geo.key }],
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

  async verifyCatalogSalesAssets(): Promise<MetaCatalogSalesAssetsVerification> {
    return this.catalogSalesAssetsVerify.verifyForCatalogSalesLaunch();
  }

  async probeAdSetCreate(
    dto: CreateMetaCampaignDto,
    options?: { draftId?: string; campaignId?: string | null },
  ): Promise<MetaAdSetProbeResult> {
    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const token = await this.oauth.resolveMarketingAccessToken();
    const actId = (ids.adAccountId ?? '').replace(/^act_/, '');
    const graphVersion = row?.graphApiVersion || this.fbConfig.getGraphApiVersion();
    const graphBase = this.graph.graphBase(graphVersion);
    const adSetPath = `/act_${actId}/adsets`;
    const graphUrl = buildProbeGraphUrl(graphBase, actId);

    const payloadContext = this.buildPayloadContext(dto, ids, row, ids.catalogId);
    const specResolved = resolveMetaCampaignPayloadSpec(payloadContext);
    if (!specResolved.ok) {
      return {
        ok: false,
        message: specResolved.blockers.map((b) => b.message).join('\n'),
        campaignId: options?.campaignId ?? '',
        graphApiVersion: graphVersion,
        graphPath: adSetPath,
        steps: [],
        failureStep: null,
        lastSuccessStep: null,
        recommendedPayload: null,
        recommendedMetaForm: null,
        v25Validation: [],
      };
    }
    const metaSpec = specResolved.spec;

    let metaCampaignId = options?.campaignId?.trim() || null;
    if (!metaCampaignId && options?.draftId) {
      const draft = await this.prisma.metaMarketingCampaignDraft.findUnique({
        where: { id: options.draftId },
        select: { metaCampaignId: true },
      });
      metaCampaignId = draft?.metaCampaignId ?? null;
    }

    if (!metaCampaignId) {
      const campaignPayload = {
        name: `${dto.name.trim()} — probe`,
        objective: metaSpec.campaignObjective,
        status: 'PAUSED',
        special_ad_categories: JSON.stringify(['HOUSING']),
        is_adset_budget_sharing_enabled: false,
      };
      const campaignRes = await this.graph.post<{ id?: string }>(
        `/act_${actId}/campaigns`,
        token,
        campaignPayload,
      );
      if (!campaignRes.ok) {
        return {
          ok: false,
          message: `Probe: nelze vytvořit testovací kampaň — ${campaignRes.errorMessage}`,
          campaignId: '',
          graphApiVersion: graphVersion,
          graphPath: adSetPath,
          steps: [],
          failureStep: null,
          lastSuccessStep: null,
          recommendedPayload: null,
          recommendedMetaForm: null,
          v25Validation: [],
        };
      }
      if (!campaignRes.data.id) {
        return {
          ok: false,
          message: 'Probe: nelze vytvořit testovací kampaň — Meta nevrátila ID kampaně',
          campaignId: '',
          graphApiVersion: graphVersion,
          graphPath: adSetPath,
          steps: [],
          failureStep: null,
          lastSuccessStep: null,
          recommendedPayload: null,
          recommendedMetaForm: null,
          v25Validation: [],
        };
      }
      metaCampaignId = campaignRes.data.id;
    }

    const resolvedGeo = await this.geo.resolveGeoForTargeting({
      metaGeoKey: dto.metaGeoKey,
      cityName: dto.cityName,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusKm: dto.radiusKm,
      locationTargetingMode: dto.locationTargetingMode ?? 'city',
    });
    const targeting = this.buildTargetingFromGeo(resolvedGeo, dto, null);
    const budgetConfig = resolveBudgetConfig(false);
    const dailyBudgetMinor = Math.round(dto.dailyBudgetCzk * 100);
    const catalogId = ids.catalogId?.replace(/^catalog_/i, '') ?? null;
    let pixelId: string | null = ids.pixelId?.trim() || null;
    if (metaSpec.mode === 'catalog_sales') {
      const assetsVerification = await this.catalogSalesAssetsVerify.verifyForCatalogSalesLaunch();
      if (!assetsVerification.ok) {
        return {
          ok: false,
          message: assetsVerification.message,
          campaignId: metaCampaignId ?? '',
          graphApiVersion: graphVersion,
          graphPath: adSetPath,
          steps: [],
          failureStep: null,
          lastSuccessStep: null,
          recommendedPayload: null,
          recommendedMetaForm: null,
          v25Validation: catalogSalesV25Validation(metaSpec),
        };
      }
      pixelId = assetsVerification.verifiedPixelId;
    } else if (!pixelId) {
      pixelId = ids.datasetId?.trim() || null;
    }
    const dsaLabels = resolveDsaDisclosureLabels({
      pageName: row?.pageName,
      adAccountName: row?.adAccountName,
      campaignName: dto.name.trim(),
    });

    const probeSteps = buildMetaAdSetProbeSteps({
      campaignId: metaCampaignId,
      adSetName: `${dto.name.trim()} — probe sada`,
      publishStatus: 'PAUSED',
      dailyBudgetMinor,
      billingEvent: metaSpec.billingEvent,
      optimizationGoal: metaSpec.optimizationGoal,
      bidStrategy: metaSpec.bidStrategy,
      destinationType: metaSpec.destinationType,
      advantageAudience: metaSpec.advantageAudience,
      targeting,
      catalogId,
      pixelId,
      dsaLabels,
      isAdsetBudgetSharingEnabled: budgetConfig.isAdsetBudgetSharingEnabled,
    });

    const stepResults = [];
    for (const step of probeSteps) {
      const payload = step.buildPayload();
      const result = await this.graph.postWithResponseHeaders<{ id?: string }>(
        adSetPath,
        token,
        payload,
      );
      const mapped = mapProbeGraphResult(step, graphUrl, payload, result);
      stepResults.push(mapped);

      if (result.ok && result.data?.id) {
        await this.graph.delete(`/${result.data.id}`, token).catch(() => undefined);
      }

      if (!result.ok) {
        break;
      }
    }

    const recommendedPayload =
      metaSpec.mode === 'catalog_sales' && catalogId && pixelId && dsaLabels
        ? buildSupportedCatalogAdSetPayload({
            campaignId: metaCampaignId,
            adSetName: `${dto.name.trim()} — sada`,
            publishStatus: 'PAUSED',
            dailyBudgetMinor,
            spec: metaSpec,
            targeting,
            catalogId,
            pixelId,
            dsaLabels,
            isAdsetBudgetSharingEnabled: budgetConfig.isAdsetBudgetSharingEnabled,
            startTime: this.parseDate(dto.startDate)?.toISOString(),
            endTime: this.parseDate(dto.endDate)?.toISOString(),
          })
        : metaSpec.mode === 'catalog_traffic' && catalogId && dsaLabels
          ? buildSupportedCatalogTrafficAdSetPayload({
              campaignId: metaCampaignId,
              adSetName: `${dto.name.trim()} — sada`,
              publishStatus: 'PAUSED',
              dailyBudgetMinor,
              spec: metaSpec,
              targeting,
              catalogId,
              dsaLabels,
              isAdsetBudgetSharingEnabled: budgetConfig.isAdsetBudgetSharingEnabled,
              startTime: this.parseDate(dto.startDate)?.toISOString(),
              endTime: this.parseDate(dto.endDate)?.toISOString(),
            })
          : null;

    const summary = summarizeProbeResult(
      metaCampaignId,
      graphVersion,
      adSetPath,
      stepResults,
      metaSpec,
      recommendedPayload,
    );

    this.logger.log(
      `[meta-adset-probe] draft=${options?.draftId ?? '—'} campaign=${metaCampaignId} ok=${summary.ok} steps=${stepResults.length} failure=${summary.failureStep?.key ?? '—'}`,
    );

    if (options?.draftId) {
      try {
        const dir = metaLaunchDebugDir();
        const filePath = `${dir}/${options.draftId}/adset-probe.json`;
        writeMetaDebugJson(dir, options.draftId, {
          exportedAt: new Date().toISOString(),
          graphApiVersion: graphVersion,
          context: { draftId: options.draftId, campaignId: metaCampaignId },
          steps: summary.steps,
          payloads: { recommended: recommendedPayload },
          graphUrls: { adSet: graphUrl },
          failedStep: summary.failureStep?.key ?? null,
          metaError: summary.failureStep,
          adSetProbe: summary,
        } as never);
        void filePath;
      } catch {
        // ignore debug file errors
      }
    }

    return summary;
  }

  async previewAdSetPayload(dto: CreateMetaCampaignDto): Promise<MetaCampaignAdSetPayloadPreviewResult> {
    const full = await this.previewCampaignPayloads(dto);
    return {
      ok: full.ok,
      message: full.message,
      blockers: full.blockers,
      payload: full.adSet?.payload ?? full.payload ?? null,
      metaForm: full.adSet?.metaForm ?? full.metaForm ?? null,
      spec: full.spec
        ? {
            objectiveKey: full.spec.mode,
            campaignObjective: full.spec.campaignObjective,
            optimizationGoal: full.spec.optimizationGoal,
            requiresPromotedObject: full.spec.requiresPromotedObject,
          }
        : null,
      previews: full,
    };
  }

  async previewCampaignPayloads(dto: CreateMetaCampaignDto): Promise<MetaCampaignLaunchResult> {
    const row = await this.getSettingsRow();
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const payloadContext = this.buildPayloadContext(dto, ids, row, ids.catalogId);
    const specResolved = resolveMetaCampaignPayloadSpec(payloadContext);
    if (!specResolved.ok) {
      return emptyMetaCampaignLaunchResult(
        specResolved.blockers.map((b) => b.message).join('\n'),
        specResolved.blockers,
      );
    }

    let resolvedGeo;
    try {
      resolvedGeo = await this.geo.resolveGeoForTargeting({
        metaGeoKey: dto.metaGeoKey,
        cityName: dto.cityName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusKm: dto.radiusKm,
        locationTargetingMode: dto.locationTargetingMode ?? 'city',
      });
    } catch (err) {
      return {
        ...emptyMetaCampaignLaunchResult(
          err instanceof Error ? err.message : 'Lokalitu nelze namapovat na Meta Geo.',
        ),
        spec: toMetaCampaignPayloadPreviewSpec(specResolved.spec),
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
    const metaSpec = specResolved.spec;

    const campaignPayload: Record<string, unknown> = {
      name: dto.name.trim(),
      objective: metaSpec.campaignObjective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify(['HOUSING']),
      is_adset_budget_sharing_enabled: budgetConfig.isAdsetBudgetSharingEnabled,
    };

    const adSetBuilt = this.buildAdSetLaunchPayload({
      dto,
      ids,
      row,
      metaCampaignId: 'PREVIEW_CAMPAIGN_ID',
      targeting,
      publishStatus: 'PAUSED',
      budgetConfig,
      dailyBudgetMinor,
      catalogId: ids.catalogId,
      metaSpec,
      payloadContext,
    });

    const pageIds = this.creative.resolvePageIds(row);
    const creativeBuilt = await this.creative.buildAdCreative({
      actId: (ids.adAccountId ?? '').replace(/^act_/, ''),
      token: 'PREVIEW_TOKEN',
      pageAccessToken: null,
      campaignName: dto.name.trim(),
      creativeType: dto.creativeType,
      creativePayload: dto.creativePayload as Record<string, unknown> | undefined,
      pageId: pageIds.pageId,
      instagramActorId: pageIds.instagramActorId,
      catalogId: ids.catalogId,
      productSetId: dto.selectedProductIds?.length ? 'PREVIEW_PRODUCT_SET_ID' : null,
      frontendBase: this.frontendBase(),
    });

    const creativePayload = creativeBuilt.ok ? creativeBuilt.body : null;
    const adPayload = creativeBuilt.ok
      ? {
          name: `${dto.name.trim()} — reklama`,
          adset_id: 'PREVIEW_ADSET_ID',
          creative: JSON.stringify({ creative_id: 'PREVIEW_CREATIVE_ID' }),
          status: 'PAUSED',
        }
      : null;

    const blockers = [
      ...(adSetBuilt.ok ? [] : adSetBuilt.blockers),
      ...(!creativeBuilt.ok
        ? [{ key: 'creative', message: creativeBuilt.message }]
        : []),
    ];

    const graphVersion = row?.graphApiVersion || this.fbConfig.getGraphApiVersion();
    const graphBase = this.graph.graphBase(graphVersion);
    const graphPaths = buildMetaLaunchGraphPaths((ids.adAccountId ?? '').replace(/^act_/, ''));
    const graphApiUrls = {
      campaign: buildMetaLaunchGraphUrl(graphBase, graphPaths.campaign),
      adSet: buildMetaLaunchGraphUrl(graphBase, graphPaths.adSet),
      creative: buildMetaLaunchGraphUrl(graphBase, graphPaths.creative),
      ad: buildMetaLaunchGraphUrl(graphBase, graphPaths.ad),
    };

    return {
      ok: blockers.length === 0,
      message:
        blockers.length === 0
          ? 'Náhled Meta payloadů připraven.'
          : blockers.map((b) => b.message).join('\n'),
      blockers,
      spec: toMetaCampaignPayloadPreviewSpec(metaSpec),
      campaign: {
        payload: campaignPayload,
        metaForm: serializePayloadForMetaApi(campaignPayload),
        objective: metaSpec.campaignObjective,
        creativeSource: metaSpec.creativeSource,
      },
      adSet: adSetBuilt.ok
        ? {
            payload: adSetBuilt.payload,
            metaForm: adSetBuilt.metaForm,
            objective: metaSpec.campaignObjective,
            optimizationGoal: metaSpec.optimizationGoal,
            billingEvent: metaSpec.billingEvent,
            promotedObject: adSetBuilt.promotedObject,
            creativeSource: metaSpec.creativeSource,
          }
        : {
            payload: adSetBuilt.payload ?? null,
            metaForm: adSetBuilt.metaForm ?? null,
            objective: metaSpec.campaignObjective,
            optimizationGoal: metaSpec.optimizationGoal,
            billingEvent: metaSpec.billingEvent,
            promotedObject: adSetBuilt.promotedObject ?? null,
            creativeSource: metaSpec.creativeSource,
          },
      creative: creativePayload
        ? {
            payload: creativePayload,
            metaForm: serializePayloadForMetaApi(creativePayload),
            creativeSource: metaSpec.creativeSource,
          }
        : null,
      ad: adPayload
        ? {
            payload: adPayload,
            metaForm: serializePayloadForMetaApi(adPayload),
            creativeSource: metaSpec.creativeSource,
          }
        : null,
      graphApiUrls,
      adSetCorrections: adSetBuilt.ok ? adSetBuilt.corrections ?? [] : [],
      payload: adSetBuilt.payload ?? null,
      metaForm: adSetBuilt.metaForm ?? null,
    };
  }

  private buildPayloadContext(
    dto: CreateMetaCampaignDto,
    ids: ReturnType<typeof resolveMetaCenterIds>,
    row: Awaited<ReturnType<typeof this.getSettingsRow>>,
    catalogId: string | null,
    catalogLaunchMode?: 'sales' | 'traffic',
  ) {
    return {
      goal: dto.objective,
      creativeType: dto.creativeType ?? 'catalog_products',
      targetingMode: dto.targetingMode ?? 'map',
      catalogId,
      pixelId: ids.pixelId,
      datasetId: ids.datasetId,
      pageId: row?.pageId?.trim() ?? process.env.FACEBOOK_PAGE_ID?.trim() ?? null,
      instagramActorId: row?.instagramBusinessId?.trim() ?? null,
      leadFormId: extractLeadFormId(dto),
      remarketingConversionEvent: 'VIEW_CONTENT' as const,
      selectedProductIds: dto.selectedProductIds ?? [],
      ...(catalogLaunchMode ? { catalogLaunchMode } : {}),
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
    metaSpec: MetaCampaignPayloadSpec;
    payloadContext: ReturnType<MetaCenterCampaignsService['buildPayloadContext']>;
  }):
    | {
        ok: true;
        payload: Record<string, unknown>;
        metaForm: Record<string, string>;
        spec: MetaCampaignPayloadSpec;
        promotedObject: Record<string, unknown> | null;
        corrections?: string[];
      }
    | {
        ok: false;
        blockers: MetaCampaignLaunchBlocker[];
        payload?: Record<string, unknown>;
        metaForm?: Record<string, string>;
        spec?: MetaCampaignPayloadSpec;
        promotedObject?: Record<string, unknown> | null;
      } {
    const {
      dto,
      ids,
      row,
      metaCampaignId,
      targeting,
      publishStatus,
      budgetConfig,
      dailyBudgetMinor,
      metaSpec,
      payloadContext,
    } = input;

    const dsaLabels = resolveDsaDisclosureLabels({
      pageName: row?.pageName,
      adAccountName: row?.adAccountName,
      campaignName: dto.name.trim(),
    });
    const startTime = this.parseDate(dto.startDate)?.toISOString() ?? undefined;
    const endTime = this.parseDate(dto.endDate)?.toISOString() ?? undefined;

    const built = buildMetaCampaignByMode({
      name: dto.name.trim(),
      campaignId: metaCampaignId,
      publishStatus,
      dailyBudgetMinor,
      useCampaignBudgetOptimization: budgetConfig.useCampaignBudgetOptimization,
      isAdsetBudgetSharingEnabled: budgetConfig.isAdsetBudgetSharingEnabled,
      targeting,
      dsaLabels,
      startTime,
      endTime,
      spec: metaSpec,
      payloadContext,
    });

    if (!built.ok) {
      return {
        ok: false,
        blockers: [
          ...built.blockers,
          ...validateMetaCampaignPayloadContext(payloadContext, metaSpec),
          ...validateGeoTargetingPayload(targeting),
        ],
        payload: built.adSetPayload,
        metaForm: built.adSetPayload ? serializePayloadForMetaApi(built.adSetPayload) : undefined,
        spec: metaSpec,
        promotedObject: built.promotedObject ?? null,
      };
    }

    const adSetPayloadFinal = built.adSetPayload;
    const promotedObject = built.promotedObject;
    const corrections: string[] = [];

    if (!dsaLabels) {
      const dsaBlocker: MetaCampaignLaunchBlocker = {
        key: 'adset.dsa',
        message:
          'Ad set: chybí DSA beneficiary/payor — nastavte název Facebook stránky nebo reklamního účtu v Meta Centru.',
      };
      const blockers = [
        dsaBlocker,
        ...validateMetaCampaignPayloadContext(payloadContext, metaSpec),
      ];
      return {
        ok: false,
        blockers,
        payload: adSetPayloadFinal,
        metaForm: serializePayloadForMetaApi(adSetPayloadFinal),
        spec: metaSpec,
        promotedObject,
      };
    }

    const blockers = [
      ...validateMetaCampaignPayloadContext(payloadContext, metaSpec),
      ...validateAdSetPayload(adSetPayloadFinal, budgetConfig, {
        requiresPromotedObject: metaSpec.requiresPromotedObject,
      }),
      ...validateGeoTargetingPayload(targeting),
      ...validateAdSetPayloadCombination(adSetPayloadFinal, metaSpec),
      ...validateMetaCampaignCombination({
        spec: metaSpec,
        ctx: payloadContext,
        adSetPayload: adSetPayloadFinal,
      }),
    ];

    const metaForm = serializePayloadForMetaApi(adSetPayloadFinal);

    if (blockers.length) {
      return {
        ok: false,
        blockers,
        payload: adSetPayloadFinal,
        metaForm,
        spec: metaSpec,
        promotedObject,
      };
    }

    if (corrections.length) {
      this.logger.log(
        `[meta-campaign] adset payload auto-fix (${metaSpec.mode}): ${corrections.join('; ')}`,
      );
    }

    return {
      ok: true,
      payload: adSetPayloadFinal,
      metaForm,
      spec: metaSpec,
      promotedObject,
      corrections,
    };
  }

  private async resolveCatalogProductSet(
    catalogId: string | null | undefined,
    token: string,
    campaignName: string,
    selectedProductIds: string[],
    existingProductSetId?: string | null,
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; message: string; metaApiError?: MetaApiErrorDetail }
  > {
    const normalizedCatalogId = catalogId?.replace(/^catalog_/i, '').trim() || null;
    if (!normalizedCatalogId) {
      return { ok: false, message: 'Chybí Catalog ID pro katalogovou kreativu.' };
    }

    if (existingProductSetId?.trim()) {
      const check = await this.graph.get<{ id?: string }>(
        `/${existingProductSetId.trim()}`,
        token,
        { fields: 'id' },
      );
      if (check.ok && check.data?.id) {
        return { ok: true, id: check.data.id };
      }
    }

    if (selectedProductIds.length > 0) {
      const payload = {
        name: `${campaignName} — produkty`,
        filter: JSON.stringify({
          retailer_id: { is_any: selectedProductIds },
        }),
      };
      const productSetRes = await this.graph.post<{ id?: string }>(
        `/${normalizedCatalogId}/product_sets`,
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

    const listRes = await this.graph.get<{ data?: Array<{ id?: string; name?: string }> }>(
      `/${normalizedCatalogId}/product_sets`,
      token,
      { fields: 'id,name', limit: '25' },
    );
    const existingSets = listRes.ok ? listRes.data.data ?? [] : [];
    const allProducts = existingSets.find((s) =>
      /all\s*products|všechny\s*produkty/i.test(s.name ?? ''),
    );
    if (allProducts?.id) {
      return { ok: true, id: allProducts.id };
    }
    if (existingSets[0]?.id) {
      return { ok: true, id: existingSets[0].id };
    }

    const allPayload = {
      name: `${campaignName} — všechny produkty`,
      filter: JSON.stringify({}),
    };
    const allRes = await this.graph.post<{ id?: string }>(
      `/${normalizedCatalogId}/product_sets`,
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

  private async isLaunchDebugEnabled(): Promise<boolean> {
    if (process.env.META_LAUNCH_DEBUG === 'true') return true;
    const row = await this.getSettingsRow();
    return row?.campaignsDebugMode === true;
  }

  private buildLaunchContextIds(
    ids: ReturnType<typeof resolveMetaCenterIds>,
    row: Awaited<ReturnType<typeof this.getSettingsRow>>,
    extra: {
      draftId: string;
      campaignId?: string | null;
      adSetId?: string | null;
      creativeId?: string | null;
      adId?: string | null;
      verifiedPixelId?: string | null;
    },
  ): Record<string, string | null> {
    const promotedObjectPixelId =
      extra.verifiedPixelId ?? ids.pixelId ?? ids.datasetId ?? null;
    return {
      businessId: ids.businessId,
      adAccountId: ids.adAccountId,
      pageId: row?.pageId ?? null,
      instagramBusinessId: row?.instagramBusinessId ?? null,
      pixelId: extra.verifiedPixelId ?? ids.pixelId,
      promotedObjectPixelId,
      catalogId: ids.catalogId,
      datasetId: ids.datasetId,
      campaignId: extra.campaignId ?? null,
      adSetId: extra.adSetId ?? null,
      creativeId: extra.creativeId ?? null,
      adId: extra.adId ?? null,
      draftId: extra.draftId,
    };
  }

  private formatLaunchApiFailure(
    label: string,
    payload: Record<string, unknown>,
    result: MetaGraphResult<unknown> & { attempts?: number },
    launchStep: MetaLaunchStep,
    tracer: MetaLaunchStepTracer,
    contextIds: Record<string, string | null>,
    metaForm?: Record<string, string> | null,
    userMessage?: string | null,
  ) {
    return formatMetaApiFailure(label, payload, result, launchStep, {
      metaForm: metaForm ?? null,
      attempts: result.attempts,
      contextIds,
      launchDebug: tracer.getTrace(),
      userMessage,
    });
  }

  private async persistLaunchState(
    draftId: string,
    data: {
      metaCampaignId?: string;
      metaAdSetId?: string;
      metaProductSetId?: string | null;
      metaCreativeId?: string | null;
      metaAdId?: string | null;
      status?: string;
      errorMessage?: string;
      metaLaunchSteps?: MetaLaunchSteps;
      metaLaunchPayloads?: MetaLaunchPayloadSnapshot;
      metaLaunchDebug?: MetaLaunchDebugTrace;
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
          ...(data.metaAdId !== undefined ? { metaAdId: data.metaAdId } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
          ...(data.metaLaunchSteps
            ? { metaLaunchSteps: data.metaLaunchSteps as Prisma.InputJsonValue }
            : {}),
          ...(data.metaLaunchPayloads
            ? { metaLaunchPayloads: data.metaLaunchPayloads as Prisma.InputJsonValue }
            : {}),
          ...(data.metaLaunchDebug
            ? { metaLaunchDebug: data.metaLaunchDebug as Prisma.InputJsonValue }
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
      locationTargetingMode: this.resolveLocationTargetingMode(dto.locationTargetingMode),
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
    locationTargetingMode?: string | null;
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
    metaLaunchPayloads?: unknown;
    metaLaunchDebug?: unknown;
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
      status: this.deriveLaunchDisplayStatus(row),
      creativeType: row.creativeType ?? 'catalog_products',
      targetingMode: row.targetingMode ?? 'map',
      locationTargetingMode: row.locationTargetingMode ?? 'city',
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
      metaLaunchPayloads:
        row.metaLaunchPayloads && typeof row.metaLaunchPayloads === 'object'
          ? (row.metaLaunchPayloads as MetaLaunchPayloadSnapshot)
          : null,
      metaLaunchDebug:
        row.metaLaunchDebug && typeof row.metaLaunchDebug === 'object'
          ? (row.metaLaunchDebug as MetaLaunchDebugTrace)
          : null,
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
