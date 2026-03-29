export type PropertyRowForApi = {
  id: string;
  title: string;
  price: number;
  city: string;
  videoUrl: string | null;
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

  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: p.city,
    city: p.city,
    videoUrl: p.videoUrl,
    createdAt: p.createdAt,
    userId: p.userId,
    ownerCity: p.user?.city ?? null,
    likeCount: p._count.likes,
    liked,
  };
}
