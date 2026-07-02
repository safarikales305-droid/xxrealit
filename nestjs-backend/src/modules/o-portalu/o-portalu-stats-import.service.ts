import { Injectable, Logger } from '@nestjs/common';
import { PublicPortalStatValueSource } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GRAPH_API } from '../social/facebook/facebook-page.constants';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { DEFAULT_STAT_VALUE_SOURCES } from './o-portalu.defaults';
import { computeDisplayedValue, toPrismaJson } from './o-portalu-stat.util';

export type StatValueSourceLabel = 'manual' | 'database' | 'api';

export function prismaSourceToLabel(source: PublicPortalStatValueSource): StatValueSourceLabel {
  switch (source) {
    case PublicPortalStatValueSource.DATABASE:
      return 'database';
    case PublicPortalStatValueSource.API:
      return 'api';
    default:
      return 'manual';
  }
}

export function labelToPrismaSource(source: StatValueSourceLabel): PublicPortalStatValueSource {
  switch (source) {
    case 'database':
      return PublicPortalStatValueSource.DATABASE;
    case 'api':
      return PublicPortalStatValueSource.API;
    default:
      return PublicPortalStatValueSource.MANUAL;
  }
}

type GraphInsightValue = { value?: number | string };
type GraphInsight = { name?: string; values?: GraphInsightValue[] };
type GraphPost = {
  id?: string;
  permalink_url?: string;
  status_type?: string;
  attachments?: {
    data?: Array<{
      media_type?: string;
      target?: { id?: string };
    }>;
  };
  insights?: { data?: GraphInsight[] };
};

@Injectable()
export class OPortaluStatsImportService {
  private readonly log = new Logger(OPortaluStatsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autopostSettings: SocialAutopostSettingsService,
  ) {}

  async collectDatabaseStats(): Promise<{ ok: boolean; updated: string[]; errors: string[] }> {
    const values = await this.readDatabaseValues();
    const updated: string[] = [];
    const errors: string[] = [];

    for (const [key, realValue] of Object.entries(values)) {
      try {
        await this.applySuccessfulImport(key, 'database', realValue, { origin: 'database' });
        updated.push(key);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${key}: ${message}`);
        await this.logFailedImport(key, 'database', message);
      }
    }

    return { ok: errors.length === 0, updated, errors };
  }

  async collectFacebookStats(): Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }> {
    const pageId = this.autopostSettings.resolveFacebookPageId();
    const pageToken = this.autopostSettings.resolveFacebookPageAccessToken();
    if (!pageId || !pageToken) {
      const error = 'Facebook stránka není připojená v administraci sociálních sítí.';
      await this.logFailedImport('facebook_reach', 'facebook', error);
      return { ok: false, error };
    }

    try {
      const metrics = await this.fetchFacebookMetrics(pageId, pageToken);
      const totalReach = metrics.postReach + metrics.videoViews + metrics.reelViews;
      await this.applySuccessfulImport('facebook_reach', 'facebook', totalReach, metrics);
      await this.autopostSettings.touchTokenLastUsed();
      return { ok: true, detail: metrics };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.warn(`Facebook stats import failed: ${error}`);
      await this.logFailedImport('facebook_reach', 'facebook', error);
      return { ok: false, error };
    }
  }

  async collectInstagramStats(): Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }> {
    const pageId = this.autopostSettings.resolveFacebookPageId();
    const pageToken = this.autopostSettings.resolveFacebookPageAccessToken();
    if (!pageId || !pageToken) {
      const error = 'Instagram vyžaduje připojenou Facebook stránku s propojeným Instagram Business účtem.';
      await this.logFailedImport('instagram_reach', 'instagram', error);
      return { ok: false, error };
    }

    try {
      const igAccount = await this.fetchInstagramAccount(pageId, pageToken);
      if (!igAccount?.id) {
        const error = 'K Facebook stránce není připojený Instagram Business účet.';
        await this.logFailedImport('instagram_reach', 'instagram', error);
        return { ok: false, error };
      }

      const reach = await this.fetchInstagramReach(igAccount.id, pageToken);
      await this.applySuccessfulImport('instagram_reach', 'instagram', reach, {
        instagramAccountId: igAccount.id,
        username: igAccount.username,
        reach,
      });
      return { ok: true, detail: { instagramAccountId: igAccount.id, reach } };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.logFailedImport('instagram_reach', 'instagram', error);
      return { ok: false, error };
    }
  }

  async refreshStatFromSource(statKey: string): Promise<{ ok: boolean; error?: string }> {
    const stat = await this.prisma.publicPortalStat.findUnique({ where: { key: statKey } });
    if (!stat) return { ok: false, error: 'Statistika nenalezena.' };

    const source = prismaSourceToLabel(stat.valueSource);
    if (source === 'manual') {
      return { ok: false, error: 'Ruční statistiku nelze načíst z API.' };
    }
    if (source === 'database') {
      const values = await this.readDatabaseValues();
      const value = values[statKey];
      if (value == null) return { ok: false, error: 'Neznámý klíč databázové statistiky.' };
      await this.applySuccessfulImport(statKey, 'database', value, { origin: 'database' });
      return { ok: true };
    }

    if (statKey === 'facebook_reach') {
      const r = await this.collectFacebookStats();
      return { ok: r.ok, error: r.error };
    }
    if (statKey === 'instagram_reach') {
      const r = await this.collectInstagramStats();
      return { ok: r.ok, error: r.error };
    }
    return { ok: false, error: 'API zdroj pro tuto statistiku zatím není implementován.' };
  }

  async recalculateDisplayedValues(): Promise<{ updated: number }> {
    const stats = await this.prisma.publicPortalStat.findMany();
    let updated = 0;
    for (const stat of stats) {
      const displayedValue = computeDisplayedValue({
        realValue: stat.realValue,
        multiplier: stat.multiplier,
        manualValue: stat.manualValue,
      });
      if (displayedValue !== stat.displayedValue) {
        await this.prisma.publicPortalStat.update({
          where: { id: stat.id },
          data: { displayedValue },
        });
        updated += 1;
      }
    }
    return { updated };
  }

  private async readDatabaseValues(): Promise<Record<string, number>> {
    const [
      webVisits,
      listingViews,
      reelViews,
      registeredUsers,
      activeListings,
      contactLeads,
      listingUnlocks,
      tipUnlocks,
    ] = await Promise.all([
      this.prisma.analyticsPageView.count(),
      this.prisma.listingView.count({
        where: { source: { in: ['CLASSIC', 'DETAIL'] } },
      }),
      this.prisma.listingView.count({ where: { source: 'SHORTS' } }),
      this.prisma.user.count(),
      this.prisma.property.count({
        where: {
          deletedAt: null,
          approved: true,
          isActive: true,
          isVisible: true,
        },
      }),
      this.prisma.contactLead.count(),
      this.prisma.listingContactUnlock.count(),
      this.prisma.contactUnlock.count(),
    ]);

    return {
      web_visits: webVisits,
      listing_views: listingViews,
      reel_views: reelViews,
      registered_users: registeredUsers,
      active_listings: activeListings,
      leads_sent: contactLeads + listingUnlocks + tipUnlocks,
    };
  }

  private async fetchFacebookMetrics(pageId: string, pageToken: string) {
    let postReach = 0;
    let videoViews = 0;
    let reelViews = 0;
    let postEngagement = 0;
    let postsScanned = 0;

    const pageInsightsUrl =
      `${GRAPH_API}/${encodeURIComponent(pageId)}/insights?` +
      `metric=page_post_engagements&period=lifetime` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    const pageInsights = await this.graphGet(pageInsightsUrl);
    for (const row of (pageInsights.data as GraphInsight[] | undefined) ?? []) {
      if (row.name === 'page_post_engagements') postEngagement += this.insightTotal(row);
    }

    let nextUrl: string | null =
      `${GRAPH_API}/${encodeURIComponent(pageId)}/posts?` +
      `fields=id,permalink_url,status_type,attachments{media_type,target{id}},` +
      `insights.metric(post_impressions_unique,post_video_views,post_engaged_users)` +
      `&limit=50&access_token=${encodeURIComponent(pageToken)}`;

    const maxPages = 4;
    let page = 0;
    while (nextUrl && page < maxPages) {
      const payload = await this.graphGet(nextUrl);
      const items = (payload.data as GraphPost[] | undefined) ?? [];
      for (const item of items) {
        postsScanned += 1;
        const insights = item.insights?.data ?? [];
        const impressions = this.insightByName(insights, 'post_impressions_unique');
        const views = this.insightByName(insights, 'post_video_views');
        const engaged = this.insightByName(insights, 'post_engaged_users');
        postReach += impressions;
        postEngagement += engaged;

        const isReel = this.isReelPost(item);
        if (isReel) {
          reelViews += views;
        } else if (views > 0) {
          videoViews += views;
        }
      }
      nextUrl = (payload.paging as { next?: string } | undefined)?.next ?? null;
      page += 1;
    }

    const totalReach = postReach + videoViews + reelViews;
    return {
      postReach,
      videoViews,
      reelViews,
      postEngagement,
      postsScanned,
      totalReach,
    };
  }

  private isReelPost(item: GraphPost): boolean {
    const permalink = item.permalink_url?.toLowerCase() ?? '';
    if (permalink.includes('/reel/') || permalink.includes('/reels/')) return true;
    const mediaTypes = item.attachments?.data?.map((a) => a.media_type?.toLowerCase() ?? '') ?? [];
    return mediaTypes.some((t) => t.includes('reel'));
  }

  private async fetchInstagramAccount(pageId: string, pageToken: string) {
    const url =
      `${GRAPH_API}/${encodeURIComponent(pageId)}?` +
      `fields=instagram_business_account{id,username}` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    const payload = await this.graphGet(url);
    const account = payload.instagram_business_account as { id?: string; username?: string } | undefined;
    return account?.id ? account : null;
  }

  private async fetchInstagramReach(igAccountId: string, accessToken: string): Promise<number> {
    const url =
      `${GRAPH_API}/${encodeURIComponent(igAccountId)}/insights?` +
      `metric=reach,impressions,profile_views&period=lifetime` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    const payload = await this.graphGet(url);
    const rows = (payload.data as GraphInsight[] | undefined) ?? [];
    const reach = this.insightByName(rows, 'reach');
    const impressions = this.insightByName(rows, 'impressions');
    return reach > 0 ? reach : impressions;
  }

  private insightByName(rows: GraphInsight[], name: string): number {
    const row = rows.find((r) => r.name === name);
    return row ? this.insightTotal(row) : 0;
  }

  private insightTotal(row: GraphInsight): number {
    const values = row.values ?? [];
    let sum = 0;
    for (const v of values) {
      const n = typeof v.value === 'number' ? v.value : Number.parseFloat(String(v.value ?? '0'));
      if (Number.isFinite(n)) sum += n;
    }
    return Math.round(sum);
  }

  private async graphGet(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url);
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const graphError =
      payload.error && typeof payload.error === 'object'
        ? (payload.error as { message?: string }).message
        : null;
    if (!res.ok || graphError) {
      throw new Error(graphError ?? `Graph API HTTP ${res.status}`);
    }
    return payload;
  }

  private async applySuccessfulImport(
    statKey: string,
    source: string,
    realValue: number,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    const stat = await this.prisma.publicPortalStat.findUnique({ where: { key: statKey } });
    if (!stat) return;

    const displayedValue = computeDisplayedValue({
      realValue,
      multiplier: stat.multiplier,
      manualValue: stat.manualValue,
    });

    const valueSource =
      source === 'database'
        ? PublicPortalStatValueSource.DATABASE
        : source === 'facebook' || source === 'instagram'
          ? PublicPortalStatValueSource.API
          : stat.valueSource;

    await this.prisma.$transaction([
      this.prisma.publicPortalStatImportLog.create({
        data: {
          statKey,
          source,
          fetchedValue: realValue,
          ...(detail != null ? { detail: toPrismaJson(detail) } : {}),
        },
      }),
      this.prisma.publicPortalStat.update({
        where: { key: statKey },
        data: {
          realValue,
          displayedValue,
          valueSource,
          lastFetchedAt: new Date(),
          lastFetchError: null,
        },
      }),
    ]);

    this.log.log(`[o-portalu] Import ${statKey} from ${source}: ${realValue} → public ${displayedValue}`);
  }

  private async logFailedImport(statKey: string, source: string, error: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.publicPortalStatImportLog.create({
        data: { statKey, source, error },
      }),
      this.prisma.publicPortalStat.updateMany({
        where: { key: statKey },
        data: {
          lastFetchedAt: new Date(),
          lastFetchError: error,
        },
      }),
    ]);
  }

  async ensureStatValueSources(): Promise<void> {
    for (const [key, source] of Object.entries(DEFAULT_STAT_VALUE_SOURCES)) {
      await this.prisma.publicPortalStat.updateMany({
        where: { key, valueSource: PublicPortalStatValueSource.MANUAL },
        data: { valueSource: labelToPrismaSource(source) },
      });
    }
  }
}
