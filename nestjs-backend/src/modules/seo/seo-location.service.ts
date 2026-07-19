import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SeoLocationKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildSeoLocationSlug,
  normalizeSeoLocationKind,
  type SeoLocationImportRow,
} from './seo-location.util';

const BATCH_SIZE = 200;

@Injectable()
export class SeoLocationService {
  private readonly log = new Logger(SeoLocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const key = slug.trim().toLowerCase();
    return this.prisma.seoLocation.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: key }, { slugAscii: key }],
      },
    });
  }

  async findRelated(slug: string, limit = 8) {
    const loc = await this.findBySlug(slug);
    if (!loc?.regionId) return [];
    return this.prisma.seoLocation.findMany({
      where: {
        isActive: true,
        regionId: loc.regionId,
        NOT: { id: loc.id },
        kind: { in: ['MESTO', 'OBEC', 'MESTYS'] },
      },
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      take: limit,
      select: { slug: true, name: true },
    });
  }

  async listSlugsForSitemap(kind?: SeoLocationKind): Promise<string[]> {
    const rows = await this.prisma.seoLocation.findMany({
      where: { isActive: true, ...(kind ? { kind } : {}) },
      select: { slug: true },
      take: 100000,
    });
    return rows.map((r) => r.slug);
  }

  /**
   * Idempotentní import územních jednotek (ČSÚ / RÚIAN JSON).
   * Opakovaný import aktualizuje existující záznamy podle officialCode.
   */
  async importLocations(
    rows: SeoLocationImportRow[],
    source = 'api',
  ): Promise<{
    runId: string;
    inserted: number;
    updated: number;
    deactivated: number;
    errorCount: number;
    errors: string[];
  }> {
    const run = await this.prisma.seoLocationImportRun.create({
      data: { status: 'running', source, totalRows: rows.length },
    });

    const errors: string[] = [];
    let inserted = 0;
    let updated = 0;
    const seenCodes = new Set<string>();

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        for (const row of batch) {
          try {
            const code = row.officialCode?.trim();
            if (!code) {
              errors.push('Řádek bez officialCode');
              continue;
            }
            seenCodes.add(code);
            const slug = row.slug?.trim() || buildSeoLocationSlug(row.name, code);
            const slugAscii = row.slugAscii?.trim() || slug;
            const kind = normalizeSeoLocationKind(row.kind) as SeoLocationKind;
            const searchTerms = [
              row.name,
              row.locative ?? '',
              ...(row.searchTerms ?? []),
            ].filter(Boolean);

            const existing = await this.prisma.seoLocation.findUnique({
              where: { officialCode: code },
            });

            const data: Prisma.SeoLocationUncheckedCreateInput = {
              officialCode: code,
              name: row.name.trim(),
              slug,
              slugAscii,
              locative: row.locative?.trim() || row.name.trim(),
              kind,
              latitude: row.latitude ?? undefined,
              longitude: row.longitude ?? undefined,
              population: row.population ?? undefined,
              psc: row.psc?.trim() || undefined,
              cadastreCode: row.cadastreCode?.trim() || undefined,
              searchTerms: [...new Set(searchTerms)],
              isActive: row.isActive !== false,
              importedAt: new Date(),
            };

            if (existing) {
              await this.prisma.seoLocation.update({
                where: { id: existing.id },
                data: {
                  ...data,
                  slug: existing.slug === slug ? slug : await this.ensureUniqueSlug(slug, existing.id),
                },
              });
              updated += 1;
            } else {
              const uniqueSlug = await this.ensureUniqueSlug(slug);
              await this.prisma.seoLocation.create({
                data: { ...data, slug: uniqueSlug, slugAscii: uniqueSlug },
              });
              inserted += 1;
            }
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }

        await this.prisma.seoLocationImportRun.update({
          where: { id: run.id },
          data: {
            progressPct: Math.min(100, ((i + batch.length) / rows.length) * 100),
            inserted,
            updated,
            errorCount: errors.length,
          },
        });
      }

      // Resolve parent/region/district references in second pass
      await this.resolveHierarchyRefs(rows);

      // Deactivate locations missing from import (only if import has substantial size)
      let deactivated = 0;
      if (rows.length >= 100) {
        const result = await this.prisma.seoLocation.updateMany({
          where: {
            officialCode: { notIn: [...seenCodes] },
            isActive: true,
          },
          data: { isActive: false },
        });
        deactivated = result.count;
      }

      await this.prisma.seoLocationImportRun.update({
        where: { id: run.id },
        data: {
          status: errors.length ? 'completed_with_errors' : 'completed',
          inserted,
          updated,
          deactivated,
          errorCount: errors.length,
          errors: errors.slice(0, 100),
          progressPct: 100,
          finishedAt: new Date(),
        },
      });

      return { runId: run.id, inserted, updated, deactivated, errorCount: errors.length, errors };
    } catch (err) {
      await this.prisma.seoLocationImportRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorCount: errors.length + 1,
          errors: [...errors, err instanceof Error ? err.message : String(err)].slice(0, 100),
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async resolveHierarchyRefs(rows: SeoLocationImportRow[]): Promise<void> {
    const codeToId = new Map(
      (
        await this.prisma.seoLocation.findMany({
          select: { id: true, officialCode: true },
          take: 200000,
        })
      ).map((r) => [r.officialCode, r.id]),
    );

    for (const row of rows) {
      const id = codeToId.get(row.officialCode);
      if (!id) continue;
      const parentId = row.parentOfficialCode
        ? codeToId.get(row.parentOfficialCode) ?? null
        : null;
      const regionId = row.regionOfficialCode
        ? codeToId.get(row.regionOfficialCode) ?? null
        : null;
      const districtId = row.districtOfficialCode
        ? codeToId.get(row.districtOfficialCode) ?? null
        : null;
      await this.prisma.seoLocation.update({
        where: { id },
        data: { parentId, regionId, districtId },
      });
    }
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'lokalita';
    let n = 0;
    while (true) {
      const candidate = n === 0 ? slug : `${slug}-${n}`;
      const existing = await this.prisma.seoLocation.findFirst({
        where: {
          slug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!existing) return candidate;
      n += 1;
    }
  }

  /**
   * Najde nejlepší shodu lokality pro inzerát a vrátí ID + kraj/okres.
   */
  async resolveForPropertyAddress(input: {
    city?: string | null;
    district?: string | null;
    region?: string | null;
    address?: string | null;
  }): Promise<{ seoLocationId: string | null; regionId: string | null; districtId: string | null }> {
    const city = input.city?.trim();
    if (!city) return { seoLocationId: null, regionId: null, districtId: null };

    const folded = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const loc = await this.prisma.seoLocation.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { equals: city, mode: 'insensitive' } },
          { slug: foldSeoAscii(city) },
          { slugAscii: folded },
          { searchTerms: { has: city } },
        ],
      },
      orderBy: [{ population: 'desc' }],
    });

    if (!loc) return { seoLocationId: null, regionId: null, districtId: null };
    return {
      seoLocationId: loc.id,
      regionId: loc.regionId,
      districtId: loc.districtId,
    };
  }

  async createRedirectForSlugChange(
    intentSlug: string,
    oldSlug: string,
    newSlug: string,
    locationId?: string,
  ): Promise<void> {
    const fromPath = `/${intentSlug}/${oldSlug}`;
    const toPath = `/${intentSlug}/${newSlug}`;
    await this.prisma.seoRedirect.upsert({
      where: { fromPath },
      create: {
        fromPath,
        toPath,
        statusCode: 301,
        reason: 'seo_slug_change',
        locationId: locationId ?? null,
      },
      update: { toPath, locationId: locationId ?? null },
    });
  }

  async listImportRuns(limit = 20) {
    return this.prisma.seoLocationImportRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}

function foldSeoAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
