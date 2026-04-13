'use client';

import { API_BASE_URL, getClientTokenFromCookie } from '@/lib/api';

function getStoredToken(): string | null {
  return getClientTokenFromCookie();
}

export function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function nestAuthHeaders(token: string | null): HeadersInit {
  if (token && token.length > 0) {
    return { Authorization: `Bearer ${token}` };
  }
  return getAuthHeaders();
}

export function nestApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

/** Čitelná zpráva z Nest JSON těla (`message` / `error`), ne jen „Internal server error“. */
export function nestApiErrorBodyMessage(
  status: number,
  data: unknown,
  fallback: string,
): string {
  if (data == null || typeof data !== 'object') {
    if (status === 413) return 'Soubor je příliš velký.';
    if (status >= 500) {
      return 'Server dočasně neodpovídá. Zkuste to prosím znovu nebo zkontrolujte log backendu.';
    }
    return fallback;
  }
  const o = data as Record<string, unknown>;
  const m = o.message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (Array.isArray(m)) {
    const parts = m.filter((x): x is string => typeof x === 'string');
    if (parts.length) return parts.join(', ');
  }
  const err = o.error;
  if (typeof err === 'string' && err.trim() && err !== 'Internal Server Error') {
    return err.trim();
  }
  if (status === 413) return 'Soubor je příliš velký.';
  if (status >= 500) {
    return 'Server dočasně neodpovídá. Zkuste to prosím znovu nebo zkontrolujte log backendu.';
  }
  return fallback;
}

/** POST /favorites/:id nebo DELETE — vyžaduje JWT z Nest (stejný secret + uživatel v Nest DB). */
export async function nestToggleFavorite(
  propertyId: string,
  favorited: boolean,
  token: string | null,
): Promise<{ ok: boolean; favorited?: boolean; likeCount?: number; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const method = favorited ? 'DELETE' : 'POST';
  const url = `${API_BASE_URL}/favorites/${encodeURIComponent(propertyId)}`;
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      favorited?: boolean;
      likeCount?: number;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      favorited: data.favorited,
      likeCount: data.likeCount,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFetchFavorites(token: string | null): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/favorites`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

/** Odpověď GET /users/me (Nest JWT). */
export type NestBrokerProgress = {
  role: string;
  brokerPoints: number;
  brokerFreeLeads: number;
  isPremiumBroker: boolean;
  rewardThresholdPoints: number;
  pointsIntoCurrentTier: number;
  pointsToNextReward: number;
  freeLeadsPerThreshold: number;
};

/** Podžádost o roli makléře / stav ověření (GET /users/me → agentProfile). */
export type NestAgentProfileMe = {
  id: string;
  fullName: string;
  companyName: string;
  phone: string;
  phoneVerified: boolean;
  website: string;
  ico: string;
  city: string;
  bio: string;
  avatarUrl: string | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type NestCompanyProfileMe = {
  id: string;
  companyName: string;
  contactFullName: string;
  phone: string;
  email: string;
  website: string;
  ico: string;
  city: string;
  description: string;
  services: string;
  logoUrl: string | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type NestAgencyProfileMe = {
  id: string;
  agencyName: string;
  contactFullName: string;
  phone: string;
  email: string;
  website: string;
  ico: string;
  city: string;
  description: string;
  logoUrl: string | null;
  agentCount?: number | null;
  branchCities?: string[];
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

/** Odpověď GET /users/me (Nest JWT). */
export type NestMeProfile = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  bio?: string | null;
  createdAt: string;
  isPremiumBroker?: boolean;
  brokerLeadNotificationEnabled?: boolean;
  brokerPreferredRegions?: string[];
  brokerPreferredPropertyTypes?: string[];
  brokerPoints?: number;
  brokerFreeLeads?: number;
  brokerProgress?: NestBrokerProgress;
  isPublicBrokerProfile?: boolean;
  allowBrokerReviews?: boolean;
  brokerProfileSlug?: string | null;
  brokerOfficeName?: string;
  brokerSpecialization?: string;
  brokerRegionLabel?: string;
  brokerWeb?: string;
  brokerPhonePublic?: string;
  brokerEmailPublic?: string;
  brokerReviewAverage?: number;
  brokerReviewCount?: number;
  agentProfile?: NestAgentProfileMe | null;
  companyProfile?: NestCompanyProfileMe | null;
  agencyProfile?: NestAgencyProfileMe | null;
};

function parseNestAgentProfileMeJson(raw: unknown): NestAgentProfileMe | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const verificationStatus = o.verificationStatus;
  if (
    verificationStatus !== 'pending' &&
    verificationStatus !== 'verified' &&
    verificationStatus !== 'rejected'
  ) {
    return null;
  }
  return {
    id: o.id,
    fullName: typeof o.fullName === 'string' ? o.fullName : '',
    companyName: typeof o.companyName === 'string' ? o.companyName : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    phoneVerified: typeof o.phoneVerified === 'boolean' ? o.phoneVerified : false,
    website: typeof o.website === 'string' ? o.website : '',
    ico: typeof o.ico === 'string' ? o.ico : '',
    city: typeof o.city === 'string' ? o.city : '',
    bio: typeof o.bio === 'string' ? o.bio : '',
    avatarUrl:
      o.avatarUrl === null || typeof o.avatarUrl === 'string' ? (o.avatarUrl as string | null) : null,
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

function parseNestCompanyProfileMeJson(raw: unknown): NestCompanyProfileMe | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const verificationStatus = o.verificationStatus;
  if (
    verificationStatus !== 'pending' &&
    verificationStatus !== 'verified' &&
    verificationStatus !== 'rejected'
  ) {
    return null;
  }
  return {
    id: o.id,
    companyName: typeof o.companyName === 'string' ? o.companyName : '',
    contactFullName: typeof o.contactFullName === 'string' ? o.contactFullName : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    email: typeof o.email === 'string' ? o.email : '',
    website: typeof o.website === 'string' ? o.website : '',
    ico: typeof o.ico === 'string' ? o.ico : '',
    city: typeof o.city === 'string' ? o.city : '',
    description: typeof o.description === 'string' ? o.description : '',
    services: typeof o.services === 'string' ? o.services : '',
    logoUrl: o.logoUrl === null || typeof o.logoUrl === 'string' ? (o.logoUrl as string | null) : null,
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

function parseNestAgencyProfileMeJson(raw: unknown): NestAgencyProfileMe | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const verificationStatus = o.verificationStatus;
  if (
    verificationStatus !== 'pending' &&
    verificationStatus !== 'verified' &&
    verificationStatus !== 'rejected'
  ) {
    return null;
  }
  return {
    id: o.id,
    agencyName: typeof o.agencyName === 'string' ? o.agencyName : '',
    contactFullName: typeof o.contactFullName === 'string' ? o.contactFullName : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    email: typeof o.email === 'string' ? o.email : '',
    website: typeof o.website === 'string' ? o.website : '',
    ico: typeof o.ico === 'string' ? o.ico : '',
    city: typeof o.city === 'string' ? o.city : '',
    description: typeof o.description === 'string' ? o.description : '',
    logoUrl: o.logoUrl === null || typeof o.logoUrl === 'string' ? (o.logoUrl as string | null) : null,
    agentCount: typeof o.agentCount === 'number' ? o.agentCount : null,
    branchCities: Array.isArray(o.branchCities)
      ? o.branchCities.filter((x): x is string => typeof x === 'string')
      : [],
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

/** GET /users/me může vracet avatarUrl nebo legacy avatar / coverImage. */
export function parseNestMeProfileJson(raw: unknown): NestMeProfile | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.email !== 'string') return null;
  const role = typeof o.role === 'string' ? o.role : 'USER';
  const avatarRaw = o.avatarUrl ?? o.avatar;
  const coverRaw = o.coverImageUrl ?? o.coverImage;
  const avatarUrl =
    typeof avatarRaw === 'string' && avatarRaw.trim() ? avatarRaw.trim() : null;
  const coverImageUrl =
    typeof coverRaw === 'string' && coverRaw.trim() ? coverRaw.trim() : null;
  const bio = o.bio === null || typeof o.bio === 'string' ? (o.bio as string | null) : null;
  const createdAt =
    typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
  const brokerProgressRaw = o.brokerProgress;
  const brokerProgress =
    brokerProgressRaw != null && typeof brokerProgressRaw === 'object'
      ? (brokerProgressRaw as NestBrokerProgress)
      : null;
  const agentProfile =
    'agentProfile' in o
      ? o.agentProfile === null
        ? null
        : parseNestAgentProfileMeJson(o.agentProfile)
      : undefined;
  const companyProfile =
    'companyProfile' in o
      ? o.companyProfile === null
        ? null
        : parseNestCompanyProfileMeJson(o.companyProfile)
      : undefined;
  const agencyProfile =
    'agencyProfile' in o
      ? o.agencyProfile === null
        ? null
        : parseNestAgencyProfileMeJson(o.agencyProfile)
      : undefined;
  return {
    id: o.id,
    email: o.email,
    name: typeof o.name === 'string' || o.name === null ? (o.name as string | null) : undefined,
    role,
    avatarUrl,
    coverImageUrl,
    bio,
    createdAt,
    isPremiumBroker: typeof o.isPremiumBroker === 'boolean' ? o.isPremiumBroker : undefined,
    brokerLeadNotificationEnabled:
      typeof o.brokerLeadNotificationEnabled === 'boolean'
        ? o.brokerLeadNotificationEnabled
        : undefined,
    brokerPreferredRegions: Array.isArray(o.brokerPreferredRegions)
      ? o.brokerPreferredRegions.filter((x): x is string => typeof x === 'string')
      : undefined,
    brokerPreferredPropertyTypes: Array.isArray(o.brokerPreferredPropertyTypes)
      ? o.brokerPreferredPropertyTypes.filter((x): x is string => typeof x === 'string')
      : undefined,
    brokerPoints: typeof o.brokerPoints === 'number' ? o.brokerPoints : undefined,
    brokerFreeLeads: typeof o.brokerFreeLeads === 'number' ? o.brokerFreeLeads : undefined,
    brokerProgress: brokerProgress ?? undefined,
    isPublicBrokerProfile:
      typeof o.isPublicBrokerProfile === 'boolean' ? o.isPublicBrokerProfile : undefined,
    allowBrokerReviews:
      typeof o.allowBrokerReviews === 'boolean' ? o.allowBrokerReviews : undefined,
    brokerProfileSlug:
      o.brokerProfileSlug === null || typeof o.brokerProfileSlug === 'string'
        ? (o.brokerProfileSlug as string | null)
        : undefined,
    brokerOfficeName: typeof o.brokerOfficeName === 'string' ? o.brokerOfficeName : undefined,
    brokerSpecialization:
      typeof o.brokerSpecialization === 'string' ? o.brokerSpecialization : undefined,
    brokerRegionLabel: typeof o.brokerRegionLabel === 'string' ? o.brokerRegionLabel : undefined,
    brokerWeb: typeof o.brokerWeb === 'string' ? o.brokerWeb : undefined,
    brokerPhonePublic: typeof o.brokerPhonePublic === 'string' ? o.brokerPhonePublic : undefined,
    brokerEmailPublic: typeof o.brokerEmailPublic === 'string' ? o.brokerEmailPublic : undefined,
    brokerReviewAverage:
      typeof o.brokerReviewAverage === 'number' ? o.brokerReviewAverage : undefined,
    brokerReviewCount: typeof o.brokerReviewCount === 'number' ? o.brokerReviewCount : undefined,
    agentProfile,
    companyProfile,
    agencyProfile,
  };
}

/** Shodně s backend limitem `PROFILE_UPLOAD_MAX_BYTES` (20 MB). */
export const NEST_PROFILE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export async function nestFetchMe(
  token: string | null,
): Promise<NestMeProfile | null> {
  if (typeof window !== 'undefined') {
    const proxied = await fetch('/api/nest/users/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (proxied.ok) {
      const raw = (await proxied.json().catch(() => null)) as unknown;
      return parseNestMeProfileJson(raw);
    }
    if (proxied.status !== 401 && process.env.NODE_ENV === 'development') {
      console.warn('[nestFetchMe] proxy /api/nest/users/me', proxied.status);
    }
  }
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[nestFetchMe] GET /users/me failed', res.status);
    }
    return null;
  }
  const raw = (await res.json().catch(() => null)) as unknown;
  const parsed = parseNestMeProfileJson(raw);
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug('[nestFetchMe] profile', {
      hasAvatar: Boolean(parsed?.avatarUrl),
      hasCover: Boolean(parsed?.coverImageUrl),
    });
  }
  return parsed;
}

export type AdminStats = {
  users: number;
  admins: number;
  total: number;
  properties: number;
  pendingProperties: number;
  visits: number;
  ownerListings?: number;
  premiumBrokers?: number;
  brokerLeadsSent?: number;
  brokerPointsTotal?: number;
  brokerFreeLeadsOutstanding?: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
  createdAt: string;
  isPremiumBroker?: boolean;
  brokerPoints?: number;
  brokerFreeLeads?: number;
};

export async function nestAdminStats(
  token: string | null,
): Promise<AdminStats | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/stats`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as AdminStats;
}

export async function nestAdminProperties(
  token: string | null,
): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/properties`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

export async function nestAdminPendingProperties(
  token: string | null,
): Promise<unknown[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/properties/pending`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : null;
}

export type AdminListingRow = {
  id: string;
  title?: string;
  price?: number;
  city?: string;
  location?: string;
  listingType?: string;
  listingStatus?: string;
  authorEmail?: string;
  isActive?: boolean;
  approved?: boolean;
  deletedAt?: string | null;
  activeFrom?: string | null;
  activeUntil?: string | null;
  createdAt?: string;
  userId?: string;
};

export async function nestAdminListings(
  token: string | null,
  params: Record<string, string | undefined>,
): Promise<AdminListingRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== '') sp.set(k, String(v).trim());
  }
  const qs = sp.toString();
  const res = await fetch(
    `${API_BASE_URL}/admin/listings${qs ? `?${qs}` : ''}`,
    {
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AdminListingRow[]) : null;
}

export async function nestAdminUpdateProperty(
  token: string | null,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: AdminListingRow; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/properties/${encodeURIComponent(propertyId)}`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: typeof err.message === 'string' ? err.message : `HTTP ${res.status}`,
    };
  }
  const data = (await res.json()) as AdminListingRow;
  return { ok: true, data };
}

export async function nestAdminApproveProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/properties/${encodeURIComponent(propertyId)}/approve`,
    {
      method: 'PATCH',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: typeof err.message === 'string' ? err.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true };
}

export async function nestAdminDeleteProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/properties/${encodeURIComponent(propertyId)}`,
    {
      method: 'DELETE',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: typeof err.message === 'string' ? err.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true };
}

export async function nestAdminUsers(
  token: string | null,
): Promise<AdminUserRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AdminUserRow[]) : null;
}

export type NestAdminAgentProfileRow = {
  id: string;
  userId: string;
  verificationStatus: string;
  fullName: string;
  companyName: string;
  phone: string;
  phoneVerified: boolean;
  website: string;
  ico: string;
  city: string;
  bio?: string;
  avatarUrl: string | null;
  createdAt: string;
  user?: { id: string; email: string; name?: string | null; role: string };
};

export type NestAdminProfessionalProfileRow = Record<string, unknown>;

export async function nestAdminAgentProfiles(
  token: string | null,
  status?: string,
): Promise<NestAdminAgentProfileRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const qs =
    status != null && String(status).trim() !== ''
      ? `?status=${encodeURIComponent(String(status).trim())}`
      : '';
  const res = await fetch(`${API_BASE_URL}/admin/agent-profiles${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as NestAdminAgentProfileRow[]) : null;
}

export async function nestAdminAgentProfileDetail(
  token: string | null,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/agent-profiles/${encodeURIComponent(id)}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export async function nestAdminApproveAgentProfile(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/agent-profiles/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(err.message)
      ? err.message.join(', ')
      : typeof err.message === 'string'
        ? err.message
        : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminRejectAgentProfile(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/agent-profiles/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(err.message)
      ? err.message.join(', ')
      : typeof err.message === 'string'
        ? err.message
        : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminProfessionalProfiles(
  token: string | null,
  type: 'agent' | 'company' | 'agency',
  status?: string,
): Promise<NestAdminProfessionalProfileRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const qs =
    status != null && String(status).trim() !== ''
      ? `?status=${encodeURIComponent(String(status).trim())}`
      : '';
  const res = await fetch(`${API_BASE_URL}/admin/professional-profiles/${encodeURIComponent(type)}${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as NestAdminProfessionalProfileRow[]) : null;
}

export async function nestAdminApproveProfessionalProfile(
  token: string | null,
  type: 'agent' | 'company' | 'agency',
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/professional-profiles/${encodeURIComponent(type)}/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (res.ok) return { ok: true };
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
}

export async function nestAdminRejectProfessionalProfile(
  token: string | null,
  type: 'agent' | 'company' | 'agency',
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/professional-profiles/${encodeURIComponent(type)}/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (res.ok) return { ok: true };
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
}

export async function nestSubmitAgentProfileRequest(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (typeof window !== 'undefined') {
    const proxied = await fetch('/api/nest/agent-profile/request', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = (await proxied.json().catch(() => ({}))) as Record<string, unknown>;
    if (proxied.ok) {
      return { ok: true, data: raw };
    }
    if (proxied.status !== 401) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(proxied.status, raw, `HTTP ${proxied.status}`),
      };
    }
  }
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/agent-profile/request`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`),
    };
  }
  return { ok: true, data: raw };
}

export async function nestSubmitCompanyProfileRequest(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/agent-profile/request/company`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  return { ok: true, data: raw };
}

export async function nestSubmitAgencyProfileRequest(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/agent-profile/request/agency`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  return { ok: true, data: raw };
}

export type NestPublicVerifiedAgent = {
  userId: string;
  displayName: string;
  personName: string;
  companyName: string;
  avatarUrl?: string | null;
  bio: string;
  city: string;
  phone: string;
  website: string;
  phoneVerified: boolean;
  verificationStatus: string;
  listings: unknown[];
};

export async function nestFetchPublicVerifiedAgent(
  userId: string,
  token: string | null | undefined,
): Promise<NestPublicVerifiedAgent | null> {
  if (!API_BASE_URL || !userId.trim()) return null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token?.trim()) {
    Object.assign(headers, nestAuthHeaders(token));
  }
  const res = await fetch(
    `${API_BASE_URL}/agent-profile/public/${encodeURIComponent(userId)}`,
    { cache: 'no-store', headers },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestPublicVerifiedAgent | null;
}

/** POST /upload/agent-profile-logo — jen URL, neaktualizuje uživatelský avatar. */
export async function nestUploadAgentProfileLogo(
  token: string | null,
  file: File,
): Promise<{ url?: string; error?: string }> {
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return {
      error: `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`,
    };
  }
  const fd = new FormData();
  fd.append('file', file);
  if (typeof window !== 'undefined') {
    const proxied = await fetch('/api/nest/upload/agent-profile-logo', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: fd,
    });
    const upData = (await proxied.json().catch(() => ({}))) as {
      url?: string;
      message?: string | string[];
    };
    if (proxied.ok && typeof upData.url === 'string' && upData.url.trim()) {
      return { url: upData.url.trim() };
    }
    if (proxied.status !== 401) {
      return {
        error: nestApiErrorBodyMessage(
          proxied.status,
          upData,
          `Nahrání loga selhalo (HTTP ${proxied.status}).`,
        ),
      };
    }
  }
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  const fd2 = new FormData();
  fd2.append('file', file);
  const up = await fetch(`${API_BASE_URL}/upload/agent-profile-logo`, {
    method: 'POST',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
    body: fd2,
  });
  const upData = (await up.json().catch(() => ({}))) as {
    url?: string;
    message?: string | string[];
  };
  if (!up.ok) {
    return {
      error: nestApiErrorBodyMessage(up.status, upData, `Nahrání loga selhalo (HTTP ${up.status}).`),
    };
  }
  const url = typeof upData.url === 'string' ? upData.url : '';
  if (!url) {
    return { error: 'Server nevrátil URL obrázku' };
  }
  return { url };
}

export async function nestAdminUpdateUserRole(
  token: string | null,
  userId: string,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminPatchPremiumBroker(
  token: string | null,
  userId: string,
  isPremiumBroker: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/premium-broker`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isPremiumBroker }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminDeleteUser(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminChangePassword(
  token: string | null,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/password`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestAdminImportProperties(
  token: string | null,
  apiKey: string,
): Promise<{ ok: true; imported: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/import-properties`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    imported?: number;
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  const imported = typeof data.imported === 'number' ? data.imported : 0;
  return { ok: true, imported };
}

export async function nestAdminImportXml(
  token: string | null,
  url: string,
): Promise<{ ok: true; imported: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/import-xml`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    imported?: number;
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  const imported = typeof data.imported === 'number' ? data.imported : 0;
  return { ok: true, imported };
}

export async function nestUploadPropertyImages(
  token: string | null,
  files: File[],
): Promise<{ ok: true; urls: string[] } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  if (files.length === 0) {
    return { ok: false, error: 'Vyberte alespoň jeden obrázek' };
  }
  const fd = new FormData();
  for (const f of files) {
    fd.append('files', f);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      urls?: unknown;
      message?: string | string[];
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    const urls = data.urls;
    if (!Array.isArray(urls)) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    const list = urls.filter((u): u is string => typeof u === 'string');
    return { ok: true, urls: list };
  } catch {
    return { ok: false, error: 'Síťová chyba při nahrávání' };
  }
}

export async function nestUploadPropertyMedia(
  token: string | null,
  input: { video: File | null; images: File[]; imageOrder: string[] },
): Promise<{ ok: true; videoUrl: string | null; imageUrls: string[] } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  if (input.video) fd.append('video', input.video);
  for (const image of input.images) {
    fd.append('images', image);
  }
  fd.append('imageOrder', JSON.stringify(input.imageOrder));

  try {
    const res = await fetch(`${API_BASE_URL}/upload/media`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      videoUrl?: string | null;
      imageUrls?: unknown;
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : null,
      imageUrls: Array.isArray(data.imageUrls)
        ? data.imageUrls.filter((u): u is string => typeof u === 'string')
        : [],
    };
  } catch {
    return { ok: false, error: 'Síťová chyba při nahrávání' };
  }
}

export type NestCreateListingBody = Record<string, unknown>;

export async function nestCreatePropertyListing(
  token: string | null,
  body: NestCreateListingBody,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/properties`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestCreatePropertyListingMultipart(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/properties`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestSubmitOwnerLeadOffer(
  token: string | null,
  propertyId: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}/owner-lead-offer`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export type UserNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: unknown;
  readAt: string | null;
  createdAt: string;
};

export async function nestListNotifications(
  token: string | null,
): Promise<UserNotificationRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/notifications`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as UserNotificationRow[]) : null;
}

export async function nestMarkNotificationRead(
  token: string | null,
  id: string,
): Promise<boolean> {
  if (!API_BASE_URL || !token) return false;
  const res = await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  return res.ok;
}

export async function nestPatchBrokerLeadPrefs(
  token: string | null,
  body: {
    brokerLeadNotificationEnabled?: boolean;
    brokerPreferredRegions?: string[];
    brokerPreferredPropertyTypes?: string[];
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/me/broker-lead-prefs`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export type NestMyListingShortsVariant = {
  id: string;
  dashboardStatus: string;
};

export type NestMyListingRow = {
  id: string;
  title: string;
  listingType: 'SHORTS' | 'CLASSIC';
  price: number;
  currency: string;
  city: string;
  region: string;
  dashboardStatus: string;
  createdAt: string;
  coverUrl: string | null;
  derivedFromPropertyId?: string | null;
  shortsVariant?: NestMyListingShortsVariant | null;
  shortsDraft?: { id: string; status: string } | null;
  /** ShortsListing.id pro editor/mazání publikovaného shorts (Property.id = veřejný inzerát). */
  shortsListingId?: string | null;
};

export type NestShortsMediaItem = {
  id: string;
  imageUrl: string;
  order: number;
  duration: number;
  isCover: boolean;
};

export type NestShortsListingDraft = {
  id: string;
  userId: string;
  sourceListingId: string;
  publishedPropertyId?: string | null;
  title: string;
  description: string;
  coverImage: string | null;
  musicUrl: string | null;
  musicTrackId: string | null;
  musicBuiltinKey: string;
  videoUrl: string | null;
  /** idle | rendering | failed */
  videoRenderStatus?: string;
  videoRenderError?: string | null;
  renderVersion?: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: NestShortsMediaItem[];
};

/** GET /users/me/listings — vlastní inzeráty (JWT). */
export async function nestFetchMyListings(
  token: string | null,
): Promise<NestMyListingRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/users/me/listings`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as NestMyListingRow[]) : null;
}

/**
 * POST /shorts-listings/from-classic/:propertyId — koncept shorts (JWT).
 * Dříve POST /properties/.../create-shorts-from-classic vytvářel neapproved Property a nešel do feedu.
 */
export async function nestCreateShortsFromClassic(
  token: string | null,
  classicPropertyId: string,
  body?: { musicKey?: string; musicTrackId?: string },
): Promise<{ ok: boolean; shortsListingId?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/from-classic/${encodeURIComponent(classicPropertyId)}`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  const shortsListingId = typeof data.id === 'string' ? data.id : undefined;
  return { ok: true, shortsListingId };
}

export async function nestFetchMyShortsDrafts(
  token: string | null,
): Promise<NestShortsListingDraft[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/shorts-listings/me`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as NestShortsListingDraft[]) : null;
}

export async function nestFetchShortsListing(
  token: string | null,
  id: string,
): Promise<NestShortsListingDraft | null> {
  if (typeof window !== 'undefined') {
    const proxied = await fetch(
      `/api/nest/shorts-listings/${encodeURIComponent(id)}`,
      { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } },
    );
    if (proxied.ok) {
      return (await proxied.json().catch(() => null)) as NestShortsListingDraft | null;
    }
    if (proxied.status !== 401) return null;
  }
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestShortsListingDraft | null;
}

export async function nestPatchShortsListing(
  token: string | null,
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  const payload = JSON.stringify(body);
  if (typeof window !== 'undefined') {
    const proxied = await fetch(`/api/nest/shorts-listings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: payload,
    });
    const raw = (await proxied.json().catch(() => ({}))) as Record<string, unknown>;
    if (proxied.ok) {
      return { ok: true, data: raw as unknown as NestShortsListingDraft };
    }
    if (proxied.status !== 401) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(proxied.status, raw, `HTTP ${proxied.status}`),
      };
    }
  }
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: payload,
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestDeleteShortsListing(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestPostShortsPreview(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}/preview`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

/** POST /shorts-listings/:id/regenerate — přegenerování videa (JWT). */
export async function nestPostShortsRegenerate(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (typeof window !== 'undefined') {
    const proxied = await fetch(
      `/api/nest/shorts-listings/${encodeURIComponent(id)}/regenerate`,
      {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
    const raw = (await proxied.json().catch(() => ({}))) as Record<string, unknown>;
    if (proxied.ok) {
      return { ok: true, data: raw as unknown as NestShortsListingDraft };
    }
    if (proxied.status !== 401) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(proxied.status, raw, `HTTP ${proxied.status}`),
      };
    }
  }
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestPublishShortsListing(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; propertyId?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/shorts-listings/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    property?: { id?: string };
    message?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, raw as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  const pid =
    raw.property && typeof raw.property === 'object' && typeof raw.property.id === 'string'
      ? raw.property.id
      : undefined;
  return { ok: true, propertyId: pid };
}

export async function nestReorderShortsMedia(
  token: string | null,
  listingId: string,
  orderedIds: string[],
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/media/reorder`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderedIds }),
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestSetShortsCover(
  token: string | null,
  listingId: string,
  mediaId: string,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/cover/${encodeURIComponent(mediaId)}`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestAddShortsMediaByUrl(
  token: string | null,
  listingId: string,
  imageUrl: string,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/media/by-url`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestUploadShortsListingImage(
  token: string | null,
  listingId: string,
  file: File,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/media/upload`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestPatchShortsMediaItem(
  token: string | null,
  listingId: string,
  mediaId: string,
  body: { duration?: number; isCover?: boolean },
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

export async function nestDeleteShortsMediaItem(
  token: string | null,
  listingId: string,
  mediaId: string,
): Promise<{ ok: boolean; data?: NestShortsListingDraft; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/shorts-listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'DELETE',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, data: raw as unknown as NestShortsListingDraft };
}

/** PATCH /properties/:id — vlastník (JWT). */
export async function nestPatchMyProperty(
  token: string | null,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

/** DELETE /properties/:id — soft delete vlastníka (JWT). */
export async function nestDeleteMyProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

/** GET /properties/:id — detail s JWT (vlastník vidí neschválené). */
export async function nestFetchPropertyDetailJson(
  propertyId: string,
  token: string | null,
): Promise<unknown | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...nestAuthHeaders(token) },
  });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

/** PATCH /users/me/broker-public-profile — jen AGENT. */
export async function nestPatchBrokerPublicProfile(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/me/broker-public-profile`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

export type NestPublicBrokerCard = {
  slug: string;
  name: string | null;
  avatarUrl: string | null;
  officeName: string;
  regionLabel: string;
  bioExcerpt: string;
  ratingAverage: number | null;
  ratingCount: number | null;
};

/** GET /brokers/public */
export async function nestListPublicBrokers(token: string | null): Promise<NestPublicBrokerCard[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/brokers/public`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...nestAuthHeaders(token) },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as NestPublicBrokerCard[]) : null;
}

export type NestBrokerPublicDetail = {
  broker: {
    id: string;
    slug: string | null;
    name: string | null;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    bio: string | null;
    officeName: string;
    regionLabel: string;
    specialization: string;
    web: string;
    phonePublic: string;
    emailPublic: string;
    allowBrokerReviews: boolean;
    ratingAverage: number | null;
    ratingCount: number | null;
  };
  listings: unknown[];
  reviews: Array<{
    id: string;
    rating: number;
    reviewText: string;
    createdAt: string;
    updatedAt: string;
    author: { name: string | null; avatar: string | null };
  }>;
  myReview: {
    id: string;
    rating: number;
    reviewText: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

/** GET /brokers/by-slug/:slug */
export async function nestFetchBrokerBySlug(
  slug: string,
  token: string | null,
): Promise<NestBrokerPublicDetail | null> {
  if (!API_BASE_URL || !slug.trim()) return null;
  const res = await fetch(
    `${API_BASE_URL}/brokers/by-slug/${encodeURIComponent(slug.trim())}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json', ...nestAuthHeaders(token) },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as NestBrokerPublicDetail;
}

/** POST /brokers/:brokerId/reviews */
export async function nestUpsertBrokerReview(
  token: string | null,
  brokerId: string,
  body: { rating: number; reviewText?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/brokers/${encodeURIComponent(brokerId)}/reviews`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

export type ShortsMusicTrackDto = {
  id: string;
  title: string;
  artist?: string;
  description?: string | null;
  fileUrl: string;
  /** Plné audio (shodné s fileUrl z API). */
  audioUrl?: string;
  previewUrl?: string | null;
  duration?: number | null;
  durationSec?: number | null;
  mimeType: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  cloudinaryPublicId?: string | null;
  uploadedBy?: { id: string; email: string };
};

/** GET /properties/shorts-music/active — aktivní skladby pro výběr při generování shorts (JWT). */
export async function nestListActiveShortsMusicTracks(
  token: string | null,
): Promise<ShortsMusicTrackDto[]> {
  if (typeof window !== 'undefined') {
    const proxied = await fetch('/api/nest/properties/shorts-music/active', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (proxied.ok) {
      const data = (await proxied.json().catch(() => [])) as unknown;
      return Array.isArray(data) ? (data as ShortsMusicTrackDto[]) : [];
    }
    if (proxied.status !== 401) return [];
  }
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/properties/shorts-music/active`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as ShortsMusicTrackDto[]) : [];
}

/** GET /admin/shorts-music — všechny skladby (ADMIN). */
export async function nestAdminShortsMusicList(
  token: string | null,
): Promise<ShortsMusicTrackDto[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/shorts-music`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as ShortsMusicTrackDto[]) : null;
}

/** POST /admin/shorts-music — multipart: file, title, description?, isActive?. */
export async function nestAdminShortsMusicUpload(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true; track: ShortsMusicTrackDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/shorts-music`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as ShortsMusicTrackDto & {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  if (!data?.id) {
    return { ok: false, error: 'Server nevrátil skladbu.' };
  }
  return { ok: true, track: data as ShortsMusicTrackDto };
}

export async function nestAdminShortsMusicUpdate(
  token: string | null,
  id: string,
  body: { title?: string; description?: string | null; isActive?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/shorts-music/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

export async function nestAdminShortsMusicDelete(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/shorts-music/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

/** POST /properties/generate-shorts-from-photos — JWT, multipart `images[]` + textová pole. */
export async function nestGeneratePropertyShortsFromPhotos(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true; videoUrl: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/properties/generate-shorts-from-photos`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as {
      videoUrl?: string;
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    const url = typeof data.videoUrl === 'string' ? data.videoUrl.trim() : '';
    if (!url) {
      return { ok: false, error: 'Server nevrátil odkaz na video.' };
    }
    return { ok: true, videoUrl: url };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

/**
 * POST /upload/avatar (soubor) → PATCH /users/avatar { avatarUrl }.
 */
export async function nestUploadAvatar(
  token: string | null,
  file: File,
): Promise<{ avatarUrl?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return {
      error: `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`,
    };
  }
  const fd = new FormData();
  fd.append('file', file);
  const up = await fetch(`${API_BASE_URL}/upload/avatar`, {
    method: 'POST',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
    body: fd,
  });
  const upData = (await up.json().catch(() => ({}))) as {
    url?: string;
    message?: string | string[];
  };
  if (!up.ok) {
    return {
      error: nestApiErrorBodyMessage(up.status, upData, `Nahrání fotky selhalo (HTTP ${up.status}).`),
    };
  }
  const url = typeof upData.url === 'string' ? upData.url : '';
  if (!url) {
    return { error: 'Server nevrátil URL obrázku' };
  }

  const patch = await fetch(`${API_BASE_URL}/users/avatar`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ avatarUrl: url }),
  });
  const patchData = (await patch.json().catch(() => ({}))) as {
    avatarUrl?: string | null;
    user?: { avatarUrl?: string | null };
    message?: string | string[];
  };
  if (!patch.ok) {
    return {
      error: nestApiErrorBodyMessage(
        patch.status,
        patchData,
        `Uložení URL profilové fotky selhalo (HTTP ${patch.status}).`,
      ),
    };
  }
  const fromNested =
    patchData.user && typeof patchData.user.avatarUrl === 'string'
      ? patchData.user.avatarUrl
      : '';
  const avatarUrl =
    typeof patchData.avatarUrl === 'string' && patchData.avatarUrl.trim()
      ? patchData.avatarUrl.trim()
      : fromNested.trim() || url;
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug('[nestUploadAvatar] persisted', { avatarUrlLen: avatarUrl.length });
  }
  return { avatarUrl };
}

/**
 * POST /upload/cover → PATCH /users/cover.
 * Kompresi provádí backend (`ProfileImagesService` + `sharp`).
 */
export async function nestUploadCover(
  token: string | null,
  file: File,
): Promise<{ coverImageUrl?: string; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { error: 'API nebo token chybí' };
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return {
      error: `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`,
    };
  }
  const fd = new FormData();
  fd.append('file', file);
  const up = await fetch(`${API_BASE_URL}/upload/cover`, {
    method: 'POST',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
    body: fd,
  });
  const upData = (await up.json().catch(() => ({}))) as {
    url?: string;
    message?: string | string[];
  };
  if (!up.ok) {
    return {
      error: nestApiErrorBodyMessage(up.status, upData, `Nahrání cover obrázku selhalo (HTTP ${up.status}).`),
    };
  }
  const url = typeof upData.url === 'string' ? upData.url : '';
  if (!url) {
    return { error: 'Server nevrátil URL cover obrázku' };
  }
  const patch = await fetch(`${API_BASE_URL}/users/cover`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coverImageUrl: url }),
  });
  const patchData = (await patch.json().catch(() => ({}))) as {
    coverImageUrl?: string | null;
    user?: { coverImageUrl?: string | null };
    message?: string | string[];
  };
  if (!patch.ok) {
    return {
      error: nestApiErrorBodyMessage(
        patch.status,
        patchData,
        `Uložení URL cover obrázku selhalo (HTTP ${patch.status}).`,
      ),
    };
  }
  const coverNested =
    patchData.user && typeof patchData.user.coverImageUrl === 'string'
      ? patchData.user.coverImageUrl
      : '';
  const coverImageUrl =
    typeof patchData.coverImageUrl === 'string' && patchData.coverImageUrl.trim()
      ? patchData.coverImageUrl.trim()
      : coverNested.trim() || url;
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug('[nestUploadCover] persisted', { coverImageUrlLen: coverImageUrl.length });
  }
  return { coverImageUrl };
}

export async function nestDeleteCover(
  token: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/cover`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function nestPatchProfileBio(
  token: string | null,
  bio: string | null,
): Promise<{ ok: boolean; bio?: string | null; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/users/profile`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bio }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    bio?: string | null;
    message?: string | string[];
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, bio: data.bio ?? null };
}

export type ShortVideo = {
  id: string;
  url?: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  price?: number | null;
  city?: string | null;
  images?: string[];
  type?: string;
  source?: string;
  propertyId?: string;
  description?: string | null;
  content?: string | null;
  createdAt: string;
  liked?: boolean;
  userId?: string;
  /** Z GET /feed/shorts (Property.publishedAt) — řazení náhledu. */
  publishedAt?: string | null;
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
};

export async function nestCreateVideoPost(
  token: string | null,
  file: File,
  description: string,
): Promise<
  | { success: true; url: string; mediaType: 'video' | 'image' }
  | { success: false; error?: string }
> {
  if (!API_BASE_URL || !token) {
    return { success: false, error: 'API nebo token chybí' };
  }
  const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('description', description);
  const timeoutMs = 10 * 60 * 1000;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${postsBase}/posts/video`, {
      method: 'POST',
      cache: 'no-store',
      headers: nestAuthHeaders(token),
      body: fd,
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      url?: string;
      mediaType?: string;
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`;
      return { success: false, error: msg };
    }
    const url = typeof data.url === 'string' ? data.url : '';
    if (data.success !== true || !url) {
      return { success: false, error: 'Upload selhal' };
    }
    const mediaType: 'video' | 'image' =
      data.mediaType === 'image' ? 'image' : 'video';
    return { success: true, url, mediaType };
  } catch {
    return { success: false, error: 'Síťová chyba při uploadu videa' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function nestFetchVideos(): Promise<ShortVideo[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/feed/shorts`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data) ? (data as ShortVideo[]) : [];
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[nestFetchVideos] /feed/shorts count=', list.length);
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Veřejné načtení jednoho shorts záznamu: GET /properties/:id (bez JWT), případně doplnění z /feed/shorts.
 * Pro sdílené deep linky `/?tab=shorts&video=id` (a legacy `/shorts/[id]`) bez přihlášení.
 */
export async function nestFetchShortVideoPublic(id: string): Promise<ShortVideo | null> {
  if (!id.trim()) return null;
  if (!API_BASE_URL) return null;
  const mapDetailProperty = (p: Record<string, unknown>, fallbackId: string): ShortVideo | null => {
    const videoUrl =
      typeof p.videoUrl === 'string' && p.videoUrl.trim() ? p.videoUrl.trim() : null;
    if (!videoUrl) return null;
    const createdRaw = p.createdAt;
    const createdAt =
      typeof createdRaw === 'string'
        ? createdRaw
        : createdRaw instanceof Date
          ? createdRaw.toISOString()
          : new Date().toISOString();
    const images = Array.isArray(p.images)
      ? (p.images as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : undefined;
    const pubRaw = p.publishedAt;
    const publishedAt =
      typeof pubRaw === 'string'
        ? pubRaw
        : pubRaw instanceof Date
          ? pubRaw.toISOString()
          : null;
    return {
      id: String(p.id ?? fallbackId),
      videoUrl,
      title: typeof p.title === 'string' ? p.title : null,
      price: typeof p.price === 'number' ? p.price : null,
      city:
        typeof p.city === 'string'
          ? p.city
          : typeof p.location === 'string'
            ? p.location
            : null,
      images,
      imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : null,
      createdAt,
      publishedAt,
      userId: typeof p.userId === 'string' ? p.userId : undefined,
    };
  };
  try {
    const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const root = (await res.json()) as { property?: Record<string, unknown> };
      const p = root.property;
      if (p && typeof p === 'object') {
        const mapped = mapDetailProperty(p, id);
        if (mapped) return mapped;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const list = await nestFetchVideos();
    return list.find((x) => x.id === id) ?? null;
  } catch {
    return null;
  }
}

/** Shodně s backend `MESSAGE_MAX_LEN`. */
export const NEST_MESSAGE_BODY_MAX = 1000;

export type NestConversationListItem = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyPrice: number;
  propertyCity: string;
  propertyImageUrl: string | null;
  counterpart: { id: string; name: string | null; email: string };
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

export type NestConversationDetailMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
};

export type NestConversationDetail = {
  id: string;
  property: {
    id: string;
    title: string;
    price: number;
    city: string;
    imageUrl: string | null;
  };
  counterpart: { id: string; name: string | null; email: string };
  messages: NestConversationDetailMessage[];
};

export type NestConversationStub = {
  id: string;
  propertyId: string;
};

function nestErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const o = data as Record<string, unknown>;
  const m = o.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m) && m.every((x) => typeof x === 'string')) return m.join(', ');
  if (typeof o.error === 'string') return o.error;
  return fallback;
}

export async function nestMessagesUnreadCount(token: string | null): Promise<number> {
  if (!API_BASE_URL || !token) return 0;
  try {
    const res = await fetch(`${API_BASE_URL}/conversations/unread-count`, {
      cache: 'no-store',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as unknown;
    if (typeof data === 'number') return Math.max(0, data);
    if (data && typeof data === 'object' && typeof (data as { count?: unknown }).count === 'number') {
      return Math.max(0, (data as { count: number }).count);
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function nestConversationsList(
  token: string | null,
  folder: 'inbox' | 'sent' | 'all',
): Promise<NestConversationListItem[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations?folder=${encodeURIComponent(folder)}`,
      {
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NestConversationListItem[]) : null;
  } catch {
    return null;
  }
}

export async function nestGetOrCreateConversation(
  token: string | null,
  propertyId: string,
): Promise<{ ok: true; conversation: NestConversationStub } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ propertyId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    const id = typeof data.id === 'string' ? data.id : '';
    const pid = typeof data.propertyId === 'string' ? data.propertyId : propertyId;
    if (!id) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    return { ok: true, conversation: { id, propertyId: pid } };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestConversationDetail(
  token: string | null,
  conversationId: string,
): Promise<NestConversationDetail | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`,
      {
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as NestConversationDetail;
  } catch {
    return null;
  }
}

export async function nestSendConversationMessage(
  token: string | null,
  conversationId: string,
  body: string,
): Promise<
  | { ok: true; message: { id: string; body: string; senderId: string; createdAt: string } }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const trimmed = body.trim();
  if (!trimmed.length) {
    return { ok: false, error: 'Zpráva nesmí být prázdná' };
  }
  if (trimmed.length > NEST_MESSAGE_BODY_MAX) {
    return { ok: false, error: `Maximálně ${NEST_MESSAGE_BODY_MAX} znaků` };
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...nestAuthHeaders(token),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: trimmed }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    const id = typeof data.id === 'string' ? data.id : '';
    const senderId = typeof data.senderId === 'string' ? data.senderId : '';
    const b = typeof data.body === 'string' ? data.body : trimmed;
    const createdAt =
      data.createdAt instanceof Date
        ? data.createdAt.toISOString()
        : typeof data.createdAt === 'string'
          ? data.createdAt
          : new Date().toISOString();
    if (!id) {
      return { ok: false, error: 'Neočekávaná odpověď serveru' };
    }
    return { ok: true, message: { id, body: b, senderId, createdAt } };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestMarkConversationRead(
  token: string | null,
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/read`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type PostComment = {
  id: string;
  content: string;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
};

export type ListingMedia = {
  id: string;
  url: string;
  type: 'image' | 'video';
  order: number;
};

export type ListingPost = {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  type: 'post' | 'short' | string;
  createdAt: string;
  media: ListingMedia[];
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
  } | null;
  _count?: {
    favorites?: number;
    comments?: number;
  };
  category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE';
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number;
  reactions?: Array<{
    userId: string;
    postId: string;
    type: 'LIKE' | 'DISLIKE';
  }>;
};

function postsApiBase(): string {
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

export async function nestTogglePostFavorite(
  token: string | null,
  postId: string,
): Promise<{ ok: true; liked: boolean; likeCount: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/favorite`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      liked?: boolean;
      likeCount?: number;
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      liked: Boolean(data.liked),
      likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFetchPostComments(postId: string): Promise<PostComment[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/comments`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as PostComment[]) : [];
  } catch {
    return [];
  }
}

export async function nestAddPostComment(
  token: string | null,
  postId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/comment`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestCreateListingPost(
  token: string | null,
  input: {
    title: string;
    description: string;
    price: number;
    city: string;
    type: 'post' | 'short';
    video?: File | null;
    images: File[];
    imageOrder: string[];
    category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE';
    latitude?: number;
    longitude?: number;
  },
): Promise<{ ok: true; post: ListingPost } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('title', input.title);
  fd.append('description', input.description);
  fd.append('price', String(Math.max(0, Math.trunc(input.price))));
  fd.append('city', input.city);
  fd.append('type', input.type);
  if (input.category) fd.append('category', input.category);
  if (Number.isFinite(input.latitude)) fd.append('latitude', String(input.latitude));
  if (Number.isFinite(input.longitude)) fd.append('longitude', String(input.longitude));
  fd.append('imageOrder', JSON.stringify(input.imageOrder));
  if (input.video) {
    fd.append('video', input.video);
  }
  for (const image of input.images) {
    fd.append('images', image);
  }

  const res = await fetch(`${postsApiBase()}/posts/listing`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
    },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    post?: ListingPost;
    message?: string | string[];
    error?: string;
  };
  if (!res.ok || !data.post) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, post: data.post };
}

export async function nestFetchPostDetail(postId: string): Promise<ListingPost | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as ListingPost;
}

export async function nestFetchCommunityPosts(
  category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE',
  options?: { radiusKm?: number; lat?: number; lng?: number },
): Promise<ListingPost[]> {
  if (!API_BASE_URL) return [];
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (Number.isFinite(options?.radiusKm)) params.set('radiusKm', String(options?.radiusKm));
  if (Number.isFinite(options?.lat)) params.set('lat', String(options?.lat));
  if (Number.isFinite(options?.lng)) params.set('lng', String(options?.lng));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${postsApiBase()}/posts${qs}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as ListingPost[]) : [];
}

export async function nestSetPostReaction(
  token: string | null,
  postId: string,
  type: 'LIKE' | 'DISLIKE',
): Promise<
  | { ok: true; likeCount: number; dislikeCount: number; reaction: 'LIKE' | 'DISLIKE' | null }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${postsApiBase()}/posts/${encodeURIComponent(postId)}/reaction`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    likeCount?: number;
    dislikeCount?: number;
    reaction?: 'LIKE' | 'DISLIKE' | null;
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return {
    ok: true,
    likeCount: Number(data.likeCount ?? 0),
    dislikeCount: Number(data.dislikeCount ?? 0),
    reaction: data.reaction ?? null,
  };
}
