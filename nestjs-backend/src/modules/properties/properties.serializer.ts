import { UserRole } from '@prisma/client';
import { computeListingPublicStatus } from './property-public-visibility';

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
  price: number;
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
  isOwnerListing?: boolean;
  ownerContactConsent?: boolean;
  region?: string;
  district?: string;
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

  const images = Array.isArray(p.images) ? p.images : [];
  const mediaFromRelation = Array.isArray(p.media)
    ? p.media
        .filter((m) => typeof m?.url === 'string' && m.url.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
          id: m.id,
          url: m.url,
          type: m.type === 'video' ? 'video' : 'image',
          order: m.sortOrder,
          sortOrder: m.sortOrder,
        }))
    : [];
  const fallbackMedia = [
    ...(p.videoUrl
      ? [{ id: `${p.id}-video`, url: p.videoUrl, type: 'video', order: 0, sortOrder: 0 }]
      : []),
    ...images.map((url, index) => ({
      id: `${p.id}-image-${index}`,
      url,
      type: 'image' as const,
      order: index + 1,
      sortOrder: index + 1,
    })),
  ];
  const media = mediaFromRelation.length > 0 ? mediaFromRelation : fallbackMedia;
  const primaryImage = media.find((m) => m.type === 'image')?.url ?? images[0] ?? null;
  const primaryVideo = media.find((m) => m.type === 'video')?.url ?? p.videoUrl;

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
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
    imageUrl: primaryImage,
    videoUrl: primaryVideo,
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
    createdAt: p.createdAt,
    userId: p.userId,
    ownerCity: p.user?.city ?? null,
    likeCount: p._count.likes,
    liked,
  };
}
