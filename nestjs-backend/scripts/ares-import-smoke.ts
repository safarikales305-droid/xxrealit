/**
 * Smoke test: fetch one ARES page and upsert via Prisma (read-only on prod except Company rows).
 * Usage: npx tsx scripts/ares-import-smoke.ts
 */
import { PrismaClient } from '@prisma/client';
import { normalizeAresCompanyForDb } from '../src/modules/company-directory/company-directory.serializer';
import { getAresImportSkipReason } from '../src/modules/company-directory/ares-company-importability.util';
import type { AresEconomicSubject, AresSearchResponse } from '../src/modules/company-directory/ares.types';

const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat';

async function search(filter: Record<string, unknown>): Promise<AresSearchResponse> {
  const res = await fetch(ARES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ start: 0, pocet: 20, ...filter }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ARES ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<AresSearchResponse>;
}

async function upsertSubject(prisma: PrismaClient, subject: AresEconomicSubject) {
  const skipReason = getAresImportSkipReason(subject);
  if (skipReason) return { action: 'skipped' as const, ico: subject.ico };

  const normalized = normalizeAresCompanyForDb(subject, null);
  const existing = await prisma.companyDirectoryEntry.findUnique({ where: { ico: normalized.ico } });
  const now = new Date();
  const data = {
    dic: normalized.dic,
    name: normalized.name,
    slug: existing?.slug ?? normalized.slug,
    legalForm: normalized.legalForm,
    companyStatus: normalized.companyStatus,
    street: normalized.street,
    city: normalized.city,
    postalCode: normalized.postalCode,
    district: normalized.district,
    region: normalized.region,
    country: normalized.country,
    registeredAddress: normalized.registeredAddress,
    categories: normalized.categories,
    businessActivities: normalized.businessActivities,
    aresSource: true,
    aresLastSyncAt: now,
    aresRawUpdatedAt: normalized.aresRawUpdatedAt,
    publicProfile: true,
  };

  if (existing) {
    await prisma.companyDirectoryEntry.update({ where: { id: existing.id }, data });
    return { action: 'updated' as const, ico: normalized.ico };
  }
  await prisma.companyDirectoryEntry.create({ data: { ico: normalized.ico, ...data } });
  return { action: 'created' as const, ico: normalized.ico };
}

async function main() {
  const prisma = new PrismaClient();
  const before = await prisma.companyDirectoryEntry.count();
  const response = await search({ czNace: ['03'] });
  const subjects = response.ekonomickeSubjekty ?? [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const subject of subjects.slice(0, 15)) {
    const result = await upsertSubject(prisma, subject);
    if (result.action === 'created') created += 1;
    if (result.action === 'updated') updated += 1;
    if (result.action === 'skipped') skipped += 1;
  }

  const after = await prisma.companyDirectoryEntry.count();
  console.log(
    JSON.stringify(
      {
        filter: { czNace: ['03'] },
        aresPocetCelkem: response.pocetCelkem,
        batchSize: subjects.length,
        companyTotalBefore: before,
        companyTotalAfter: after,
        created,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
