import { CompanyDirectoryCategory, CompanyDirectoryEntry, Prisma } from '@prisma/client';
import { mapAresActivitiesToCategories } from './ares-activity.mapper';
import type { AresEconomicSubject } from './ares.types';
import { buildCompanySlug } from './company-directory.slug';
import { CATEGORY_LABELS } from './company-directory.constants';

export type NormalizedCompanyFromAres = {
  ico: string;
  dic: string | null;
  name: string;
  slug: string;
  legalForm: string | null;
  companyStatus: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  district: string | null;
  region: string | null;
  country: string;
  registeredAddress: string | null;
  categories: CompanyDirectoryCategory[];
  businessActivities: string[];
  aresRawUpdatedAt: Date | null;
};

export function normalizeAresCompanyForDb(
  subject: AresEconomicSubject,
  hintCategory?: CompanyDirectoryCategory | null,
): NormalizedCompanyFromAres {
  const sidlo = subject.sidlo;
  const activities = [
    ...(subject.czNace ?? []),
    ...(subject.czNace2008 ?? []),
  ].filter(Boolean);

  const rosStatus = subject.seznamRegistraci?.stavZdrojeRos;
  const resStatus = subject.seznamRegistraci?.stavZdrojeRes;
  const companyStatus =
    rosStatus === 'AKTIVNI' || resStatus === 'AKTIVNI'
      ? 'AKTIVNI'
      : rosStatus ?? resStatus ?? 'NEZNAMY';

  const streetParts = [sidlo?.nazevUlice, sidlo?.cisloDomovni, sidlo?.cisloOrientacni]
    .filter((v) => v != null && String(v).length > 0)
    .map(String);
  const street = streetParts.length > 0 ? streetParts.join(' ') : null;

  const ico = subject.ico.replace(/\D/g, '').padStart(8, '0');
  const categories = mapAresActivitiesToCategories(activities, hintCategory);
  const primaryCategory = categories[0] ?? CompanyDirectoryCategory.OSTATNI;

  return {
    ico,
    dic: subject.dic ?? null,
    name: subject.obchodniJmeno?.trim() || `IČO ${ico}`,
    slug: buildCompanySlug(subject.obchodniJmeno ?? ico, ico, primaryCategory),
    legalForm: subject.pravniForma ?? subject.pravniFormaRos ?? null,
    companyStatus,
    street,
    city: sidlo?.nazevObce ?? null,
    postalCode: sidlo?.psc != null ? String(sidlo.psc) : null,
    district: sidlo?.nazevOkresu ?? null,
    region: sidlo?.nazevKraje ?? null,
    country: sidlo?.kodStatu ?? 'CZ',
    registeredAddress: sidlo?.textovaAdresa ?? null,
    categories,
    businessActivities: [...new Set(activities)],
    aresRawUpdatedAt: subject.datumAktualizace
      ? new Date(subject.datumAktualizace)
      : null,
  };
}

export function serializeCompanyDirectoryCard(row: CompanyDirectoryEntry) {
  const primaryCategory = row.categories[0] ?? CompanyDirectoryCategory.OSTATNI;
  const badges: string[] = ['ARES'];
  if (row.verificationStatus === 'VERIFIED' || row.profileStatus === 'VERIFIED') {
    badges.push('OVĚŘENO');
  }
  if (row.profileStatus === 'UNCLAIMED') {
    badges.push('NEPŘEVZATÝ PROFIL');
  }

  return {
    type: 'company' as const,
    id: row.id,
    ico: row.ico,
    slug: row.slug,
    name: row.name,
    category: primaryCategory,
    categoryLabel: CATEGORY_LABELS[primaryCategory],
    city: row.city,
    region: row.region,
    rating: row.googleRating,
    ratingCount: row.googleReviewCount,
    logoUrl: row.logoUrl,
    profileStatus: row.profileStatus,
    verificationStatus: row.verificationStatus,
    companyStatus: row.companyStatus,
    badges,
    href: `/firmy/${row.slug}`,
    isVerified: row.verificationStatus === 'VERIFIED' || row.profileStatus === 'VERIFIED',
  };
}

export function serializeCompanyDirectoryDetail(row: CompanyDirectoryEntry) {
  const card = serializeCompanyDirectoryCard(row);
  return {
    ...card,
    dic: row.dic,
    legalForm: row.legalForm,
    street: row.street,
    postalCode: row.postalCode,
    district: row.district,
    registeredAddress: row.registeredAddress,
    categories: row.categories.map((c) => ({
      key: c,
      label: CATEGORY_LABELS[c],
    })),
    businessActivities: row.businessActivities,
    website: row.website,
    email: row.email,
    phone: row.phone,
    aresLastSyncAt: row.aresLastSyncAt?.toISOString() ?? null,
    aresSource: row.aresSource,
    googlePlaceId: row.googlePlaceId,
    googleLastSyncAt: row.googleLastSyncAt?.toISOString() ?? null,
    aiSummary: row.aiSummary,
    aiPositiveSummary: row.aiPositiveSummary,
    aiNegativeSummary: row.aiNegativeSummary,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    registryDisclaimer:
      'Profil vytvořen z veřejných rejstříkových údajů. Není automaticky partnerem XXREALIT.',
  };
}

export function buildCompanyListWhere(query: {
  q?: string;
  ico?: string;
  category?: string;
  region?: string;
  city?: string;
  verified?: string;
  active?: string;
  minRating?: string;
}): Prisma.CompanyDirectoryEntryWhereInput {
  const where: Prisma.CompanyDirectoryEntryWhereInput = {
    publicProfile: true,
  };

  if (query.ico?.trim()) {
    where.ico = query.ico.replace(/\D/g, '').padStart(8, '0');
  } else if (query.q?.trim()) {
    where.OR = [
      { name: { contains: query.q.trim(), mode: 'insensitive' } },
      { city: { contains: query.q.trim(), mode: 'insensitive' } },
      { region: { contains: query.q.trim(), mode: 'insensitive' } },
    ];
  }

  if (query.category?.trim()) {
    const cat = query.category.trim().toUpperCase() as CompanyDirectoryCategory;
    if (Object.values(CompanyDirectoryCategory).includes(cat)) {
      where.categories = { has: cat };
    }
  }

  if (query.region?.trim()) {
    where.region = { contains: query.region.trim(), mode: 'insensitive' };
  }

  if (query.city?.trim()) {
    where.city = { contains: query.city.trim(), mode: 'insensitive' };
  }

  if (query.verified === 'true') {
    where.verificationStatus = 'VERIFIED';
  } else if (query.verified === 'false') {
    where.verificationStatus = { not: 'VERIFIED' };
  }

  if (query.active === 'true') {
    where.companyStatus = 'AKTIVNI';
  } else if (query.active === 'false') {
    where.companyStatus = { not: 'AKTIVNI' };
  }

  const minRating = Number(query.minRating);
  if (Number.isFinite(minRating) && minRating > 0) {
    where.googleRating = { gte: minRating };
  }

  return where;
}
