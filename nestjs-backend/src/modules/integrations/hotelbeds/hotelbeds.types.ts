export type HotelbedsTestConnectionResult = {
  success: boolean;
  provider: 'Hotelbeds';
  environment: string;
  status: number;
  responseTimeMs: number;
  message: string;
  errorCode?: string;
};

export type HotelbedsTestSearchResult = {
  success: boolean;
  provider: 'Hotelbeds';
  environment: string;
  status: number;
  responseTimeMs: number;
  message: string;
  hotelsFound?: number;
  sample?: Array<{ code?: string; name?: string; categoryCode?: string }>;
};

export type HotelbedsTestContentResult = {
  success: boolean;
  hotelCode: number;
  httpStatus: number;
  name: string | null;
  descriptionExists: boolean;
  imagesCount: number;
  facilitiesCount: number;
  category: string | null;
  language: string | null;
  addressExists: boolean;
  coordinatesExist: boolean;
  error?: string;
};

export type HotelbedsStatusPayload = {
  auditData?: { processTime?: number };
  hotels?: { total?: number };
  [key: string]: unknown;
};
