import { getNestPublicOrigin, nestAbsoluteAssetUrl } from '@/lib/api';
import { isValidImageUrl, normalizeImageCandidate } from '@/lib/images';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

export type MediaItem = {
  key: string;
  url: string;
  type: 'image' | 'video';
};

export type QuickParam = {
  icon: string;
  label: string;
  value: string;
};

export type ParamRow = {
  label: string;
  value: string;
};

function collectPhotoUrls(p: PropertyFeedItem): string[] {
  const ext = p as PropertyFeedItem & { photos?: Array<{ url?: string } | string> };
  const base = getNestPublicOrigin() || undefined;
  if (!Array.isArray(ext.photos)) return [];
  const out: string[] = [];
  for (const x of ext.photos) {
    if (typeof x === 'string') {
      const n = normalizeImageCandidate(x.trim(), base);
      if (isValidImageUrl(n)) out.push(n!);
    } else if (x && typeof x === 'object') {
      const u = typeof x.url === 'string' ? x.url.trim() : '';
      const n = normalizeImageCandidate(u, base);
      if (isValidImageUrl(n)) out.push(n!);
    }
  }
  return out;
}

function collectImagesFieldUrls(p: PropertyFeedItem): string[] {
  const base = getNestPublicOrigin() || undefined;
  const candidates = [
    ...(Array.isArray(p.images) ? p.images : []),
    ...(Array.isArray(p.galleryImages) ? p.galleryImages : []),
    ...(typeof p.mainImage === 'string' && p.mainImage.trim() ? [p.mainImage.trim()] : []),
  ];
  const out: string[] = [];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const n = normalizeImageCandidate(raw.trim(), base);
    if (isValidImageUrl(n)) out.push(n!);
  }
  return out;
}

export function buildMediaList(p: PropertyFeedItem): MediaItem[] {
  const base = getNestPublicOrigin() || undefined;
  const relation = [...(p.media ?? [])]
    .filter((m) => m.url?.trim())
    .sort((a, b) => a.order - b.order);

  const videos: MediaItem[] = relation
    .filter((m) => m.type === 'video')
    .map((m, i) => ({
      key: `video-${m.order}-${i}`,
      url: m.url.trim(),
      type: 'video' as const,
    }));

  const seenNorm = new Set<string>();
  const imagesOut: MediaItem[] = [];
  const pushImage = (rawUrl: string, keyPrefix: string) => {
    const n = normalizeImageCandidate(rawUrl.trim(), base);
    if (!isValidImageUrl(n) || !n || seenNorm.has(n)) return;
    seenNorm.add(n);
    imagesOut.push({ key: `${keyPrefix}-${imagesOut.length}`, url: n, type: 'image' });
  };

  for (const m of relation) {
    if (m.type === 'image' && m.url?.trim()) pushImage(m.url, 'media');
  }
  for (const u of collectImagesFieldUrls(p)) pushImage(u, 'img');
  for (const u of collectPhotoUrls(p)) pushImage(u, 'photo');

  if (videos.length > 0 || imagesOut.length > 0) return [...videos, ...imagesOut];

  const v = p.videoUrl?.trim();
  if (v) return [{ key: 'video-fallback', url: v, type: 'video' }];
  const cover = classicListingCoverUrl(p);
  if (cover) return [{ key: 'image-fallback', url: cover, type: 'image' }];
  return [];
}

export function mediaUrl(url: string) {
  return nestAbsoluteAssetUrl(url);
}

function strVal(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Ano' : 'Ne';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function labelizeType(raw: string): string {
  const m: Record<string, string> = {
    byt: 'Byt',
    dum: 'Dům',
    dům: 'Dům',
    pozemek: 'Pozemek',
    chata: 'Chata',
    komercni: 'Komerční',
    prodej: 'Prodej',
    pronajem: 'Pronájem',
    pronájem: 'Pronájem',
  };
  return m[raw.toLowerCase()] ?? raw;
}

export function pricePerSqm(price: number | null, area: unknown): number | null {
  const a = typeof area === 'number' ? area : Number(area);
  if (price == null || !Number.isFinite(a) || a <= 0) return null;
  return Math.round(price / a);
}

export function buildQuickParams(
  p: PropertyFeedItem,
  extra: Record<string, unknown>,
): QuickParam[] {
  const items: QuickParam[] = [];
  const pt =
    strVal(extra.propertyTypeLabel) ??
    strVal(extra.propertyType) ??
    strVal(p.propertyTypeLabel) ??
    strVal(p.propertyTypeKey);
  if (pt) items.push({ icon: '🏠', label: 'Typ', value: labelizeType(pt) });

  const area = strVal(extra.area);
  if (area) items.push({ icon: '📐', label: 'Plocha', value: `${area} m²` });

  const land = strVal(extra.landArea);
  if (land) items.push({ icon: '🌳', label: 'Pozemek', value: `${land} m²` });

  const sub = strVal(extra.subType);
  if (sub) items.push({ icon: '🛏', label: 'Dispozice', value: sub });

  if (extra.parking === true) items.push({ icon: '🚗', label: 'Parkování', value: 'Garáž / stání' });

  const cond = strVal(extra.condition);
  if (cond) items.push({ icon: '🏗', label: 'Stav', value: cond });

  const energy = strVal(extra.energyLabel);
  if (energy) items.push({ icon: '⚡', label: 'Energetická třída', value: energy });

  return items;
}

export function buildParameterRows(
  p: PropertyFeedItem,
  extra: Record<string, unknown>,
  isAuthenticated: boolean,
): ParamRow[] {
  const rows: ParamRow[] = [];
  const add = (label: string, value: unknown) => {
    const v = strVal(value);
    if (v) rows.push({ label, value: v });
  };

  const area = extra.area;
  const ppm = pricePerSqm(p.price, area);

  if (p.price != null) {
    rows.push({
      label: 'Celková cena',
      value: isAuthenticated
        ? `${p.price.toLocaleString('cs-CZ')} Kč`
        : 'Přihlaste se pro zobrazení',
    });
  }
  if (ppm != null) {
    rows.push({ label: 'Cena za m²', value: `${ppm.toLocaleString('cs-CZ')} Kč/m²` });
  }

  add('Dispozice', extra.subType);
  add('Typ nemovitosti', extra.propertyTypeLabel ?? extra.propertyType ?? p.propertyTypeLabel);
  add('Typ nabídky', extra.offerType ?? extra.type);
  add('Podlahová plocha', area != null ? `${area} m²` : null);
  add('Plocha pozemku', extra.landArea != null ? `${extra.landArea} m²` : null);
  add('Stav', extra.condition);
  add('Patro', extra.floor);
  add('Počet podlaží', extra.totalFloors);
  add('Sklep', extra.cellar);
  add('Parkování', extra.parking);
  add('Energetická náročnost', extra.energyLabel);
  add('Vlastnictví', extra.ownership);
  add('Konstrukce', extra.construction);
  add('Vybavení', extra.equipment);
  add('Město', p.location);
  add('Adresa', p.address);
  add('Okres', p.district);
  add('Kraj', p.region);

  return rows;
}

export function mapsQuery(p: PropertyFeedItem): string {
  return [p.address, p.location, p.district, p.region].filter(Boolean).join(', ').trim();
}

export function roleLabel(role?: string | null): string {
  const m: Record<string, string> = {
    AGENT: 'Makléř',
    AGENCY: 'Realitní kancelář',
    COMPANY: 'Stavební firma',
    PRIVATE_SELLER: 'Soukromý inzerent',
    USER: 'Inzerent',
  };
  return role ? (m[role] ?? role) : 'Inzerent';
}

export function renderStars(rating: number): string {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
