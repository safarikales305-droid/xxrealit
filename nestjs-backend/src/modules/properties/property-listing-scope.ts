import { ListingImportPortal, Prisma } from '@prisma/client';
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

/** Veřejné Shorts — jen typ SHORTS, schválené, živé, s videem. */
export const publicShortPropertyWhere: Prisma.PropertyWhereInput = {
  AND: [
    approvedAndVisible,
    { listingType: 'SHORTS' },
    { OR: videoListingDisjuncts },
  ],
};

/** Klasik — bez videa (stejná logika jako dřív). */
export const classicListingWhere: Prisma.PropertyWhereInput = {
  NOT: { OR: videoListingDisjuncts },
};

/**
 * Staré / rozbité Reality.cz importy (bez fotky nebo s podezřelou cenou pod 1000 Kč)
 * nepatří na homepage — zůstanou v DB pro admina, ale veřejný feed je skryje.
 */
const hideBrokenRealityImports: Prisma.PropertyWhereInput = {
  NOT: {
    AND: [
      { importSource: ListingImportPortal.reality_cz },
      {
        OR: [
          { images: { equals: [] } },
          { AND: [{ price: { not: null } }, { price: { lt: 1000 } }] },
        ],
      },
    ],
  },
};

/** Klasické inzeráty veřejně viditelné (feed / GET /properties). */
export const classicPublicListingWhere: Prisma.PropertyWhereInput = {
  AND: [
    classicListingWhere,
    approvedAndVisible,
    /** Klasik výpis = explicitně CLASSIC (SHORTS patří do shorts feedu). */
    { listingType: 'CLASSIC' },
    /** Ručně vypnutý import — i kdyby zůstalo isActive true, neveřejný výpis. */
    { importDisabled: false },
    hideBrokenRealityImports,
  ],
};

/** Všechny schválené živé inzeráty (shorts i klasik) — veřejný profil makléře. */
export const anyPublicListingWhere: Prisma.PropertyWhereInput = approvedAndVisible;
