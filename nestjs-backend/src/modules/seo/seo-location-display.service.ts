import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildResolvedSeoLocation,
  isInvalidPublicLocationName,
  isNumericLocationSlug,
  type ResolvedSeoLocation,
} from './seo-location-resolver.util';
import type { CzGeoLocation } from './cz-geo-locations.data';
import { buildSeoLocationSlug, foldSeoAscii } from './seo-location.util';

const locationInclude = {
  parent: { select: { id: true, name: true, kind: true, slug: true } },
  district: { select: { id: true, name: true, slug: true } },
  region: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.SeoLocationInclude;

@Injectable()
export class SeoLocationDisplayService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSeoLocation(locationId: string): Promise<ResolvedSeoLocation | null> {
    const row = await this.prisma.seoLocation.findFirst({
      where: { id: locationId, isActive: true },
      include: locationInclude,
    });
    if (!row) return null;
    return buildResolvedSeoLocation(row);
  }

  async resolveSeoLocationBySlug(slug: string): Promise<ResolvedSeoLocation | null> {
    const row = await this.prisma.seoLocation.findFirst({
      where: {
        isActive: true,
        OR: [{ slug }, { slugAscii: slug }, { officialCode: slug }],
      },
      include: locationInclude,
    });
    if (!row) return null;
    return buildResolvedSeoLocation(row);
  }

  async resolveSeoLocationByOfficialCode(officialCode: string): Promise<ResolvedSeoLocation | null> {
    const row = await this.prisma.seoLocation.findFirst({
      where: { officialCode, isActive: true },
      include: locationInclude,
    });
    if (!row) return null;
    return buildResolvedSeoLocation(row);
  }

  toCzGeoLocation(resolved: ResolvedSeoLocation): CzGeoLocation {
    const kindMap: Record<string, CzGeoLocation['kind']> = {
      KRAJ: 'kraj',
      OKRES: 'okres',
      MESTO: 'mesto',
      MESTYS: 'obec',
      OBEC: 'obec',
      MESTSKA_CAST: 'mestska-cast',
      CAST_OBCE: 'cast-obce',
      KATASTR: 'lokalita',
      PSC: 'psc',
      LOKALITA: 'lokalita',
      ORP: 'orp',
    };
    return {
      slug: resolved.slug,
      name: resolved.name,
      locative: resolved.locative,
      kind: kindMap[resolved.kind] ?? 'obec',
      regionSlug: resolved.regionName ? foldSeoAscii(resolved.regionName) : undefined,
      districtSlug: resolved.districtName ? foldSeoAscii(resolved.districtName) : undefined,
      searchTerms: [resolved.name, resolved.municipalityName, resolved.cityPartName].filter(
        Boolean,
      ) as string[],
    };
  }

  async ensureLocationSlugResolved(locationId: string): Promise<{
    resolved: ResolvedSeoLocation;
    slugChanged: boolean;
    oldSlug: string | null;
    newSlug: string;
  } | null> {
    const row = await this.prisma.seoLocation.findUnique({
      where: { id: locationId },
      include: locationInclude,
    });
    if (!row) return null;

    const resolved = buildResolvedSeoLocation(row);
    const needsNameFix = isInvalidPublicLocationName(row.name) && resolved.status === 'READY';
    const needsSlugFix =
      resolved.status === 'READY' &&
      (isNumericLocationSlug(row.slug) || row.slug !== resolved.slug);

    if (!needsNameFix && !needsSlugFix) {
      return { resolved, slugChanged: false, oldSlug: row.slug, newSlug: row.slug };
    }

    const newSlug = buildSeoLocationSlug(resolved.name, row.officialCode);
    const updateData: Prisma.SeoLocationUpdateInput = {};
    if (needsNameFix) {
      updateData.name = resolved.name;
      updateData.locative = resolved.locative;
      if (!row.searchTerms.includes(resolved.name)) {
        updateData.searchTerms = { set: [...new Set([...row.searchTerms, resolved.name])] };
      }
    }
    if (needsSlugFix && !row.slugLocked) {
      updateData.slug = newSlug;
      updateData.slugAscii = foldSeoAscii(newSlug);
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.seoLocation.update({ where: { id: row.id }, data: updateData });
    }

    const refreshed = buildResolvedSeoLocation({
      ...row,
      name: (updateData.name as string | undefined) ?? row.name,
      slug: (updateData.slug as string | undefined) ?? row.slug,
      slugAscii: (updateData.slugAscii as string | undefined) ?? row.slugAscii,
      locative: (updateData.locative as string | undefined) ?? row.locative,
    });

    return {
      resolved: refreshed,
      slugChanged: Boolean(updateData.slug && updateData.slug !== row.slug),
      oldSlug: row.slug,
      newSlug: refreshed.slug,
    };
  }
}
