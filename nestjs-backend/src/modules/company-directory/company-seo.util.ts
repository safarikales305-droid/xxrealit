import type { CompanyDirectoryEntry } from '@prisma/client';
import { CATEGORY_LABELS } from './company-directory.constants';
import type { CompanyEnrichmentPayload } from './company-sourced-field.types';

export function buildCompanySeoTitle(company: Pick<
  CompanyDirectoryEntry,
  'name' | 'city' | 'categories'
>): string {
  const category = company.categories[0];
  const categoryLabel = category ? CATEGORY_LABELS[category].toLowerCase() : 'firma';
  const city = company.city?.trim();
  if (city) {
    return `${company.name} – ${categoryLabel} ${city} | XXREALIT`;
  }
  return `${company.name} – ${categoryLabel} | XXREALIT`;
}

export function buildCompanyMetaDescription(company: Pick<
  CompanyDirectoryEntry,
  'name' | 'city' | 'shortDescription' | 'description'
> & { services?: string[] }): string {
  if (company.shortDescription?.trim()) {
    const base = company.shortDescription.trim();
    return base.length <= 160 ? `${base} Profil firmy na XXREALIT.` : base.slice(0, 157) + '…';
  }
  const city = company.city?.trim();
  const services = company.services?.slice(0, 2).join(', ');
  if (city && services) {
    return `${company.name} působí v ${city} a zaměřuje se na ${services}. Kontakty a profil firmy na XXREALIT.`;
  }
  if (city) {
    return `${company.name} působí v ${city}. Kontakty, zkušenosti a profil firmy na XXREALIT.`;
  }
  return `Profil firmy ${company.name} na XXREALIT – kontakty, služby a recenze.`;
}

export function computeSeoQualityScore(company: Pick<
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
> & { serviceCount?: number }): number {
  let score = 0;
  if (company.name && company.ico) score += 10;
  if (company.city && company.region) score += 8;
  if (company.street) score += 5;
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
    | 'street'
    | 'city'
    | 'postalCode'
    | 'country'
    | 'xxrealitRatingAverage'
    | 'xxrealitReviewCount'
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
