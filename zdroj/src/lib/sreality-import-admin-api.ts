import { API_BASE_URL } from './api';

export type SrealityBrokerMatchStatus = 'EXISTING_PROFILE' | 'NEW_IMPORTED_CONTACT' | 'NOT_FOUND';

export type SrealityImportPreviewResponse = {
  draftId: string;
  duplicate: {
    isDuplicate: boolean;
    propertyId?: string;
    importedAt?: string;
  };
  prefill: Record<string, unknown>;
  broker: {
    agentName: string | null;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    photoUrl: string | null;
    logoUrl: string | null;
    profileUrl: string | null;
    sourceExternalId: string | null;
  };
  brokerMatchStatus: SrealityBrokerMatchStatus;
  matchedBrokerContactId: string | null;
  matchedBrokerContact: {
    id: string;
    fullName: string;
    companyName: string;
    email: string | null;
    phone: string | null;
  } | null;
  images: Array<{
    sourceUrl: string;
    storedUrl: string | null;
    watermarkedUrl: string | null;
    sortOrder: number;
    isMain: boolean;
    error?: string;
  }>;
  imageImportStats: {
    requested: number;
    downloaded: number;
    failed: number;
    message: string;
  };
  aiText: {
    originalTitle: string | null;
    originalDescription: string | null;
    rewrittenTitle: string | null;
    rewrittenDescription: string | null;
    skipped?: boolean;
    reason?: string;
  };
  sourceExternalId: string | null;
  sourceUrl: string;
  diagnostics?: {
    sourceParser: string;
    dynamicPage: string;
    gallery: string;
    galleryCount: number;
    imagesDownloaded: string;
    imagesDownloadedCount: number;
    imagesFailedCount: number;
    agent: string;
    phone: string;
    email: string;
    contactClick: string;
    storage: string;
    storageCount: number;
    browserFallback: string;
  };
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
  images: Array<{
    storedUrl: string;
    watermarkedUrl?: string | null;
    sortOrder: number;
    isMain: boolean;
  }>;
  settings?: {
    createAiReel?: boolean;
    publishFacebook?: boolean;
    publishInstagram?: boolean;
    publishYoutube?: boolean;
    publishShorts?: boolean;
  };
};

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | { message?: string } };
    const msg =
      typeof body.message === 'string'
        ? body.message
        : typeof body.message === 'object' && body.message?.message
          ? body.message.message
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function nestAdminSrealityImportPreview(
  token: string,
  sourceUrl: string,
): Promise<SrealityImportPreviewResponse> {
  return adminFetch(token, '/admin/sreality-import/preview', {
    method: 'POST',
    body: JSON.stringify({ sourceUrl }),
  });
}

export function nestAdminSrealityImportPublish(
  token: string,
  draftId: string,
  payload: SrealityImportPublishPayload,
): Promise<{ propertyId: string; createAiReel: boolean; aiReelJobId: string | null }> {
  return adminFetch(token, `/admin/sreality-import/draft/${encodeURIComponent(draftId)}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function nestAdminSrealityImportUpdateDraft(
  token: string,
  draftId: string,
  payload: Partial<SrealityImportPublishPayload>,
): Promise<unknown> {
  return adminFetch(token, `/admin/sreality-import/draft/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
