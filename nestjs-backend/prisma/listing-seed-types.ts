/** Společný tvar vstupu pro `prisma/seed.ts` a generátory datasetů. */
export type MediaJson = {
  url: string;
  type: string;
  sortOrder?: number;
  order?: number;
};

export type ListingJson = {
  title: string;
  description?: string;
  price: number;
  city: string;
  address?: string;
  approved?: boolean;
  propertyType?: string;
  offerType?: string;
  subType?: string;
  area?: number;
  landArea?: number;
  floor?: number;
  totalFloors?: number;
  condition?: string;
  construction?: string;
  ownership?: string;
  energyLabel?: string;
  equipment?: string;
  parking?: boolean;
  cellar?: boolean;
  videoUrl?: string | null;
  images?: string[];
  media?: MediaJson[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  currency?: string;
  status?: string;
  /** ISO 8601 — volitelné pro rozprostření inzerátů v čase */
  createdAt?: string;
};
