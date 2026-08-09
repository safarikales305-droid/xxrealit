export type NormalizedAccommodationPhoto = {
  url: string;
  alt: string | null;
};

export type NormalizedAccommodationRoom = {
  code: string;
  name: string;
  description: string | null;
  capacity: number;
  priceFrom: number | null;
  currency: string;
  boardType: string | null;
  available: boolean;
};

export type NormalizedAccommodation = {
  id: string;
  provider: 'HOTELBEDS';
  providerId: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  category: string | null;
  type: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  address: string | null;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  photos: NormalizedAccommodationPhoto[];
  facilities: string[];
  rooms: NormalizedAccommodationRoom[];
  boardTypes: string[];
  priceFrom: number | null;
  priceFromOriginal: number | null;
  currency: string;
  originalCurrency: string;
  priceUnit: string;
  available: boolean;
  cancellationPolicy: string | null;
  checkIn: string;
  checkOut: string;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  sourceEnvironment: 'TEST';
  amenities: string[];
  tags: string[];
  wifi: boolean;
  parking: boolean;
  breakfast: boolean;
  wellness: boolean;
  pool: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  coverPhoto: string | null;
  xxrealitCategory: string;
  contentEnriched: boolean;
  petsAllowed: boolean;
  accessible: boolean;
};

export type HotelbedsSearchQuery = {
  destination?: string;
  latitude?: number;
  longitude?: number;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  rooms?: number;
  page?: number;
  limit?: number;
  starsMin?: number;
  priceMax?: number;
  category?: string;
  wifi?: boolean;
  parking?: boolean;
  breakfast?: boolean;
  wellness?: boolean;
  pool?: boolean;
  pets?: boolean;
  accessible?: boolean;
  ratingMin?: number;
};

export type HotelbedsSearchResponse = {
  items: NormalizedAccommodation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  checkIn: string;
  checkOut: string;
  destination: string;
  source: 'HOTELBEDS';
};

export type HotelbedsPublicConfig = {
  publicListings: boolean;
  bookingEnabled: boolean;
  environment: string;
  contentApiAvailable: boolean;
};
