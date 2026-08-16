import { CompanyGoogleMatchStatus } from '@prisma/client';

export type GoogleMatchInput = {
  companyName: string;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type GooglePlaceCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsUri?: string | null;
};

export function scoreGooglePlaceMatch(
  company: GoogleMatchInput,
  place: GooglePlaceCandidate,
): { score: number; status: CompanyGoogleMatchStatus } {
  let score = 0;
  const nameA = normalize(company.companyName);
  const nameB = normalize(place.displayName);
  if (nameA && nameB) {
    if (nameA === nameB) score += 45;
    else if (nameB.includes(nameA) || nameA.includes(nameB)) score += 30;
    else if (tokenOverlap(nameA, nameB) >= 0.5) score += 20;
  }

  const addr = normalize(place.formattedAddress ?? '');
  if (company.city && addr.includes(normalize(company.city))) score += 15;
  if (company.postalCode && addr.includes(company.postalCode.replace(/\s/g, ''))) score += 10;
  if (company.street) {
    const streetNorm = normalize(company.street);
    if (addr.includes(streetNorm)) score += 15;
  }

  if (score >= 85) return { score, status: CompanyGoogleMatchStatus.MATCHED_HIGH };
  if (score >= 65) return { score, status: CompanyGoogleMatchStatus.MATCHED_MEDIUM };
  if (score >= 45) return { score, status: CompanyGoogleMatchStatus.MATCHED_LOW };
  return { score, status: CompanyGoogleMatchStatus.REVIEW_REQUIRED };
}

export function autoApplyGoogleMatch(status: CompanyGoogleMatchStatus): boolean {
  return status === CompanyGoogleMatchStatus.MATCHED_HIGH;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) shared += 1;
  }
  return shared / Math.max(ta.size, tb.size);
}
