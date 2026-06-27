import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TrackPageviewDto } from './dto/track-pageview.dto';
import {
  anonymizeIp,
  extractClientIp,
  parseUserAgent,
  resolveGeoFromIp,
} from './analytics-ua.util';

type RequestMeta = {
  userAgent?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class PortalAnalyticsTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSettings() {
    return this.prisma.analyticsSettings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }

  async recordPageview(dto: TrackPageviewDto, meta: RequestMeta) {
    const settings = await this.getSettings();
    if (!settings.trackingEnabled) return { ok: true, skipped: true };

    if (dto.userId && settings.excludeStaff) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { role: true },
      });
      if (user && (user.role === UserRole.ADMIN || user.role === UserRole.PORTAL_WORKER)) {
        return { ok: true, skipped: true, reason: 'staff_excluded' };
      }
    }

    const ua = meta.userAgent ?? '';
    const parsed = parseUserAgent(ua);
    const rawIp = extractClientIp(meta.headers ?? {});
    const headerCountry =
      (meta.headers?.['cf-ipcountry'] as string | undefined) ??
      (meta.headers?.['x-vercel-ip-country'] as string | undefined);
    const geo = await resolveGeoFromIp(rawIp, headerCountry);
    const ip = settings.anonymizeIp ? anonymizeIp(rawIp) : rawIp;

    const now = new Date();
    let session = await this.prisma.analyticsSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) {
      session = await this.prisma.analyticsSession.create({
        data: {
          id: dto.sessionId,
          visitorId: dto.visitorId,
          userId: dto.userId ?? null,
          ip: ip || null,
          userAgent: ua.slice(0, 2000),
          deviceType: parsed.deviceType,
          browser: parsed.browser,
          os: parsed.os,
          language: dto.language?.slice(0, 16) ?? '',
          country: geo.country,
          city: geo.city,
          referrer: (dto.referrer ?? '').slice(0, 2000),
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          pageViewCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
    } else {
      session = await this.prisma.analyticsSession.update({
        where: { id: dto.sessionId },
        data: {
          lastSeenAt: now,
          pageViewCount: { increment: 1 },
          ...(dto.userId ? { userId: dto.userId } : {}),
          ...(geo.country && !session.country ? { country: geo.country } : {}),
          ...(geo.city && !session.city ? { city: geo.city } : {}),
        },
      });
    }

    await this.prisma.analyticsPageView.create({
      data: {
        sessionId: dto.sessionId,
        userId: dto.userId ?? null,
        url: dto.url.slice(0, 2000),
        path: dto.path.slice(0, 512),
        title: (dto.title ?? '').slice(0, 512),
        referrer: (dto.referrer ?? '').slice(0, 2000),
        previousPath: dto.previousPath?.slice(0, 512) ?? null,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
      },
    });

    return { ok: true, sessionId: session.id };
  }
}
