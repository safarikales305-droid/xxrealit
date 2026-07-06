import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import { META_LIVE_DIAGNOSTIC_EVENTS } from './meta-marketing-platform.constants';

const SETTINGS_ID = 'default';

export type MetaLiveEventStat = {
  eventType: string;
  label: string;
  countToday: number;
  lastAt: string | null;
  lastAgoLabel: string | null;
  status: 'ok' | 'warning' | 'inactive';
};

export type MetaLiveDiagnosticsPanel = {
  checkedAt: string;
  dataset: { connected: boolean; id: string | null; message: string };
  remarketingReady: boolean;
  capiReady: boolean;
  catalogReady: boolean;
  commerceReady: boolean;
  feedReady: boolean;
  lastSyncAt: string | null;
  events: MetaLiveEventStat[];
  futureFeatures: string[];
};

const EVENT_LABELS: Record<string, string> = {
  PageView: 'PageView',
  ViewContent: 'ViewContent',
  Lead: 'Lead',
  Contact: 'Contact',
  Search: 'Search',
  VideoPlay: 'VideoPlay',
  CompleteRegistration: 'CompleteRegistration',
  Favorite: 'AddToWishlist',
  PhoneReveal: 'PhoneReveal',
  MessageSeller: 'WhatsAppClick',
};

@Injectable()
export class MetaCenterLiveDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatAgo(ms: number): string {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `před ${sec} s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `před ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `před ${h} h`;
    const d = Math.floor(h / 24);
    return `před ${d} d`;
  }

  async buildLiveDiagnostics(): Promise<MetaLiveDiagnosticsPanel> {
    const checkedAt = new Date().toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = Date.now();

    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const datasetId = ids.datasetId ?? ids.pixelId;

    const [catalogSettings, lastSync, eventGroups, audienceCount] = await Promise.all([
      this.prisma.metaCatalogSetting.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.metaCatalogSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.metaCenterEventLog.groupBy({
        by: ['eventType'],
        where: { createdAt: { gte: todayStart } },
        _count: { _all: true },
      }),
      this.prisma.metaRemarketingAudience.count({ where: { status: { not: 'error' } } }).catch(
        () => 0,
      ),
    ]);

    const countMap = new Map(eventGroups.map((g) => [g.eventType, g._count._all]));

    const lastEvents = await Promise.all(
      META_LIVE_DIAGNOSTIC_EVENTS.map(async (eventType) => {
        const last = await this.prisma.metaCenterEventLog.findFirst({
          where: { eventType },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        return { eventType, last };
      }),
    );
    const lastMap = new Map(lastEvents.map((e) => [e.eventType, e.last?.createdAt ?? null]));

    const events: MetaLiveEventStat[] = META_LIVE_DIAGNOSTIC_EVENTS.map((eventType) => {
      const countToday = countMap.get(eventType) ?? 0;
      const lastAt = lastMap.get(eventType);
      const lastAgoLabel = lastAt ? this.formatAgo(now - lastAt.getTime()) : null;
      let status: MetaLiveEventStat['status'] = 'inactive';
      if (countToday > 0) status = 'ok';
      else if (lastAt && now - lastAt.getTime() < 7 * 24 * 3600 * 1000) status = 'warning';
      return {
        eventType,
        label: EVENT_LABELS[eventType] ?? eventType,
        countToday,
        lastAt: lastAt?.toISOString() ?? null,
        lastAgoLabel,
        status,
      };
    });

    const capiReady = Boolean(
      datasetId && (ids.capiToken || row?.marketingAccessTokenEncrypted || row?.conversionsApiToken),
    );

    return {
      checkedAt,
      dataset: {
        connected: Boolean(datasetId),
        id: datasetId,
        message: datasetId ? '✔ Připojen' : 'Dataset není nastaven',
      },
      remarketingReady: audienceCount > 0 || Boolean(row?.remarketingAudiences),
      capiReady,
      catalogReady: Boolean(ids.catalogId),
      commerceReady: Boolean(row?.commerceManagerId),
      feedReady: Boolean(catalogSettings?.enabled ?? row?.catalogFeedEnabled),
      lastSyncAt:
        lastSync?.finishedAt?.toISOString() ??
        catalogSettings?.lastSyncAt?.toISOString() ??
        row?.lastAutoSyncAt?.toISOString() ??
        null,
      events,
      futureFeatures: [
        'lookalike_audience',
        'advantage_plus',
        'dynamic_ads',
        'carousel',
        'video_ads',
        'reels_ads',
        'instagram_ads',
        'facebook_feed_ads',
        'marketplace_ads',
        'messenger_ads',
        'whatsapp_ads',
        'ai_budget_optimization',
      ],
    };
  }
}
