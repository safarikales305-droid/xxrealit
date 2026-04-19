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

export function serializeProperty(
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
  const videoUrlSafe = p.videoUrl ? secureAssetUrl(p.videoUrl) : null;
  const mediaFromRelation = Array.isArray(p.media)
    ? p.media
        .filter((m) => typeof m?.url === 'string' && m.url.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => {
          const isVideo = m.type === 'video';
          const urlRaw = secureAssetUrl(m.url);
          const url = isVideo
            ? urlRaw || null
            : sanitizeListingImageUrl(m.url, assetBase);
          return {
            id: m.id,
            url: url ?? '',
            type: isVideo ? ('video' as const) : ('image' as const),
            order: m.sortOrder,
            sortOrder: m.sortOrder,
          };
        })
        .filter((m) => Boolean(m.url))
    : [];
  const fallbackMedia = [
    ...(videoUrlSafe
      ? [
          {
            id: `${p.id}-video`,
            url: videoUrlSafe,
            type: 'video' as const,
            order: 0,
            sortOrder: 0,
          },
        ]
      : []),
    ...images.map((url, index) => ({
      id: `${p.id}-image-${index}`,
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
    (m): m is MediaRow => m.type === 'video' && Boolean(m.url?.trim()),
  );
  const relImageRows = mediaFromRelation.filter(
    (m): m is MediaRow => m.type === 'image' && Boolean(m.url?.trim()),
  );
  const seenImg = new Set(relImageRows.map((m) => m.url.trim()));
  const extraImageRows: MediaRow[] = [];
  for (const url of images) {
    const k = url.trim();
    if (!k || seenImg.has(k)) continue;
    seenImg.add(k);
    extraImageRows.push({
      id: `${p.id}-gallery-${extraImageRows.length}`,
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
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price ?? null,
    currency: p.currency,
    type: p.offerType,
    offerType: p.offerType,
    propertyType: p.propertyType,
    subType: p.subType,
    address: p.address,
    city: p.city,
    location: p.city,
    area: p.area,
    landArea: p.landArea,
    floor: p.floor,
    totalFloors: p.totalFloors,
    condition: p.condition,
    construction: p.construction,
    ownership: p.ownership,
    energyLabel: p.energyLabel,
    equipment: p.equipment,
    parking: p.parking,
    cellar: p.cellar,
    images,
    thumbnail: primaryImage,
    coverImage: primaryImage,
    cover: primaryImage,
    photos,
    imageUrl: primaryImage,
    videoUrl: primaryVideo ? secureAssetUrl(String(primaryVideo)) : null,
    media,
    isOwnerListing: Boolean(p.isOwnerListing),
    ownerContactConsent: Boolean(p.ownerContactConsent),
    region: (p.region ?? '').trim(),
    district: (p.district ?? '').trim(),
    directContactVisible: !redact,
    contactName: redact ? '' : p.contactName,
    contactPhone: redact ? '' : p.contactPhone,
    contactEmail: redact ? '' : p.contactEmail,
    approved: p.approved,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt,
    userId: p.userId,
    ownerCity: p.user?.city ?? null,
    likeCount: p._count?.likes ?? 0,
    liked,
    listingType: p.listingType ?? null,
    viewsCount: Math.max(0, Math.trunc(p.viewsCount ?? 0)),
    autoViewsEnabled: Boolean(p.autoViewsEnabled),
    autoViewsIncrement: Math.max(0, Math.trunc(p.autoViewsIncrement ?? 0)),
    autoViewsIntervalMinutes: Math.max(0, Math.trunc(p.autoViewsIntervalMinutes ?? 0)),
    lastAutoViewsAt: p.lastAutoViewsAt ? p.lastAutoViewsAt.toISOString() : null,
    derivedFromPropertyId: p.derivedFromPropertyId ?? null,
    importSource: p.importSource ?? null,
    importMethod: p.importMethod ?? null,
    importExternalId: p.importExternalId ?? null,
    importSourceUrl: p.importSourceUrl ?? null,
    importedAt: p.importedAt ? p.importedAt.toISOString() : null,
    lastSyncedAt: p.lastSyncedAt ? p.lastSyncedAt.toISOString() : null,
    importDisabled: Boolean(p.importDisabled),
    sourcePortalKey: (p.sourcePortalKey ?? '').trim() || null,
    sourcePortalLabel: (p.sourcePortalLabel ?? '').trim() || null,
    propertyTypeKey: (p.propertyTypeKey ?? '').trim() || null,
    propertyTypeLabel: (p.propertyTypeLabel ?? '').trim() || null,
    importCategoryKey: (p.importCategoryKey ?? '').trim() || null,
    importCategoryLabel: (p.importCategoryLabel ?? '').trim() || null,
    canGenerateShorts: Boolean(p.canGenerateShorts),
    shortsGenerated: Boolean(p.shortsGenerated),
    shortsSourceType: p.shortsSourceType ?? null,
  };
}
