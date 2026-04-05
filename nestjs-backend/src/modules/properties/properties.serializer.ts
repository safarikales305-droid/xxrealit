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
  createdAt: Date;
  userId: string;
  user: { id: string; city: string | null };
  _count: { likes: number };
  likes?: { id: string }[];
};

export function serializeProperty(
  p: PropertyRowForApi,
  viewerId?: string,
): Record<string, unknown> {
  const liked =
    viewerId != null &&
    Array.isArray(p.likes) &&
    p.likes.length > 0;

  const images = Array.isArray(p.images) ? p.images : [];

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
    imageUrl: images[0] ?? null,
    videoUrl: p.videoUrl,
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
