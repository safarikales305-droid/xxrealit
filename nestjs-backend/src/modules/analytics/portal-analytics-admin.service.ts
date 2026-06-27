import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ANALYTICS_ONLINE_MS } from './analytics-ua.util';
import type { UpdateAnalyticsSettingsDto } from './dto/track-pageview.dto';

type PeriodRange = { from: Date; to: Date };

@Injectable()
export class PortalAnalyticsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private onlineSince() {
    return new Date(Date.now() - ANALYTICS_ONLINE_MS);
  }

  private todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private resolvePeriod(period?: string, fromStr?: string, toStr?: string): PeriodRange {
    const now = new Date();
    if (fromStr && toStr) {
      return { from: new Date(fromStr), to: new Date(toStr) };
    }
    switch (period) {
      case 'yesterday': {
        const from = new Date();
        from.setDate(from.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setHours(23, 59, 59, 999);
        return { from, to };
      }
      case '7d':
        return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
      case '30d':
        return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
      case 'today':
      default:
        return { from: this.todayStart(), to: now };
    }
  }

  async getSettings() {
    return this.prisma.analyticsSettings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }

  async updateSettings(dto: UpdateAnalyticsSettingsDto) {
    return this.prisma.analyticsSettings.upsert({
      where: { id: 'default' },
      create: {
        anonymizeIp: dto.anonymizeIp ?? false,
        excludeStaff: dto.excludeStaff ?? true,
        trackingEnabled: dto.trackingEnabled ?? true,
      },
      update: {
        ...(dto.anonymizeIp !== undefined ? { anonymizeIp: dto.anonymizeIp } : {}),
        ...(dto.excludeStaff !== undefined ? { excludeStaff: dto.excludeStaff } : {}),
        ...(dto.trackingEnabled !== undefined ? { trackingEnabled: dto.trackingEnabled } : {}),
      },
    });
  }

  async getRealtime() {
    const onlineSince = this.onlineSince();
    const todayStart = this.todayStart();

    const [onlineSessions, todaySessions, todayPageViews, recentPageViews] = await Promise.all([
      this.prisma.analyticsSession.findMany({
        where: { lastSeenAt: { gte: onlineSince } },
        orderBy: { lastSeenAt: 'desc' },
        take: 200,
        include: {
          user: { select: { id: true, name: true, email: true } },
          pageViews: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.analyticsSession.count({ where: { firstSeenAt: { gte: todayStart } } }),
      this.prisma.analyticsPageView.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.analyticsPageView.findMany({
        where: { createdAt: { gte: onlineSince } },
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          session: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
    ]);

    const loggedInOnline = onlineSessions.filter((s) => s.userId).length;

    return {
      cards: {
        onlineTotal: onlineSessions.length,
        onlineLoggedIn: loggedInOnline,
        onlineAnonymous: onlineSessions.length - loggedInOnline,
        activeSessions5m: onlineSessions.length,
        visitsToday: todaySessions,
        pageViewsToday: todayPageViews,
      },
      liveRows: recentPageViews.map((pv) => ({
        id: pv.id,
        sessionId: pv.sessionId,
        at: pv.createdAt.toISOString(),
        userId: pv.session.userId,
        userName: pv.session.user?.name ?? null,
        userEmail: pv.session.user?.email ?? null,
        visitorId: pv.session.visitorId,
        path: pv.path,
        title: pv.title,
        url: pv.url,
        referrer: pv.referrer || pv.session.referrer,
        previousPath: pv.previousPath,
        deviceType: pv.session.deviceType,
        browser: pv.session.browser,
        os: pv.session.os,
        ip: pv.session.ip,
        country: pv.session.country,
        city: pv.session.city,
        language: pv.session.language,
      })),
      onlineSessions: onlineSessions.map((s) => this.serializeSessionBrief(s)),
    };
  }

  private serializeSessionBrief(s: {
    id: string;
    visitorId: string;
    userId: string | null;
    ip: string | null;
    deviceType: string;
    browser: string;
    os: string;
    country: string;
    city: string;
    language: string;
    referrer: string;
    pageViewCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    user?: { id: string; name: string; email: string } | null;
    pageViews?: Array<{ path: string; title: string; url: string }>;
  }) {
    const latest = s.pageViews?.[0];
    return {
      id: s.id,
      visitorId: s.visitorId,
      userId: s.userId,
      userName: s.user?.name ?? null,
      userEmail: s.user?.email ?? null,
      ip: s.ip,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      country: s.country,
      city: s.city,
      language: s.language,
      referrer: s.referrer,
      pageViewCount: s.pageViewCount,
      firstSeenAt: s.firstSeenAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      currentPath: latest?.path ?? null,
      currentTitle: latest?.title ?? null,
      currentUrl: latest?.url ?? null,
      isOnline: s.lastSeenAt.getTime() >= Date.now() - ANALYTICS_ONLINE_MS,
    };
  }

  async getSessionDetail(sessionId: string) {
    const session = await this.prisma.analyticsSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        pageViews: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Relace nenalezena.');

    return {
      ...this.serializeSessionBrief(session),
      utmSource: session.utmSource,
      utmMedium: session.utmMedium,
      utmCampaign: session.utmCampaign,
      userAgent: session.userAgent,
      durationSeconds: Math.round(
        (session.lastSeenAt.getTime() - session.firstSeenAt.getTime()) / 1000,
      ),
      pageViews: session.pageViews.map((p) => ({
        id: p.id,
        path: p.path,
        title: p.title,
        url: p.url,
        referrer: p.referrer,
        previousPath: p.previousPath,
        utmSource: p.utmSource,
        utmMedium: p.utmMedium,
        utmCampaign: p.utmCampaign,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async getSummary(query: { period?: string; from?: string; to?: string }) {
    const { from, to } = this.resolvePeriod(query.period, query.from, query.to);
    const onlineSince = this.onlineSince();

    const [sessions, pageViews, onlineCount, returningVisitors, allVisitors] = await Promise.all([
      this.prisma.analyticsSession.count({ where: { firstSeenAt: { gte: from, lte: to } } }),
      this.prisma.analyticsPageView.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.analyticsSession.count({ where: { lastSeenAt: { gte: onlineSince } } }),
      this.prisma.analyticsSession.groupBy({
        by: ['visitorId'],
        where: { firstSeenAt: { gte: from, lte: to }, pageViewCount: { gt: 1 } },
      }),
      this.prisma.analyticsSession.groupBy({
        by: ['visitorId'],
        where: { firstSeenAt: { gte: from, lte: to } },
      }),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      sessions,
      pageViews,
      onlineNow: onlineCount,
      uniqueVisitors: allVisitors.length,
      returningVisitors: returningVisitors.length,
      newVisitors: Math.max(0, allVisitors.length - returningVisitors.length),
      charts: await this.buildCharts(from, to),
    };
  }

  private async buildCharts(from: Date, to: Date) {
    const hours: { hour: string; sessions: number; pageViews: number }[] = [];
    const hourMs = 60 * 60 * 1000;
    const start = new Date(Math.max(from.getTime(), to.getTime() - 24 * hourMs));
    for (let t = start.getTime(); t <= to.getTime(); t += hourMs) {
      const hStart = new Date(t);
      const hEnd = new Date(t + hourMs);
      const [sessions, pageViews] = await Promise.all([
        this.prisma.analyticsSession.count({ where: { firstSeenAt: { gte: hStart, lt: hEnd } } }),
        this.prisma.analyticsPageView.count({ where: { createdAt: { gte: hStart, lt: hEnd } } }),
      ]);
      hours.push({ hour: hStart.toISOString(), sessions, pageViews });
    }

    const [topPages, topReferrers, byCountry, byCity, byDevice] = await Promise.all([
      this.prisma.analyticsPageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 15,
      }),
      this.prisma.analyticsSession.groupBy({
        by: ['referrer'],
        where: { firstSeenAt: { gte: from, lte: to }, referrer: { not: '' } },
        _count: { referrer: true },
        orderBy: { _count: { referrer: 'desc' } },
        take: 15,
      }),
      this.prisma.analyticsSession.groupBy({
        by: ['country'],
        where: { firstSeenAt: { gte: from, lte: to }, country: { not: '' } },
        _count: { country: true },
        orderBy: { _count: { country: 'desc' } },
        take: 20,
      }),
      this.prisma.analyticsSession.groupBy({
        by: ['city', 'country'],
        where: { firstSeenAt: { gte: from, lte: to }, city: { not: '' } },
        _count: { city: true },
        orderBy: { _count: { city: 'desc' } },
        take: 20,
      }),
      this.prisma.analyticsSession.groupBy({
        by: ['deviceType'],
        where: { firstSeenAt: { gte: from, lte: to } },
        _count: { deviceType: true },
      }),
    ]);

    const onlineByMinute: { minute: string; count: number }[] = [];
    const minuteMs = 60 * 1000;
    const onlineWindow = Math.min(to.getTime() - from.getTime(), 60 * minuteMs);
    const onlineStart = to.getTime() - onlineWindow;
    for (let t = onlineStart; t <= to.getTime(); t += minuteMs) {
      const mEnd = new Date(t);
      const mStart = new Date(t - ANALYTICS_ONLINE_MS);
      const count = await this.prisma.analyticsSession.count({
        where: { lastSeenAt: { gte: mStart, lte: mEnd } },
      });
      onlineByMinute.push({ minute: mEnd.toISOString(), count });
    }

    return {
      visitsByHour: hours,
      onlineByMinute,
      topPages: topPages.map((r) => ({ path: r.path, count: r._count.path })),
      topReferrers: topReferrers.map((r) => ({
        referrer: r.referrer || '(přímý)',
        count: r._count.referrer,
      })),
      byCountry: byCountry.map((r) => ({ country: r.country, count: r._count.country })),
      byCity: byCity.map((r) => ({
        city: r.city,
        country: r.country,
        count: r._count.city,
      })),
      byDevice: byDevice.map((r) => ({ device: r.deviceType, count: r._count.deviceType })),
    };
  }

  async getSessions(query: {
    period?: string;
    from?: string;
    to?: string;
    path?: string;
    country?: string;
    city?: string;
    referrer?: string;
    loggedIn?: string;
    deviceType?: string;
    limit?: string;
  }) {
    const { from, to } = this.resolvePeriod(query.period, query.from, query.to);
    const take = Math.min(500, Math.max(1, Number(query.limit) || 100));

    const where: Prisma.AnalyticsSessionWhereInput = {
      firstSeenAt: { gte: from, lte: to },
      ...(query.country ? { country: query.country } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.referrer ? { referrer: { contains: query.referrer, mode: 'insensitive' } } : {}),
      ...(query.deviceType ? { deviceType: query.deviceType } : {}),
      ...(query.loggedIn === 'yes' ? { userId: { not: null } } : {}),
      ...(query.loggedIn === 'no' ? { userId: null } : {}),
    };

    if (query.path) {
      const sessionIds = (
        await this.prisma.analyticsPageView.findMany({
          where: {
            path: { contains: query.path, mode: 'insensitive' },
            createdAt: { gte: from, lte: to },
          },
          select: { sessionId: true },
          distinct: ['sessionId'],
          take: 500,
        })
      ).map((r) => r.sessionId);
      where.id = { in: sessionIds.length ? sessionIds : ['__none__'] };
    }

    const rows = await this.prisma.analyticsSession.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, name: true, email: true } },
        pageViews: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return { items: rows.map((s) => this.serializeSessionBrief(s)) };
  }

  async getVisitors(query: Parameters<PortalAnalyticsAdminService['getSessions']>[0]) {
    const { items } = await this.getSessions({ ...query, limit: '500' });
    const map = new Map<string, {
      visitorId: string;
      userId: string | null;
      userName: string | null;
      sessions: number;
      pageViews: number;
      lastSeenAt: string;
      country: string;
      city: string;
    }>();

    for (const s of items) {
      const prev = map.get(s.visitorId);
      if (!prev) {
        map.set(s.visitorId, {
          visitorId: s.visitorId,
          userId: s.userId,
          userName: s.userName,
          sessions: 1,
          pageViews: s.pageViewCount,
          lastSeenAt: s.lastSeenAt,
          country: s.country,
          city: s.city,
        });
      } else {
        prev.sessions += 1;
        prev.pageViews += s.pageViewCount;
        if (s.lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = s.lastSeenAt;
      }
    }

    return { items: [...map.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)) };
  }

  async getLocations(query: { period?: string; from?: string; to?: string }) {
    const { from, to } = this.resolvePeriod(query.period, query.from, query.to);
    const grouped = await this.prisma.analyticsSession.groupBy({
      by: ['country', 'city'],
      where: { firstSeenAt: { gte: from, lte: to } },
      _count: { id: true },
      _max: { lastSeenAt: true },
      _sum: { pageViewCount: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    });

    return {
      items: grouped.map((g) => ({
        country: g.country || '—',
        city: g.city || '—',
        visitors: g._count.id,
        pageViews: g._sum.pageViewCount ?? 0,
        lastActivity: g._max.lastSeenAt?.toISOString() ?? null,
      })),
    };
  }
}
