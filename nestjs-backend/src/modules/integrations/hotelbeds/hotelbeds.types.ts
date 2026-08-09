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

export type HotelbedsStatusPayload = {
  auditData?: { processTime?: number };
  hotels?: { total?: number };
  [key: string]: unknown;
};
