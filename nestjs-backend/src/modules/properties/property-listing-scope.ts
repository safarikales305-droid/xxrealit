import { Prisma } from '@prisma/client';
import { importedListingPubliclyVisibleWhere } from './property-import-branch-visibility';
import {
  publiclyActiveListingWhere,
  publiclyVisiblePropertyWhere,
} from './property-public-visibility';

const videoListingDisjuncts: Prisma.PropertyWhereInput[] = [
  { media: { some: { type: 'video' } } },
  {
    AND: [{ videoUrl: { not: null } }, { NOT: { videoUrl: '' } }],
  },
];

const approvedAndVisible: Prisma.PropertyWhereInput = publiclyActiveListingWhere();

/** Veřejné Shorts — jen typ SHORTS, schválené, živé, s videem. */
export const publicShortPropertyWhere: Prisma.PropertyWhereInput = {
  AND: [
    approvedAndVisible,
    importedListingPubliclyVisibleWhere,
    { listingType: 'SHORTS' },
    { OR: videoListingDisjuncts },
  ],
};

/**
 * Klasik = stejně jako štítek v adminu („Klasik“ pro vše co není SHORTS).
 * Podporuje CLASSIC, classic, Klasik i prázdný/legacy listingType.
 */
/** Admin UI: „Klasik“ = vše kromě listingType SHORTS. */
const classicListingTypeWhere: Prisma.PropertyWhereInput = {
  NOT: { listingType: { equals: 'SHORTS', mode: 'insensitive' } },
};

/** Klasické inzeráty veřejně viditelné (feed / GET /properties). */
export const classicPublicListingWhere: Prisma.PropertyWhereInput = {
  AND: [
    approvedAndVisible,
    importedListingPubliclyVisibleWhere,
    classicListingTypeWhere,
  ],
};

/** Všechny schválené živé inzeráty (shorts i klasik) — veřejný profil makléře. */
export const anyPublicListingWhere: Prisma.PropertyWhereInput = {
  AND: [approvedAndVisible, importedListingPubliclyVisibleWhere],
};
