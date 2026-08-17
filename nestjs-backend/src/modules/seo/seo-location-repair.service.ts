import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildProgrammaticSeoPath } from './programmatic-seo.util';
import { SeoLocationDisplayService } from './seo-location-display.service';
import { pageNeedsLocationRepair } from './seo-location-resolver.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';

@Injectable()
export class SeoLocationRepairService {
  private readonly log = new Logger(SeoLocationRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationDisplay: SeoLocationDisplayService,
  ) {}

  async listNumericLocationPages(limit = 100) {
    const pages = await this.prisma.seoPageContent.findMany({
      where: { locationId: { not: null } },
      include: { location: true },
      take: Math.min(500, limit * 3),
      orderBy: { updatedAt: 'desc' },
    });
    return pages
      .filter((p) =>
        pageNeedsLocationRepair({
          locationName: p.location?.name,
          h1: p.h1,
          title: p.title,
          slug: p.location?.slug,
        }),
      )
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        pageKey: p.pageKey,
        intentSlug: p.intentSlug,
        h1: p.h1,
        title: p.title,
        locationId: p.locationId,
        locationName: p.location?.name,
        locationSlug: p.location?.slug,
        officialCode: p.location?.officialCode,
        status: p.status,
        repairStatus: 'NEEDS_LOCATION_REPAIR',
      }));
  }

  async repairNumericLocationPages(opts?: { limit?: number; dryRun?: boolean }) {
    const limit = opts?.limit ?? 50;
    const candidates = await this.listNumericLocationPages(limit);
    const results: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      if (!candidate.locationId || !candidate.intentSlug) continue;
      const result = await this.repairPage(candidate.id, opts?.dryRun ?? false);
      results.push(result);
    }

    return {
      scanned: candidates.length,
      repaired: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      dryRun: Boolean(opts?.dryRun),
      results,
    };
  }

  async repairPage(pageId: string, dryRun = false) {
    const page = await this.prisma.seoPageContent.findUnique({
      where: { id: pageId },
      include: { location: true },
    });
    if (!page?.locationId || !page.intentSlug || !page.location) {
      return { ok: false, pageId, error: 'PAGE_OR_LOCATION_MISSING' };
    }

    const location = page.location;

    const slugFix = await this.locationDisplay.ensureLocationSlugResolved(page.locationId);
    if (!slugFix) {
      return { ok: false, pageId, error: 'LOCATION_NOT_FOUND' };
    }

    const resolved = slugFix.resolved;
    if (resolved.status === 'LOCATION_UNRESOLVED') {
      if (!dryRun) {
        await this.prisma.seoPageContent.update({
          where: { id: page.id },
          data: {
            noindex: true,
            robots: 'noindex,follow',
            indexable: false,
            indexabilityReason: 'LOCATION_UNRESOLVED',
          },
        });
      }
      return {
        ok: false,
        pageId,
        error: 'LOCATION_UNRESOLVED',
        officialCode: resolved.officialCode,
      };
    }

    const newPageKey = buildProgrammaticSeoPageKey(page.intentSlug, resolved.slug);
    const newPath = buildProgrammaticSeoPath(page.intentSlug, resolved.slug);
    const oldPath = buildProgrammaticSeoPath(page.intentSlug, location.slug);
    const canonical = `https://www.xxrealit.cz${newPath}`;

    const intentLabel = page.intentSlug.replace(/-/g, ' ');
    const h1 = page.h1?.replace(location.name, resolved.name) ?? `${intentLabel} ${resolved.name}`;
    const title =
      page.title?.replace(location.name, resolved.name) ??
      `${h1} | XXREALIT`;
    const description = page.description?.replace(location.name, resolved.name) ?? page.description;

    if (dryRun) {
      return {
        ok: true,
        pageId,
        dryRun: true,
        resolvedName: resolved.name,
        oldSlug: location.slug,
        newSlug: resolved.slug,
        oldPath,
        newPath,
      };
    }

    if (slugFix.slugChanged && slugFix.oldSlug) {
      const fromPath = buildProgrammaticSeoPath(page.intentSlug, slugFix.oldSlug);
      await this.prisma.seoRedirect.upsert({
        where: { fromPath },
        create: {
          fromPath,
          toPath: newPath,
          statusCode: 301,
          reason: 'LOCATION_SLUG_REPAIR',
          locationId: page.locationId,
        },
        update: { toPath: newPath, reason: 'LOCATION_SLUG_REPAIR' },
      });
    }

    if (oldPath !== newPath && location.slug !== resolved.slug) {
      await this.prisma.seoRedirect.upsert({
        where: { fromPath: oldPath },
        create: {
          fromPath: oldPath,
          toPath: newPath,
          statusCode: 301,
          reason: 'SEO_PAGE_SLUG_REPAIR',
          locationId: page.locationId,
        },
        update: { toPath: newPath },
      });
    }

    await this.prisma.seoPageContent.update({
      where: { id: page.id },
      data: {
        pageKey: newPageKey,
        h1,
        title,
        description,
        canonical,
        noindex: false,
        robots: 'index,follow',
        indexabilityReason: null,
        bodyText: page.bodyText?.replaceAll(location.name, resolved.name) ?? page.bodyText,
      },
    });

    this.log.log(`Repaired SEO page ${page.id}: ${location.name} → ${resolved.name}`);

    return {
      ok: true,
      pageId,
      resolvedName: resolved.name,
      officialCode: resolved.officialCode,
      oldSlug: location.slug,
      newSlug: resolved.slug,
      canonical,
    };
  }
}
