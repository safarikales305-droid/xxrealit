export type HotelbedsContentMeta = {
  fetchedAt: string;
  source: 'CONTENT_API' | 'CACHE';
  imagesCount: number;
  hotelCode: number;
};

export type HotelbedsDebugImageSource =
  | 'HOTELBEDS_CONTENT_API'
  | 'HOTELBEDS_CACHE'
  | 'DATABASE_CACHE'
  | 'BOOKING_API'
  | 'FALLBACK'
  | 'NONE';

export type HotelbedsDebugContentSource =
  | 'CONTENT_API'
  | 'CACHE'
  | 'DATABASE'
  | 'BOOKING_ONLY'
  | 'NONE';

export type HotelbedsDebugSource = {
  contentSource: HotelbedsDebugContentSource;
  imageSource: HotelbedsDebugImageSource;
  contentApiStatus: number | null;
  contentFetchedAt: string | null;
  cacheHit: boolean;
  dbHit: boolean;
  fallbackUsed: boolean;
};

export type HotelbedsContentHistoryRow = {
  at: string;
  hotelIds: number[];
  endpoint: string;
  httpStatus: number;
  imagesCount: number;
  source: string;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
};
