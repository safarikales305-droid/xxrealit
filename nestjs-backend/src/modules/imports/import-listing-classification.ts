import { ListingImportPortal, PropertyShortsSourceType } from '@prisma/client';

export type DetectedPropertyType = { key: string; label: string };

export function detectPropertyType(input: {
  title?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  description?: string | null;
}): DetectedPropertyType {
  const text = `${input.title || ''} ${input.category || ''} ${input.description || ''} ${input.sourceUrl || ''}`.toLowerCase();

  if (text.includes('byt') || text.includes('/byty/')) return { key: 'byt', label: 'Byty' };
  if (text.includes('dum') || text.includes('dům') || text.includes('/domy/')) {
    return { key: 'dum', label: 'Domy' };
  }
  if (text.includes('pozem') || text.includes('/pozemky/')) return { key: 'pozemek', label: 'Pozemky' };
  if (text.includes('garáž') || text.includes('garaz') || text.includes('/garaze/')) {
    return { key: 'garaz', label: 'Garáže' };
  }
  if (
    text.includes('komer') ||
    text.includes('kancelář') ||
    text.includes('obchodní prostor')
  ) {
    return { key: 'komercni', label: 'Komerční' };
  }
  if (text.includes('chata') || text.includes('chalupa')) {
    return { key: 'chata_chalupa', label: 'Chaty a chalupy' };
  }

  return { key: 'ostatni', label: 'Ostatní' };
}

function normalizeImportVideoUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/** Reality.cz klasik import nikdy neexportuje vlastní tour video do veřejného Property.videoUrl. */
export function computeShortsSourceForImport(
  portal: ListingImportPortal,
  row: { videoUrl?: string | null; images: string[] },
): { shortsSourceType: PropertyShortsSourceType; canGenerateShorts: boolean } {
  const imageCount = Array.isArray(row.images)
    ? row.images.filter((u) => typeof u === 'string' && u.trim().length > 0).length
    : 0;

  if (portal !== ListingImportPortal.reality_cz) {
    const vid = normalizeImportVideoUrl(row.videoUrl);
    if (vid) {
      return { shortsSourceType: PropertyShortsSourceType.video, canGenerateShorts: true };
    }
  }

  if (imageCount >= 2) {
    return { shortsSourceType: PropertyShortsSourceType.images, canGenerateShorts: true };
  }

  return { shortsSourceType: PropertyShortsSourceType.none, canGenerateShorts: false };
}

export function portalKeyLabelForEnum(portal: ListingImportPortal): {
  sourcePortalKey: string;
  sourcePortalLabel: string;
} {
  switch (portal) {
    case ListingImportPortal.reality_cz:
      return { sourcePortalKey: 'reality_cz', sourcePortalLabel: 'Reality.cz' };
    case ListingImportPortal.xml_feed:
      return { sourcePortalKey: 'xml_feed', sourcePortalLabel: 'XML feed' };
    case ListingImportPortal.csv_feed:
      return { sourcePortalKey: 'csv_feed', sourcePortalLabel: 'CSV' };
    default:
      return { sourcePortalKey: 'other', sourcePortalLabel: 'Jiný portál' };
  }
}
