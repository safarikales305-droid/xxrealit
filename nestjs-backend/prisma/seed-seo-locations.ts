/**
 * Seed základních SEO lokalit z vestavěných dat (kraje + města).
 * Plný import ~6250 obcí: POST /admin/seo/locations/import s JSON z ČSÚ/RÚIAN.
 */
import { PrismaClient } from '@prisma/client';
import { CZ_GEO_LOCATIONS } from '../src/modules/seo/cz-geo-locations.data';
import { normalizeSeoLocationKind } from '../src/modules/seo/seo-location.util';

const prisma = new PrismaClient();

async function main() {
  const rows = CZ_GEO_LOCATIONS.map((loc) => ({
    officialCode: `seed-${loc.slug}`,
    name: loc.name,
    slug: loc.slug,
    slugAscii: loc.slug,
    locative: loc.locative,
    kind: normalizeSeoLocationKind(loc.kind),
    parentOfficialCode: loc.parentSlug ? `seed-${loc.parentSlug}` : loc.regionSlug ? `seed-${loc.regionSlug}` : null,
    regionOfficialCode: loc.regionSlug ? `seed-${loc.regionSlug}` : null,
    districtOfficialCode: loc.districtSlug ? `seed-${loc.districtSlug}` : null,
    latitude: null,
    longitude: null,
    population: loc.population ?? null,
    searchTerms: loc.searchTerms,
    isActive: true,
  }));

  let inserted = 0;
  let updated = 0;
  const codeToId = new Map<string, string>();

  for (const row of rows) {
    const existing = await prisma.seoLocation.findUnique({
      where: { officialCode: row.officialCode },
    });
    const data = {
      officialCode: row.officialCode,
      name: row.name,
      slug: row.slug,
      slugAscii: row.slugAscii,
      locative: row.locative,
      kind: row.kind as never,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      population: row.population ?? undefined,
      searchTerms: row.searchTerms,
      isActive: true,
      importedAt: new Date(),
    };
    if (existing) {
      await prisma.seoLocation.update({ where: { id: existing.id }, data });
      codeToId.set(row.officialCode, existing.id);
      updated += 1;
    } else {
      const created = await prisma.seoLocation.create({ data });
      codeToId.set(row.officialCode, created.id);
      inserted += 1;
    }
  }

  for (const row of rows) {
    const id = codeToId.get(row.officialCode);
    if (!id) continue;
    await prisma.seoLocation.update({
      where: { id },
      data: {
        parentId: row.parentOfficialCode ? codeToId.get(row.parentOfficialCode) ?? null : null,
        regionId: row.regionOfficialCode ? codeToId.get(row.regionOfficialCode) ?? null : null,
        districtId: row.districtOfficialCode ? codeToId.get(row.districtOfficialCode) ?? null : null,
      },
    });
  }

  console.log(`SEO locations seed: inserted=${inserted}, updated=${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
