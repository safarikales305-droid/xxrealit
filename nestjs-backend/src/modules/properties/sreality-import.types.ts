import type { SrealityBrokerPrefill } from './sreality-broker-extract.util';
import type { SrealityListingPrefill } from './sreality-listing-prefill.util';

export type SrealityBrokerMatchStatus = 'EXISTING_PROFILE' | 'NEW_IMPORTED_CONTACT' | 'NOT_FOUND';

export type SrealityImportImageRow = {
  sourceUrl: string;
  storedUrl: string | null;
  watermarkedUrl: string | null;
  sortOrder: number;
  isMain: boolean;
  error?: string;
};

export type SrealityImageCaptureMethod =
  | 'DIRECT_HTTP'
  | 'BROWSER_RESPONSE'
  | 'BROWSER_CONTEXT'
  | 'DOM_BLOB'
  | 'ELEMENT_CAPTURE';

export type SrealityImageDownloadFailureDiag = {
  index: number;
  host: string;
  hostValidation?: 'PASS' | 'FAIL';
  httpStatus: number | null;
  contentType: string | null;
  responseLength: number | null;
  redirectHost: string | null;
  error: string;
  urlSample: string;
  sourceUrl?: string;
  selectedUrl?: string;
  captureMethod?: SrealityImageCaptureMethod;
  directHttpStatus?: number | null;
  browserResponse?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  browserContext?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  domBlob?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  elementCapture?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  mime?: string | null;
  bytes?: number | null;
  dimensions?: string | null;
  storage?: 'UPLOADED' | 'FAILED' | 'PENDING';
};

export type SrealityImageImportStats = {
  found: number;
  requested: number;
  downloaded: number;
  failed: number;
  uploaded?: number;
  uploadAttempted?: number;
  maxImagesLimit: number;
  message: string;
  imageDownloadFailures?: SrealityImageDownloadFailureDiag[];
  directHttpSuccess?: number;
  browserResponseSuccess?: number;
  browserContextSuccess?: number;
  domBlobSuccess?: number;
  elementCaptureSuccess?: number;
  captureMethods?: Partial<Record<SrealityImageCaptureMethod, number>>;
};

export type SrealityImportDiagnosticStage =
  | 'PASS'
  | 'FAIL'
  | 'NOT_REQUIRED'
  | 'NOT_PUBLIC'
  | 'PARTIAL'
  | 'NOT_REACHED';

export type SrealityImportDiagnostics = {
  sourceParser: SrealityImportDiagnosticStage;
  dynamicPage: SrealityImportDiagnosticStage;
  gallery: SrealityImportDiagnosticStage;
  galleryCount: number;
  imagesSelectedCount: number;
  imagesDownloaded: SrealityImportDiagnosticStage;
  imagesDownloadedCount: number;
  imagesFailedCount: number;
  agent: SrealityImportDiagnosticStage;
  phone: SrealityImportDiagnosticStage;
  email: SrealityImportDiagnosticStage;
  contactClick: SrealityImportDiagnosticStage;
  storage: SrealityImportDiagnosticStage;
  storageCount: number;
  browserFallback: SrealityImportDiagnosticStage;
  browser: 'READY' | 'FAIL' | 'NOT_TESTED';
  pageData?: 'STATIC_OK' | 'DYNAMIC_OK' | 'FAIL';
  imageAcquisition?: 'BROWSER_REQUIRED' | 'DIRECT_HTTP';
  dynamicEnrichment?: SrealityImportDiagnosticStage;
  browserError?: string;
  imageDownloadFailures?: SrealityImageDownloadFailureDiag[];
};

export type SrealityAiTextPayload = {
  originalTitle: string | null;
  originalDescription: string | null;
  rewrittenTitle: string | null;
  rewrittenDescription: string | null;
  skipped?: boolean;
  reason?: string;
};

export type SrealityImportPreview = {
  draftId: string;
  duplicate: {
    isDuplicate: boolean;
    propertyId?: string;
    importedAt?: string;
  };
  prefill: SrealityListingPrefill;
  broker: SrealityBrokerPrefill;
  brokerMatchStatus: SrealityBrokerMatchStatus;
  matchedBrokerContactId: string | null;
  matchedBrokerContact: {
    id: string;
    fullName: string;
    companyName: string;
    email: string | null;
    phone: string | null;
  } | null;
  images: SrealityImportImageRow[];
  imageImportStats: SrealityImageImportStats;
  aiText: SrealityAiTextPayload;
  sourceExternalId: string | null;
  sourceUrl: string;
  diagnostics?: SrealityImportDiagnostics;
};

export type SrealityImportPublishSettings = {
  createAiReel?: boolean;
  publishFacebook?: boolean;
  publishInstagram?: boolean;
  publishYoutube?: boolean;
  publishShorts?: boolean;
};

export type SrealityImportPublishPayload = {
  title: string;
  description: string;
  offerType: string;
  propertyType: string;
  subType?: string;
  price?: number | null;
  currency?: string;
  city: string;
  district?: string;
  region?: string;
  address?: string;
  area?: number | null;
  landArea?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  condition?: string;
  construction?: string;
  ownership?: string;
  energyLabel?: string;
  equipment?: string;
  parking?: boolean;
  cellar?: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  images: Array<{ storedUrl: string; watermarkedUrl?: string | null; sortOrder: number; isMain: boolean }>;
  brokerMatchStatus?: SrealityBrokerMatchStatus;
  useNewBroker?: boolean;
  settings?: SrealityImportPublishSettings;
};

export type SrealityImportUpdateDiff = {
  priceChanged: boolean;
  descriptionChanged: boolean;
  parametersChanged: boolean;
  imagesChanged: boolean;
  brokerChanged: boolean;
  oldPrice: number | null;
  newPrice: number | null;
  brokerChange?: {
    current: SrealityBrokerPrefill;
    incoming: SrealityBrokerPrefill;
  };
};
