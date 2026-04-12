import { computeListingPublicStatus } from './property-public-visibility';

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
  const base = serializeProperty(
    {
      ...r,
      user: { id: r.user.id, city: r.user.city },
    },
    undefined,
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

export function serializeProperty(
  p: PropertyRowForApi,
  viewerId?: string,
): Record<string, unknown> {
  const liked =
    viewerId != null &&
    Array.isArray(p.likes) &&
    p.likes.length > 0;

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
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    approved: p.approved,
    createdAt: p.createdAt,
    userId: p.userId,
    ownerCity: p.user?.city ?? null,
    likeCount: p._count.likes,
    liked,
  };
}
