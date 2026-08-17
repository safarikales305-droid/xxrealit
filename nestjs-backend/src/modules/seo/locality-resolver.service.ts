import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildSeoLocationSlug, foldSeoAscii } from './seo-location.util';
import { SeoAiHttpException } from './seo-ai.errors';
import { SeoLocationDisplayService } from './seo-location-display.service';
import { buildResolvedSeoLocation } from './seo-location-resolver.util';

export type ResolvedLocality = {
  id: string;
  name: string;
  slug: string;
  slugAscii: string;
  regionName: string | null;
  districtName: string | null;
  regionId: string | null;
  districtId: string | null;
};

export type LocalitySearchHit = {
  id: string;
  name: string;
  slug: string;
  district: string | null;
  region: string | null;
  kind: string;
};

@Injectable()
export class LocalityResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationDisplay: SeoLocationDisplayService,
  ) {}

  private normalizeSlug(value: string): string {
    return foldSeoAscii(value.trim());
  }

  async search(query: string, limit = 20): Promise<LocalitySearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const slugQ = this.normalizeSlug(q);
    const rows = await this.prisma.seoLocation.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: slugQ, mode: 'insensitive' } },
          { slugAscii: { contains: slugQ, mode: 'insensitive' } },
          { searchTerms: { has: q } },
        ],
      },
      take: Math.min(50, limit),
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      include: {
        region: { select: { name: true } },
        district: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      district: r.district?.name ?? null,
      region: r.region?.name ?? null,
      kind: r.kind,
    }));
  }

  async resolve(input: {
    localityId?: string;
    localitySlug?: string;
    locationSlug?: string;
    region?: string;
    district?: string;
    name?: string;
    createIfMissing?: boolean;
  }): Promise<ResolvedLocality> {
    const slugRaw = (input.localitySlug ?? input.locationSlug ?? input.name ?? '').trim();
    const slugNorm = slugRaw ? this.normalizeSlug(slugRaw) : '';

    if (input.localityId?.trim()) {
      const resolved = await this.locationDisplay.resolveSeoLocation(input.localityId.trim());
      if (resolved) {
        if (resolved.status === 'LOCATION_UNRESOLVED') {
          throw new SeoAiHttpException(
            'LOCATION_UNRESOLVED',
            `Lokalitu ${resolved.officialCode} se nepodařilo převést na veřejný název.`,
            HttpStatus.BAD_REQUEST,
            { officialCode: resolved.officialCode },
          );
        }
        return {
          id: resolved.locationId,
          name: resolved.name,
          slug: resolved.slug,
          slugAscii: resolved.slugAscii,
          regionName: resolved.regionName,
          districtName: resolved.districtName,
          regionId: null,
          districtId: null,
        };
      }
      const byId = await this.prisma.seoLocation.findFirst({
        where: { id: input.localityId.trim(), isActive: true },
        include: {
          region: { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
        },
      });
      if (byId) return this.toResolved(byId);
      throw new SeoAiHttpException(
        'LOCALITY_NOT_FOUND',
        `Lokalita s ID ${input.localityId} nebyla nalezena.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!slugNorm) {
      throw new SeoAiHttpException(
        'LOCALITY_NOT_FOUND',
        'Zadejte lokalitu nebo vyberte z návrhů.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const candidates = await this.prisma.seoLocation.findMany({
      where: {
        isActive: true,
        OR: [
          { slug: slugNorm },
          { slugAscii: slugNorm },
          { slug: slugRaw.toLowerCase() },
          { name: { equals: slugRaw, mode: 'insensitive' } },
        ],
      },
      include: {
        region: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
      },
      take: 25,
    });

    let filtered = candidates;
    if (input.region?.trim()) {
      const regionFold = foldSeoAscii(input.region);
      filtered = filtered.filter(
        (c) => c.region?.name && foldSeoAscii(c.region.name).includes(regionFold),
      );
    }
    if (input.district?.trim()) {
      const districtFold = foldSeoAscii(input.district);
      filtered = filtered.filter(
        (c) => c.district?.name && foldSeoAscii(c.district.name).includes(districtFold),
      );
    }

    if (filtered.length === 1) return this.toResolved(filtered[0]!);
    if (filtered.length > 1) {
      throw new SeoAiHttpException(
        'LOCALITY_AMBIGUOUS',
        'Bylo nalezeno více lokalit se stejným názvem. Vyberte konkrétní záznam.',
        HttpStatus.CONFLICT,
        {
          options: filtered.slice(0, 10).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            district: c.district?.name ?? null,
            region: c.region?.name ?? null,
          })),
        },
      );
    }

    if (candidates.length === 1) return this.toResolved(candidates[0]!);
    if (candidates.length > 1) {
      throw new SeoAiHttpException(
        'LOCALITY_AMBIGUOUS',
        'Bylo nalezeno více lokalit. Upřesněte kraj nebo okres.',
        HttpStatus.CONFLICT,
        {
          options: candidates.slice(0, 10).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            district: c.district?.name ?? null,
            region: c.region?.name ?? null,
          })),
        },
      );
    }

    if (input.createIfMissing && slugRaw) {
      const created = await this.createDraftLocality({
        name: this.titleCase(slugRaw.replace(/-/g, ' ')),
        slug: slugNorm,
        region: input.region,
        district: input.district,
      });
      return created;
    }

    throw new SeoAiHttpException(
      'LOCALITY_NOT_FOUND',
      `Lokalita „${slugRaw}“ nebyla nalezena v databázi. Vyhledejte a vyberte lokalitu ze seznamu.`,
      HttpStatus.BAD_REQUEST,
      { slug: slugNorm },
    );
  }

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async createDraftLocality(input: {
    name: string;
    slug: string;
    region?: string;
    district?: string;
  }): Promise<ResolvedLocality> {
    const officialCode = `draft-${input.slug}-${Date.now()}`;
    const row = await this.prisma.seoLocation.create({
      data: {
        officialCode,
        name: input.name,
        slug: input.slug,
        slugAscii: input.slug,
        kind: 'MESTO',
        isActive: true,
        seoEnabled: true,
        searchTerms: [input.name, input.slug],
        locative: input.name,
      },
      include: {
        region: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
      },
    });
    return this.toResolved(row);
  }

  private toResolved(
    row: Prisma.SeoLocationGetPayload<{
      include: {
        region: { select: { id: true; name: true } };
        district: { select: { id: true; name: true } };
      };
    }>,
  ): ResolvedLocality {
    const resolved = buildResolvedSeoLocation({
      id: row.id,
      officialCode: row.officialCode,
      name: row.name,
      slug: row.slug,
      slugAscii: row.slugAscii,
      locative: row.locative,
      kind: row.kind,
      psc: row.psc,
      searchTerms: row.searchTerms,
      parent: null,
      district: row.district,
      region: row.region,
    });
    return {
      id: resolved.locationId,
      name: resolved.name,
      slug: resolved.slug,
      slugAscii: resolved.slugAscii,
      regionName: resolved.regionName,
      districtName: resolved.districtName,
      regionId: row.regionId,
      districtId: row.districtId,
    };
  }
}
