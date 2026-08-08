export type AccommodationSearchParams = {
  query?: string;
  city?: string;
  region?: string;
  type?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  starsMin?: number;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  page?: number;
  limit?: number;
  wifi?: boolean;
  parking?: boolean;
  breakfast?: boolean;
  wellness?: boolean;
  pool?: boolean;
  pets?: boolean;
  accessible?: boolean;
};

export type AccommodationProviderItem = {
  externalId: string;
  slug: string;
  type: string;
  name: string;
  shortDescription?: string;
  description?: string;
  country?: string;
  region?: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  priceFrom?: number;
  currency?: string;
  priceUnit?: string;
  amenities?: string[];
  tags?: string[];
  photos?: Array<{ url: string; alt?: string; isCover?: boolean }>;
  facilities?: Array<{ name: string; icon?: string }>;
};

export type AccommodationAvailabilityResult = {
  available: boolean;
  priceFrom?: number;
  currency?: string;
  roomsLeft?: number;
};

export type AccommodationSyncBatchResult = {
  items: AccommodationProviderItem[];
  nextCursor?: string;
  hasMore: boolean;
};

export interface AccommodationProviderInterface {
  readonly id: string;
  readonly label: string;
  isConfigured(): Promise<boolean>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  search(params: AccommodationSearchParams): Promise<AccommodationProviderItem[]>;
  getDetails(externalId: string): Promise<AccommodationProviderItem | null>;
  getAvailability(
    externalId: string,
    checkIn: string,
    checkOut: string,
    guests?: number,
  ): Promise<AccommodationAvailabilityResult>;
  getPrices(
    externalId: string,
    checkIn: string,
    checkOut: string,
    guests?: number,
  ): Promise<{ priceFrom: number; currency: string } | null>;
  fetchBatch(cursor?: string, limit?: number): Promise<AccommodationSyncBatchResult>;
}
