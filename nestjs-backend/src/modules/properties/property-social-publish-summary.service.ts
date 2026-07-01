import { Injectable } from '@nestjs/common';
import { SocialPublishStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { TikTokOAuthService } from '../social/tiktok/tiktok-oauth.service';
import { TikTokSettingsService } from '../social/tiktok/tiktok-settings.service';

export type PropertySocialNetworkStatus = {
  platform: 'facebook' | 'instagram' | 'youtube' | 'tiktok';
  label: string;
  enabled: boolean;
  configured: boolean;
  status: 'NOT_PUBLISHED' | 'PENDING' | 'PUBLISHED' | 'FAILED' | 'REPEAT_ACTIVE' | 'DISABLED';
  publishedUrl: string | null;
  lastError: string | null;
  lastAt: string | null;
};

export type PropertySocialPublishSummary = {
  autoPublishEnabled: boolean;
  publishedNetworks: string[];
  disabledMessage: string | null;
  networks: PropertySocialNetworkStatus[];
  logs: Array<{
    id: string;
    createdAt: string;
    platform: string;
    publishKind: string | null;
    status: string;
    publishedUrl: string | null;
    lastError: string | null;
    triggeredBy: string | null;
  }>;
};

const PLATFORM_LABELS: Record<PropertySocialNetworkStatus['platform'], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

@Injectable()
export class PropertySocialPublishSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socialSettings: SocialAutopostSettingsService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly tiktokSettings: TikTokSettingsService,
  ) {}

  async buildForProperty(propertyId: string): Promise<PropertySocialPublishSummary> {
    await this.tiktokSettings.reload();
    const settings = this.socialSettings.getSettings();
    const global = settings.global ?? {
      autoPublishNewListings: true,
      hidePublicPrice: true,
    };

    const [logs, queueRows, schedules, tiktokJobs, tiktokConn] = await Promise.all([
      this.prisma.socialPublishLog.findMany({
        where: { contentId: propertyId, contentType: { in: ['PROPERTY', 'SHORT'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { triggeredBy: { select: { name: true, email: true } } },
      }),
      this.prisma.socialPublishQueue.findMany({
        where: { contentId: propertyId, contentType: { in: ['PROPERTY', 'SHORT'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.socialPublishSchedule.findMany({
        where: { contentId: propertyId, enabled: true },
        take: 5,
      }),
      this.prisma.tikTokPublishJob.findMany({
        where: { listingId: propertyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.tiktokOAuth.getActiveConnection(),
    ]);

    const fb = settings.facebook;
    const autoPublishEnabled =
      global.autoPublishNewListings !== false && fb.enabled && fb.publishProperties;

    const networks: PropertySocialNetworkStatus[] = (
      ['facebook', 'instagram', 'youtube', 'tiktok'] as const
    ).map((platform) => {
      const platformSettings =
        platform === 'facebook' ? fb : settings[platform];
      const enabled = platformSettings.enabled === true;
      const configured =
        platform === 'facebook'
          ? Boolean(fb.pageId && (fb.pageAccessTokenEncrypted || fb.connectedViaOAuth))
          : platform === 'tiktok'
            ? Boolean(tiktokConn?.isActive)
            : false;

      const platformLogs = logs.filter((l) => l.platform.toLowerCase() === platform);
      const latest = platformLogs[0];
      const latestTiktokJob = platform === 'tiktok' ? tiktokJobs[0] : undefined;
      const pendingQueue = queueRows.find(
        (q) =>
          q.platform.toLowerCase() === platform &&
          (q.status === SocialPublishStatus.PENDING || q.status === SocialPublishStatus.PROCESSING),
      );
      const repeatActive = schedules.some((s) => s.platform.toLowerCase() === platform);

      let status: PropertySocialNetworkStatus['status'] = 'DISABLED';
      const tiktokEnabled =
        platform === 'tiktok' &&
        platformSettings.enabled &&
        this.tiktokSettings.getSettings().autoPublish;

      if (platform === 'tiktok') {
        if (!platformSettings.enabled) {
          status = 'DISABLED';
        } else if (!configured) {
          status = 'NOT_PUBLISHED';
        } else if (latestTiktokJob?.status === 'UPLOADED') {
          status = 'PUBLISHED';
        } else if (
          latestTiktokJob?.status === 'WAITING' ||
          latestTiktokJob?.status === 'UPLOADING'
        ) {
          status = 'PENDING';
        } else if (
          latestTiktokJob?.status === 'FAILED' ||
          latestTiktokJob?.status === 'NEEDS_REAUTH'
        ) {
          status = 'FAILED';
        } else if (tiktokEnabled) {
          status = 'NOT_PUBLISHED';
        } else {
          status = 'NOT_PUBLISHED';
        }
      } else if (!enabled || !global.autoPublishNewListings) {
        status = 'DISABLED';
      } else if (platform === 'facebook' && !fb.publishProperties) {
        status = 'DISABLED';
      } else if (repeatActive) {
        status = 'REPEAT_ACTIVE';
      } else if (pendingQueue) {
        status = 'PENDING';
      } else if (latest?.status === SocialPublishStatus.PUBLISHED) {
        status = 'PUBLISHED';
      } else if (latest?.status === SocialPublishStatus.FAILED) {
        status = 'FAILED';
      } else if (enabled && configured) {
        status = 'NOT_PUBLISHED';
      } else if (enabled && platform !== 'facebook') {
        status = 'DISABLED';
      } else {
        status = 'NOT_PUBLISHED';
      }

      return {
        platform,
        label: PLATFORM_LABELS[platform],
        enabled,
        configured,
        status,
        publishedUrl:
          platform === 'tiktok'
            ? (latestTiktokJob?.tiktokVideoUrl ?? null)
            : (latest?.publishedUrl ?? latest?.reelPublishedUrl ?? null),
        lastError:
          platform === 'tiktok'
            ? (latestTiktokJob?.errorMessage ?? null)
            : (latest?.lastError ?? null),
        lastAt:
          platform === 'tiktok'
            ? (latestTiktokJob?.publishedAt?.toISOString() ??
              latestTiktokJob?.createdAt?.toISOString() ??
              null)
            : (latest?.createdAt?.toISOString() ?? null),
      };
    });

    const publishedNetworks = networks
      .filter((n) => n.status === 'PUBLISHED' || n.status === 'REPEAT_ACTIVE' || n.status === 'PENDING')
      .filter((n) => n.enabled && (n.platform === 'facebook' ? fb.publishProperties : false))
      .map((n) => n.label);

    const disabledMessage =
      !autoPublishEnabled
        ? 'Publikování na sociální sítě je vypnuté.'
        : publishedNetworks.length === 0 && networks.every((n) => n.status === 'DISABLED' || n.status === 'NOT_PUBLISHED')
          ? null
          : null;

    return {
      autoPublishEnabled,
      publishedNetworks,
      disabledMessage,
      networks,
      logs: logs.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        platform: row.platform,
        publishKind: row.publishKind,
        status: row.status,
        publishedUrl: row.publishedUrl ?? row.reelPublishedUrl,
        lastError: row.lastError,
        triggeredBy: row.triggeredBy?.name || row.triggeredBy?.email || null,
      })),
    };
  }
}
