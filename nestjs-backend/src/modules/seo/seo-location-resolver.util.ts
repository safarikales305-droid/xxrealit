import type { SeoLocationKind } from '@prisma/client';
import { buildSeoLocationSlug, foldSeoAscii } from './seo-location.util';

export type SeoLocationResolveStatus = 'READY' | 'LOCATION_UNRESOLVED';

export type ResolvedSeoLocation = {
  locationId: string;
  officialCode: string;
  name: string;
  rawName: string;
  municipalityName: string | null;
  cityPartName: string | null;
  districtName: string | null;
  regionName: string | null;
  slug: string;
  slugAscii: string;
  locative: string;
  postalCode: string | null;
  kind: SeoLocationKind;
  status: SeoLocationResolveStatus;
  resolvedFrom: string;
};

export function isNumericLocationLabel(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return /^\d+$/.test(value.trim());
}

export function isInvalidPublicLocationName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return true;
  if (isNumericLocationLabel(trimmed)) return true;
  if (/^loc-\d+$/i.test(trimmed)) return true;
  return false;
}

export function isNumericLocationSlug(slug: string | null | undefined): boolean {
  const s = slug?.trim() ?? '';
  if (!s) return true;
  if (isNumericLocationLabel(s)) return true;
  if (/^loc-\d+$/i.test(s)) return true;
  return false;
}

type HierarchyInput = {
  name: string;
  kind: SeoLocationKind;
  locative?: string | null;
  searchTerms?: string[];
  parent?: { name: string; kind: SeoLocationKind } | null;
  district?: { name: string } | null;
  region?: { name: string } | null;
};

export function pickSeoLocationDisplayName(input: HierarchyInput): {
  displayName: string;
  municipalityName: string | null;
  cityPartName: string | null;
  districtName: string | null;
  regionName: string | null;
  resolvedFrom: string;
  status: SeoLocationResolveStatus;
} {
  const districtName = input.district?.name?.trim() || null;
  const regionName = input.region?.name?.trim() || null;
  const parentName = input.parent?.name?.trim() || null;

  const validSearchTerm = (input.searchTerms ?? []).find((t) => !isInvalidPublicLocationName(t));
  if (validSearchTerm) {
    return {
      displayName: validSearchTerm,
      municipalityName: validSearchTerm,
      cityPartName:
        input.kind === 'MESTSKA_CAST' || input.kind === 'CAST_OBCE' ? validSearchTerm : null,
      districtName,
      regionName,
      resolvedFrom: 'searchTerms',
      status: 'READY',
    };
  }

  if (
    (input.kind === 'MESTSKA_CAST' || input.kind === 'CAST_OBCE') &&
    !isInvalidPublicLocationName(input.name)
  ) {
    return {
      displayName: input.name.trim(),
      municipalityName: parentName && !isInvalidPublicLocationName(parentName) ? parentName : null,
      cityPartName: input.name.trim(),
      districtName,
      regionName,
      resolvedFrom: 'cityPartName',
      status: 'READY',
    };
  }

  if (!isInvalidPublicLocationName(input.name)) {
    return {
      displayName: input.name.trim(),
      municipalityName: input.name.trim(),
      cityPartName: null,
      districtName,
      regionName,
      resolvedFrom: 'municipalityName',
      status: 'READY',
    };
  }

  if (parentName && !isInvalidPublicLocationName(parentName)) {
    return {
      displayName: parentName,
      municipalityName: parentName,
      cityPartName: null,
      districtName,
      regionName,
      resolvedFrom: 'parentName',
      status: 'READY',
    };
  }

  if (districtName && !isInvalidPublicLocationName(districtName)) {
    return {
      displayName: districtName,
      municipalityName: null,
      cityPartName: null,
      districtName,
      regionName,
      resolvedFrom: 'districtName',
      status: 'READY',
    };
  }

  if (regionName && !isInvalidPublicLocationName(regionName)) {
    return {
      displayName: regionName,
      municipalityName: null,
      cityPartName: null,
      districtName,
      regionName,
      resolvedFrom: 'regionName',
      status: 'READY',
    };
  }

  return {
    displayName: input.name.trim(),
    municipalityName: null,
    cityPartName: null,
    districtName,
    regionName,
    resolvedFrom: 'unresolved',
    status: 'LOCATION_UNRESOLVED',
  };
}

export function buildResolvedSeoLocation(row: {
  id: string;
  officialCode: string;
  name: string;
  slug: string;
  slugAscii: string;
  locative: string;
  kind: SeoLocationKind;
  psc?: string | null;
  searchTerms?: string[];
  parent?: { name: string; kind: SeoLocationKind } | null;
  district?: { name: string } | null;
  region?: { name: string } | null;
}): ResolvedSeoLocation {
  const picked = pickSeoLocationDisplayName({
    name: row.name,
    kind: row.kind,
    locative: row.locative,
    searchTerms: row.searchTerms,
    parent: row.parent,
    district: row.district,
    region: row.region,
  });

  const displayName = picked.displayName;
  const slugFromName = buildSeoLocationSlug(displayName, row.officialCode);
  const slug =
    picked.status === 'READY' && !isNumericLocationSlug(row.slug) ? row.slug : slugFromName;
  const locative =
    row.locative && !isInvalidPublicLocationName(row.locative)
      ? row.locative
      : `v ${displayName}`;

  return {
    locationId: row.id,
    officialCode: row.officialCode,
    name: displayName,
    rawName: row.name,
    municipalityName: picked.municipalityName,
    cityPartName: picked.cityPartName,
    districtName: picked.districtName,
    regionName: picked.regionName,
    slug,
    slugAscii: foldSeoAscii(slug),
    locative,
    postalCode: row.psc ?? null,
    kind: row.kind,
    status: picked.status,
    resolvedFrom: picked.resolvedFrom,
  };
}

export function pageNeedsLocationRepair(input: {
  locationName?: string | null;
  h1?: string | null;
  title?: string | null;
  slug?: string | null;
}): boolean {
  if (isInvalidPublicLocationName(input.locationName)) return true;
  if (isNumericLocationSlug(input.slug)) return true;
  const h1 = input.h1 ?? '';
  if (/\blokalit[eě]\s+\d{4,}\b/i.test(h1)) return true;
  if (/\bv\s+\d{4,}\b/i.test(h1) && isNumericLocationLabel(input.locationName ?? '')) return true;
  const title = input.title ?? '';
  if (/\blokalit[eě]\s+\d{4,}\b/i.test(title)) return true;
  return false;
}
