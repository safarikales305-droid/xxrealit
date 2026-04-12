/** Společný include pro Property + social (likes) — používá PropertiesService i ShortsListingService. */
export const socialInclude = (viewerId?: string) =>
  viewerId
    ? {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      }
    : {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      };
