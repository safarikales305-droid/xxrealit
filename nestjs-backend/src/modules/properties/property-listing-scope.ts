import { Prisma } from '@prisma/client';

const videoListingDisjuncts: Prisma.PropertyWhereInput[] = [
  { media: { some: { type: 'video' } } },
  {
    AND: [
      { videoUrl: { not: null } },
      { NOT: { videoUrl: '' } },
    ],
  },
];

/** Veřejné Shorts — schválené inzeráty s videem. */
export const publicShortPropertyWhere: Prisma.PropertyWhereInput = {
  AND: [{ approved: true }, { OR: videoListingDisjuncts }],
};

/** Klasik — bez videa. */
export const classicListingWhere: Prisma.PropertyWhereInput = {
  NOT: { OR: videoListingDisjuncts },
};
