import { Injectable } from '@nestjs/common';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { getSiteOriginForOg } from '../../properties/property-og-media.util';
import { PrismaService } from '../../../database/prisma.service';
import { toAbsoluteMediaUrl } from '../autopost/social-publish-format.util';
import { TikTokConfigService } from './tiktok.config.service';
import { TIKTOK_ERROR_MESSAGES } from './tiktok.errors';

@Injectable()
export class TikTokVideoUrlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TikTokConfigService,
  ) {}

  buildPublicProxyUrl(listingId: string): string {
    const origin = this.config.getFrontendUrl() || getSiteOriginForOg();
    return `${origin.replace(/\/+$/, '')}/api/tiktok/video/${encodeURIComponent(listingId)}`;
  }

  async resolveSourceVideoUrl(listingId: string): Promise<string | null> {
    const property = await this.prisma.property.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        videoUrl: true,
        approved: true,
        deletedAt: true,
        isActive: true,
        isVisible: true,
        activeFrom: true,
        activeUntil: true,
      },
    });
    if (!property || !isPropertyPubliclyListed(property)) return null;
    const raw = property.videoUrl?.trim();
    if (!raw) return null;
    return toAbsoluteMediaUrl(raw);
  }

  async assertPublicVideoAvailable(listingId: string): Promise<{ proxyUrl: string; sourceUrl: string }> {
    const sourceUrl = await this.resolveSourceVideoUrl(listingId);
    if (!sourceUrl) {
      throw new Error(TIKTOK_ERROR_MESSAGES.VIDEO_NOT_PUBLIC);
    }
    const proxyUrl = this.buildPublicProxyUrl(listingId);
    if (!proxyUrl.includes('xxrealit.cz') && !proxyUrl.includes('localhost')) {
      // Still allow custom FRONTEND_URL in dev
    }
    return { proxyUrl, sourceUrl };
  }
}
