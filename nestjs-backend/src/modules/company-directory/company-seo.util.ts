import type { CompanyDirectoryEntry } from '@prisma/client';
import { CATEGORY_LABELS } from './company-directory.constants';
import type { CompanyEnrichmentPayload } from './company-sourced-field.types';

export function formatCompanyIco(ico: string): string {
  return ico.replace(/\D/g, '').padStart(8, '0');
}

export function buildCompanySeoTitle(
  company: Pick<CompanyDirectoryEntry, 'name' | 'city' | 'ico'>,
): string {
  const ico = formatCompanyIco(company.ico);
  const city = company.city?.trim();
  if (city) {
    return `${company.name} – ${city}, IČO ${ico} | XXREALIT`;
  }
  return `${company.name}, IČO ${ico} | XXREALIT`;
}

export function buildCompanyMetaDescription(
  company: Pick<
    CompanyDirectoryEntry,
    'name' | 'city' | 'ico' | 'shortDescription' | 'description'
  > & { services?: string[] },
): string {
  const ico = formatCompanyIco(company.ico);
  if (company.shortDescription?.trim()) {
    const base = company.shortDescription.trim();
    const suffix = ' Prohlédněte si profil firmy na XXREALIT.';
    if (base.length + suffix.length <= 160) return `${base}${suffix}`;
    return base.length <= 160 ? base : base.slice(0, 157) + '…';
  }
  const city = company.city?.trim();
  const services = company.services?.slice(0, 2).join(', ');
  if (city && services) {
    return `${company.name}, IČO ${ico} – informace o firmě se sídlem v ${city}, zaměření na ${services}, kontakty a recenze. Prohlédněte si profil firmy na XXREALIT.`;
  }
  if (city) {
    return `${company.name}, IČO ${ico} – informace o firmě, sídlo v ${city}, kontaktní údaje, zaměření společnosti a recenze. Prohlédněte si profil firmy na XXREALIT.`;
  }
  return `${company.name}, IČO ${ico} – informace o firmě, kontaktní údaje, zaměření společnosti a recenze. Prohlédněte si profil firmy na XXREALIT.`;
}

export type IndexabilityDecision = 'index' | 'conditional' | 'noindex';

export function evaluateIndexability(
  score: number,
  hasUniqueContent: boolean,
): IndexabilityDecision {
  if (score >= 80) return 'index';
  if (score >= 60 && hasUniqueContent) return 'conditional';
  return 'noindex';
}

export function shouldIndexCompany(
  score: number,
  hasUniqueContent: boolean,
  seoPageStatus?: string | null,
): boolean {
  if (seoPageStatus === 'DRAFT' || seoPageStatus === 'DUPLICATE_CONTENT_REVIEW') return false;
  const decision = evaluateIndexability(score, hasUniqueContent);
  return decision === 'index' || decision === 'conditional';
}

export function computeSeoQualityScore(
  company: Pick<
    CompanyDirectoryEntry,
    | 'name'
    | 'ico'
    | 'city'
    | 'region'
    | 'street'
    | 'website'
    | 'phone'
    | 'email'
    | 'description'
    | 'shortDescription'
    | 'verifiedBusinessEmail'
    | 'xxrealitReviewCount'
    | 'logoUrl'
    | 'profileStatus'
    | 'contentEnrichedAt'
    | 'businessActivities'
    | 'legalForm'
    | 'postalCode'
  > & { serviceCount?: number; hasUniqueTitle?: boolean; hasUniqueDescription?: boolean },
): number {
  let score = 0;
  if (company.name && company.ico) score += 10;
  if (company.city && company.region) score += 8;
  if (company.street) score += 5;
  if (company.postalCode) score += 2;
  if (company.legalForm) score += 3;
  if (company.website) score += 12;
  if (company.phone) score += 8;
  if (company.email || company.verifiedBusinessEmail) score += 8;
  if (company.shortDescription && company.shortDescription.length >= 80) score += 12;
  if (company.description && company.description.length >= 200) score += 15;
  if ((company.serviceCount ?? 0) >= 2) score += 10;
  if ((company.xxrealitReviewCount ?? 0) > 0) score += 8;
  if (company.logoUrl) score += 5;
  if (company.profileStatus === 'CLAIMED' || company.profileStatus === 'VERIFIED') score += 7;
  if (company.contentEnrichedAt) score += 2;
  if ((company.businessActivities?.length ?? 0) > 0) score += 5;
  if (company.hasUniqueTitle) score += 3;
  if (company.hasUniqueDescription) score += 3;
  return Math.min(100, score);
}

export function textSimilarity(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(' ').filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractServicesFromEnrichment(data: CompanyEnrichmentPayload | null | undefined): string[] {
  if (!data?.services?.length) return [];
  return data.services.map((s) => s.value).filter(Boolean).slice(0, 12);
}

export function buildCompanyJsonLd(
  company: Pick<
    CompanyDirectoryEntry,
    | 'name'
    | 'website'
    | 'phone'
    | 'email'
    | 'street'
    | 'city'
    | 'postalCode'
    | 'country'
    | 'xxrealitRatingAverage'
    | 'xxrealitReviewCount'
    | 'logoUrl'
  >,
  profileUrl: string,
  socialLinks: string[] = [],
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': company.city ? 'LocalBusiness' : 'Organization',
    name: company.name,
    url: profileUrl,
  };
  if (company.logoUrl) schema.image = company.logoUrl;
  if (company.email) schema.email = company.email;
  if (company.website) schema.sameAs = [company.website, ...socialLinks].filter(Boolean);
  else if (socialLinks.length) schema.sameAs = socialLinks;
  if (company.phone) schema.telephone = company.phone;
  if (company.street || company.city) {
    schema.address = {
      '@type': 'PostalAddress',
      streetAddress: company.street ?? undefined,
      addressLocality: company.city ?? undefined,
      postalCode: company.postalCode ?? undefined,
      addressCountry: company.country ?? 'CZ',
    };
  }
  if (
    company.xxrealitReviewCount &&
    company.xxrealitReviewCount > 0 &&
    company.xxrealitRatingAverage != null
  ) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: company.xxrealitRatingAverage,
      reviewCount: company.xxrealitReviewCount,
    };
  }
  return schema;
}

export function buildCompanyBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildCompanyBreadcrumbs(
  company: Pick<CompanyDirectoryEntry, 'name' | 'city' | 'region' | 'categories'>,
  baseUrl: string,
): Array<{ name: string; href: string }> {
  const base = baseUrl.replace(/\/+$/, '');
  const crumbs: Array<{ name: string; href: string }> = [
    { name: 'XXREALIT', href: base },
    { name: 'Firmy', href: `${base}/firmy` },
  ];
  if (company.region?.trim()) {
    crumbs.push({
      name: company.region.trim(),
      href: `${base}/firmy/${slugifyLocation(company.region)}`,
    });
  }
  if (company.city?.trim()) {
    crumbs.push({
      name: company.city.trim(),
      href: `${base}/firmy/${slugifyLocation(company.city)}`,
    });
  }
  crumbs.push({ name: company.name, href: '' });
  return crumbs;
}

function slugifyLocation(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
