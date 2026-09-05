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

export type SrealityImageImportStats = {
  requested: number;
  downloaded: number;
  failed: number;
  uploaded?: number;
  message: string;
};

export type SrealityImportDiagnosticStage = 'PASS' | 'FAIL' | 'NOT_REQUIRED' | 'NOT_PUBLIC' | 'PARTIAL';

export type SrealityImportDiagnostics = {
  sourceParser: SrealityImportDiagnosticStage;
  dynamicPage: SrealityImportDiagnosticStage;
  gallery: SrealityImportDiagnosticStage;
  galleryCount: number;
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
