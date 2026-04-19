import { UserRole } from '@prisma/client';
import {
  getFirstValidImage,
  isValidImageUrl,
  normalizeImageCandidate,
  resolveAssetBaseUrl,
} from '../../lib/image-url';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { computeListingPublicStatus } from './property-public-visibility';

function secureAssetUrl(url: string | null | undefined): string {
  if (url == null) return '';
  const t = String(url).trim();
  if (!t) return '';
  return upgradeHttpToHttpsForApi(t) ?? t;
}

function sanitizeListingImageUrl(
  raw: string | null | undefined,
  base: string | null,
): string | null {
  if (raw == null) return null;
  const stepped = secureAssetUrl(raw);
  if (!stepped) return null;
  const normalized = normalizeImageCandidate(stepped, base);
  return isValidImageUrl(normalized) ? normalized : null;
}

function safeStr(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function safeTrim(v: unknown): string {
  return safeStr(v).trim();
}

function safePriceField(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const t = Math.trunc(v);
    return t < 0 ? null : t;
  }
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  }
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
  }
  return null;
}

function safeDateIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function splitContactNameAndCompany(raw: unknown): { contactName: string; companyName: string | null } {
  const text = safeStr(raw, '').trim();
  if (!text) return { contactName: '', companyName: null };
  const sepIdx = text.indexOf(' · ');
  if (sepIdx <= 0) return { contactName: text, companyName: null };
  const name = text.slice(0, sepIdx).trim();
  const company = text.slice(sepIdx + 3).trim();
  return { contactName: name || text, companyName: company || null };
}

/** DB řádek PropertyMedia — veřejná URL: watermark → originál → hlavní `url`. */
function pickMediaDisplayUrl(m: Record<string, unknown>): string {
  const pick = (k: string): string => {
    const v = m[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  return (
    pick('watermarkedUrl') ||
    pick('originalUrl') ||
    pick('url') ||
    ''
  );
}

function asMediaObjectList(media: unknown): Record<string, unknown>[] {
  if (!Array.isArray(media)) return [];
  return media.filter(
    (x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x),
  );
}

/** Kontext prohlížeče pro maskování kontaktu u vlastnických inzerátů. */
export type PropertyViewerAccess = {
  role: UserRole;
  isPremiumBroker: boolean;
  isAdmin: boolean;
};

/** Shape expected from Prisma row + social includes. */
export type PropertyRowForApi = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  offerType: string;
  propertyType: string;
  subType: string;
  address: string;
  city: string;
  area: number | null;
  landArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  condition: string | null;
  construction: string | null;
  ownership: string | null;
  energyLabel: string | null;
  equipment: string | null;
  parking: boolean;
  cellar: boolean;
  images: string[];
  videoUrl: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  approved: boolean;
  deletedAt?: Date | null;
  isActive?: boolean;
  activeFrom?: Date | null;
  activeUntil?: Date | null;
  listingType?: string;
  viewsCount?: number;
  autoViewsEnabled?: boolean;
  autoViewsIncrement?: number;
  autoViewsIntervalMinutes?: number;
  lastAutoViewsAt?: Date | null;
  isOwnerListing?: boolean;
  ownerContactConsent?: boolean;
  region?: string;
  district?: string;
  derivedFromPropertyId?: string | null;
  publishedAt?: Date | null;
  importSource?: string | null;
  importMethod?: string | null;
  importExternalId?: string | null;
  importSourceUrl?: string | null;
  importedAt?: Date | null;
  lastSyncedAt?: Date | null;
  importDisabled?: boolean;
  sourcePortalKey?: string;
  sourcePortalLabel?: string;
  propertyTypeKey?: string;
  propertyTypeLabel?: string;
  importCategoryKey?: string;
  importCategoryLabel?: string;
  canGenerateShorts?: boolean;
  shortsGenerated?: boolean;
  shortsSourceType?: string | null;
  createdAt: Date;
  userId: string;
  user: { id: string; city: string | null };
  _count: { likes: number };
  likes?: { id: string }[];
  media?: Array<{
    id: string;
    url: string;
    type: string;
    sortOrder: number;
    originalUrl?: string | null;
    watermarkedUrl?: string | null;
  }>;
};

export type PropertyRowForAdmin = PropertyRowForApi & {
  deletedAt: Date | null;
  isActive: boolean;
  activeFrom: Date | null;
  activeUntil: Date | null;
  listingType: string;
  user: { id: string; email: string; city: string | null };
};

export function serializeAdminPropertyRow(
  r: PropertyRowForAdmin,
): Record<string, unknown> {
  const adminAccess: PropertyViewerAccess = {
    role: UserRole.ADMIN,
    isPremiumBroker: false,
    isAdmin: true,
  };
  const base = serializeProperty(
    {
      ...r,
      user: { id: r.user.id, city: r.user.city },
    },
    undefined,
    adminAccess,
  );
  return {
    ...base,
    deletedAt: r.deletedAt,
    isActive: r.isActive,
    activeFrom: r.activeFrom,
    activeUntil: r.activeUntil,
    listingType: r.listingType,
    authorEmail: r.user.email,
    listingStatus: computeListingPublicStatus({
      deletedAt: r.deletedAt,
      isActive: r.isActive,
      activeFrom: r.activeFrom,
      activeUntil: r.activeUntil,
      approved: r.approved,
    }),
  };
}

function shouldRedactOwnerContact(
  p: PropertyRowForApi,
  viewerId?: string,
  access?: PropertyViewerAccess,
): boolean {
  const isOwnerListing = Boolean(p.isOwnerListing);
  if (!isOwnerListing) return false;
  if (access?.isAdmin) return false;
  if (!viewerId) return true;
  if (viewerId === p.userId) return false;
  const premiumOk = access?.role === UserRole.AGENT && Boolean(access?.isPremiumBroker);
  if (p.ownerContactConsent && premiumOk) return false;
  return true;
}

function serializePropertyEmergency(
  p: Partial<PropertyRowForApi> & { id?: string },
  viewerId?: string,
  access?: PropertyViewerAccess,
): Record<string, unknown> {
  const redact = shouldRedactOwnerContact(p as PropertyRowForApi, viewerId, access);
  const pid = safeStr(p.id, 'unknown');
  const split = splitContactNameAndCompany(p.contactName);
  return {
    id: pid,
    title: safeStr(p.title, 'Inzerát'),
    description: safeStr(p.description, ''),
    price: safePriceField(p.price),
    currency: safeStr(p.currency, 'CZK'),
    type: safeStr(p.offerType, 'prodej'),
    offerType: safeStr(p.offerType, 'prodej'),
    propertyType: safeStr(p.propertyType, 'byt'),
    subType: safeStr(p.subType, ''),
    address: safeStr(p.address, ''),
    city: safeStr(p.city, ''),
    location: safeStr(p.city, ''),
    area: p.area != null && Number.isFinite(Number(p.area)) ? Number(p.area) : null,
    landArea:
      p.landArea != null && Number.isFinite(Number(p.landArea)) ? Number(p.landArea) : null,
    floor: p.floor != null && Number.isFinite(Number(p.floor)) ? Math.trunc(Number(p.floor)) : null,
    totalFloors:
      p.totalFloors != null && Number.isFinite(Number(p.totalFloors))
        ? Math.trunc(Number(p.totalFloors))
        : null,
    condition: p.condition ?? null,
    construction: p.construction ?? null,
    ownership: p.ownership ?? null,
    energyLabel: p.energyLabel ?? null,
    equipment: p.equipment ?? null,
    parking: Boolean(p.parking),
    cellar: Boolean(p.cellar),
    images: [],
    galleryImages: [],
    gallery: [],
    mainImage: null,
    thumbnail: null,
    coverImage: null,
    cover: null,
    photos: [],
    imageUrl: null,
    videoUrl: null,
    media: [],
    isOwnerListing: Boolean(p.isOwnerListing),
    ownerContactConsent: Boolean(p.ownerContactConsent),
    region: safeTrim(p.region),
    district: safeTrim(p.district),
    directContactVisible: !redact,
    contactName: redact ? '' : split.contactName,
    companyName: redact ? null : split.companyName,
    contactPhone: redact ? '' : safeStr(p.contactPhone, ''),
    contactEmail: redact ? '' : safeStr(p.contactEmail, ''),
    approved: Boolean(p.approved),
    publishedAt: safeDateIso(p.publishedAt),
    createdAt: safeDateIso(p.createdAt) ?? new Date(0).toISOString(),
    userId: safeStr(p.userId, ''),
    ownerCity: p.user?.city != null ? String(p.user.city) : null,
    likeCount: p._count?.likes != null && Number.isFinite(Number(p._count.likes))
      ? Math.max(0, Math.trunc(Number(p._count.likes)))
      : 0,
    liked: false,
    listingType: p.listingType ?? null,
    viewsCount: 0,
    autoViewsEnabled: false,
    autoViewsIncrement: 0,
    autoViewsIntervalMinutes: 0,
    lastAutoViewsAt: null,
    derivedFromPropertyId: p.derivedFromPropertyId ?? null,
    importSource: p.importSource ?? null,
    importMethod: p.importMethod ?? null,
    importExternalId: p.importExternalId ?? null,
    importSourceUrl: p.importSourceUrl ?? null,
    sourceUrl: p.importSourceUrl ?? null,
    sourcePortal: safeTrim(p.sourcePortalKey) || p.importSource || null,
    importedAt: safeDateIso(p.importedAt),
    lastSyncedAt: safeDateIso(p.lastSyncedAt),
    importDisabled: Boolean(p.importDisabled),
    sourcePortalKey: safeTrim(p.sourcePortalKey) || null,
    sourcePortalLabel: safeTrim(p.sourcePortalLabel) || null,
    propertyTypeKey: safeTrim(p.propertyTypeKey) || null,
    propertyTypeLabel: safeTrim(p.propertyTypeLabel) || null,
    importCategoryKey: safeTrim(p.importCategoryKey) || null,
    importCategoryLabel: safeTrim(p.importCategoryLabel) || null,
    canGenerateShorts: Boolean(p.canGenerateShorts),
    shortsGenerated: Boolean(p.shortsGenerated),
    shortsSourceType: p.shortsSourceType ?? null,
  };
}

function serializePropertyCore(
  p: PropertyRowForApi,
  viewerId?: string,
  access?: PropertyViewerAccess,
): Record<string, unknown> {
  const liked =
    viewerId != null &&
    Array.isArray(p.likes) &&
    p.likes.length > 0;

  const redact = shouldRedactOwnerContact(p, viewerId, access);

  const assetBase = resolveAssetBaseUrl();
  const images = (Array.isArray(p.images) ? p.images : [])
    .map((u) => (typeof u === 'string' ? sanitizeListingImageUrl(u, assetBase) : null))
    .filter((u): u is string => Boolean(u));
  const videoUrlRaw = p.videoUrl != null ? String(p.videoUrl) : '';
  const videoUrlSafe = videoUrlRaw ? secureAssetUrl(videoUrlRaw) : null;

  const mediaRowsRaw = asMediaObjectList(p.media as unknown)
    .filter((m) => pickMediaDisplayUrl(m).length > 0)
    .sort(
      (a, b) =>
        (Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0) -
        (Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0),
    );

  const mediaFromRelation = mediaRowsRaw
    .map((m) => {
      const displayUrl = pickMediaDisplayUrl(m);
      const typeRaw = typeof m.type === 'string' ? m.type.toLowerCase() : '';
      const isVideo = typeRaw === 'video';
      const urlRaw = secureAssetUrl(displayUrl);
      const url = isVideo
        ? urlRaw || null
        : sanitizeListingImageUrl(displayUrl, assetBase);
      return {
        id: safeStr(m.id, `${safeStr(p.id, 'x')}-m`),
        url: url ?? '',
        type: isVideo ? ('video' as const) : ('image' as const),
        order: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : 0,
        sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : 0,
      };
    })
    .filter((m) => Boolean(m.url));

  const fallbackMedia = [
    ...(videoUrlSafe
      ? [
          {
            id: `${safeStr(p.id, 'x')}-video`,
            url: videoUrlSafe,
            type: 'video' as const,
            order: 0,
            sortOrder: 0,
          },
        ]
      : []),
    ...images.map((url, index) => ({
      id: `${safeStr(p.id, 'x')}-image-${index}`,
      url,
      type: 'image' as const,
      order: index + 1,
      sortOrder: index + 1,
    })),
  ];

  type MediaRow = {
    id: string;
    url: string;
    type: 'video' | 'image';
    order: number;
    sortOrder: number;
  };
  const videoRows = mediaFromRelation.filter(
    (m): m is MediaRow => m.type === 'video' && Boolean(safeStr(m.url).trim()),
  );
  const relImageRows = mediaFromRelation.filter(
    (m): m is MediaRow => m.type === 'image' && Boolean(safeStr(m.url).trim()),
  );
  const seenImg = new Set(relImageRows.map((m) => safeStr(m.url).trim()));
  const extraImageRows: MediaRow[] = [];
  for (const url of images) {
    const k = safeStr(url).trim();
    if (!k || seenImg.has(k)) continue;
    seenImg.add(k);
    extraImageRows.push({
      id: `${safeStr(p.id, 'x')}-gallery-${extraImageRows.length}`,
      url: k,
      type: 'image',
      order: relImageRows.length + extraImageRows.length,
      sortOrder: relImageRows.length + extraImageRows.length,
    });
  }
  const mergedRows = [...videoRows, ...relImageRows, ...extraImageRows];
  const media =
    mergedRows.length > 0
      ? mergedRows.map((m, i) => ({ ...m, order: i, sortOrder: i }))
      : fallbackMedia;
  const primaryImage =
    getFirstValidImage(
      [
        ...media
          .filter((m) => m.type === 'image')
          .map((m) => m.url)
          .filter(Boolean),
        ...images,
      ],
      assetBase,
    ) ?? null;
  const primaryVideo =
    media.find((m) => m.type === 'video')?.url ?? videoUrlSafe;

  const photos = images.map((url) => ({ url }));
  const gallery = [...images];

  const priceOut = safePriceField(p.price);
  const split = splitContactNameAndCompany(p.contactName);

  return {
    id: safeStr(p.id, ''),
    title: safeStr(p.title, ''),
    description: safeStr(p.description, ''),
    price: priceOut,
    currency: safeStr(p.currency, 'CZK'),
    type: safeStr(p.offerType, 'prodej'),
    offerType: safeStr(p.offerType, 'prodej'),
    propertyType: safeStr(p.propertyType, 'byt'),
    subType: safeStr(p.subType, ''),
    address: safeStr(p.address, ''),
    city: safeStr(p.city, ''),
    location: safeStr(p.city, ''),
    area: p.area != null && Number.isFinite(Number(p.area)) ? Number(p.area) : null,
    landArea:
      p.landArea != null && Number.isFinite(Number(p.landArea)) ? Number(p.landArea) : null,
    floor: p.floor != null && Number.isFinite(Number(p.floor)) ? Math.trunc(Number(p.floor)) : null,
    totalFloors:
      p.totalFloors != null && Number.isFinite(Number(p.totalFloors))
        ? Math.trunc(Number(p.totalFloors))
        : null,
    condition: p.condition ?? null,
    construction: p.construction ?? null,
    ownership: p.ownership ?? null,
    energyLabel: p.energyLabel ?? null,
    equipment: p.equipment ?? null,
    parking: Boolean(p.parking),
    cellar: Boolean(p.cellar),
    images,
    galleryImages: [...images],
    gallery,
    mainImage: primaryImage,
    thumbnail: primaryImage,
    coverImage: primaryImage,
    cover: primaryImage,
    photos,
    imageUrl: primaryImage,
    videoUrl: primaryVideo ? secureAssetUrl(String(primaryVideo)) : null,
    media,
    isOwnerListing: Boolean(p.isOwnerListing),
    ownerContactConsent: Boolean(p.ownerContactConsent),
    region: safeTrim(p.region),
    district: safeTrim(p.district),
    directContactVisible: !redact,
    contactName: redact ? '' : split.contactName,
    companyName: redact ? null : split.companyName,
    contactPhone: redact ? '' : safeStr(p.contactPhone, ''),
    contactEmail: redact ? '' : safeStr(p.contactEmail, ''),
    approved: Boolean(p.approved),
    publishedAt: safeDateIso(p.publishedAt),
    createdAt: safeDateIso(p.createdAt) ?? new Date(0).toISOString(),
    userId: safeStr(p.userId, ''),
    ownerCity: p.user?.city != null ? String(p.user.city) : null,
    likeCount: p._count?.likes != null && Number.isFinite(Number(p._count.likes))
      ? Math.max(0, Math.trunc(Number(p._count.likes)))
      : 0,
    liked,
    listingType: p.listingType ?? null,
    viewsCount: Math.max(0, Math.trunc(Number(p.viewsCount ?? 0))),
    autoViewsEnabled: Boolean(p.autoViewsEnabled),
    autoViewsIncrement: Math.max(0, Math.trunc(Number(p.autoViewsIncrement ?? 0))),
    autoViewsIntervalMinutes: Math.max(0, Math.trunc(Number(p.autoViewsIntervalMinutes ?? 0))),
    lastAutoViewsAt: safeDateIso(p.lastAutoViewsAt),
    derivedFromPropertyId: p.derivedFromPropertyId ?? null,
    importSource: p.importSource ?? null,
    importMethod: p.importMethod ?? null,
    importExternalId: p.importExternalId ?? null,
    importSourceUrl: p.importSourceUrl ?? null,
    sourceUrl: p.importSourceUrl ?? null,
    sourcePortal: safeTrim(p.sourcePortalKey) || p.importSource || null,
    importedAt: safeDateIso(p.importedAt),
    lastSyncedAt: safeDateIso(p.lastSyncedAt),
    importDisabled: Boolean(p.importDisabled),
    sourcePortalKey: safeTrim(p.sourcePortalKey) || null,
    sourcePortalLabel: safeTrim(p.sourcePortalLabel) || null,
    propertyTypeKey: safeTrim(p.propertyTypeKey) || null,
    propertyTypeLabel: safeTrim(p.propertyTypeLabel) || null,
    importCategoryKey: safeTrim(p.importCategoryKey) || null,
    importCategoryLabel: safeTrim(p.importCategoryLabel) || null,
    canGenerateShorts: Boolean(p.canGenerateShorts),
    shortsGenerated: Boolean(p.shortsGenerated),
    shortsSourceType: p.shortsSourceType ?? null,
  };
}

export function serializeProperty(
  p: PropertyRowForApi,
  viewerId?: string,
  access?: PropertyViewerAccess,
): Record<string, unknown> {
  try {
    const out = serializePropertyCore(p, viewerId, access);
    if (process.env.LISTING_DETAIL_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log('PROPERTY SERIALIZE OK', {
        id: out.id,
        price: out.price,
        imagesLen: Array.isArray(out.images) ? (out.images as unknown[]).length : 0,
        galleryLen: Array.isArray(out.gallery) ? (out.gallery as unknown[]).length : 0,
        mediaLen: Array.isArray(out.media) ? (out.media as unknown[]).length : 0,
      });
    }
    return out;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('SERIALIZE_PROPERTY_ERROR', p?.id, e);
    return serializePropertyEmergency(p, viewerId, access);
  }
}
