import { Prisma } from '@prisma/client';
import { publiclyVisiblePropertyWhere } from './property-public-visibility';

const videoListingDisjuncts: Prisma.PropertyWhereInput[] = [
  { media: { some: { type: 'video' } } },
  {
    AND: [{ videoUrl: { not: null } }, { NOT: { videoUrl: '' } }],
  },
];

const approvedAndVisible: Prisma.PropertyWhereInput = {
  AND: [{ approved: true }, publiclyVisiblePropertyWhere()],
};

/** Veřejné Shorts — schválené, živé, s videem. */
export const publicShortPropertyWhere: Prisma.PropertyWhereInput = {
  AND: [
    approvedAndVisible,
    { OR: videoListingDisjuncts },
  ],
};

/** Klasik — bez videa (stejná logika jako dřív). */
export const classicListingWhere: Prisma.PropertyWhereInput = {
  NOT: { OR: videoListingDisjuncts },
};

/** Klasické inzeráty veřejně viditelné (feed / GET /properties). */
export const classicPublicListingWhere: Prisma.PropertyWhereInput = {
  AND: [classicListingWhere, approvedAndVisible],
};
