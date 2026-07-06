'use client';

import { communityCategoryToAuthorRole, type CommunityCategoryKey } from './community-category-roles';
import { API_BASE_URL, getClientTokenFromCookie, getLinkPreviewApiUrl } from '@/lib/api';

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
  isPublic: boolean;
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
  isPublic: boolean;
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
  isPublic: boolean;
  agentCount?: number | null;
  branchCities?: string[];
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type NestFinancialAdvisorProfileMe = {
  id: string;
  fullName: string;
  brandName: string;
  phone: string;
  email: string;
  website: string;
  ico: string;
  city: string;
  bio: string;
  specializations: string[];
  avatarUrl: string | null;
  logoUrl: string | null;
  isPublic: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type NestInvestorProfileMe = {
  id: string;
  fullName: string;
  investorName: string;
  investorType: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  bio: string;
  investmentFocus: string[];
  avatarUrl: string | null;
  logoUrl: string | null;
  isPublic: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

/** Odpověď GET /users/me (Nest JWT). */
export type ProfileRequirementChecklistItem = {
  id: string;
  label: string;
  missingLabel: string;
  satisfied: boolean;
};

export type NestProfileRequirements = {
  checklist?: ProfileRequirementChecklistItem[];
  professional: string[];
  tipar: string[];
  canTopUpCredits: boolean;
  canUseTipar: boolean;
  showVerifiedBadge: boolean;
};

export type NestMeProfile = {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  profileIco?: string | null;
  emailVerified?: boolean;
  tiparPayoutBankAccount?: string | null;
  phone?: string;
  phonePublic?: boolean;
  role: string;
  avatarUrl?: string | null;
  avatarCrop?: { x: number; y: number; zoom: number } | null;
  coverImageUrl?: string | null;
  coverCrop?: { x: number; y: number; zoom: number } | null;
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
  publicProfile?: boolean;
  professionalVerified?: boolean;
  professionalVerificationStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  publicProfessionalProfile?: boolean;
  professionalVerificationRequestedAt?: string | null;
  professionalVerifiedAt?: string | null;
  professionalRejectedAt?: string | null;
  allowBrokerReviews?: boolean;
  brokerProfileSlug?: string | null;
  brokerOfficeName?: string;
  brokerSpecialization?: string;
  brokerRegionLabel?: string;
  brokerWeb?: string;
  brokerPhonePublic?: string;
  brokerEmailPublic?: string;
  whatsappPhone?: string;
  whatsappVerified?: boolean;
  whatsappVerifiedAt?: string | null;
  whatsappEnabled?: boolean;
  whatsappMarketingOptOut?: boolean;
  whatsappNotifyMyUploads?: boolean;
  whatsappNotifyNewPosts?: boolean;
  brokerReviewAverage?: number;
  brokerReviewCount?: number;
  creditBalance?: number;
  isTipar?: boolean;
  isTestAccount?: boolean;
  testAccountPublicVisible?: boolean;
  portalWorkerStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
  portalWorkerApprovedAt?: string | null;
  marketingConsentWhatsApp?: boolean;
  marketingConsentEmail?: boolean;
  consentCreatedAt?: string | null;
  consentSource?: string | null;
  shareCount?: number;
  shareCompletedAt?: string | null;
  invitedViaWhatsApp?: boolean;
  facebookUrl?: string | null;
  facebookImportEnabled?: boolean;
  facebookLastSyncAt?: string | null;
  facebookImportStatus?: 'IDLE' | 'RUNNING' | 'OK' | 'ERROR';
  facebookImportError?: string | null;
  agentProfile?: NestAgentProfileMe | null;
  companyProfile?: NestCompanyProfileMe | null;
  agencyProfile?: NestAgencyProfileMe | null;
  financialAdvisorProfile?: NestFinancialAdvisorProfileMe | null;
  investorProfile?: NestInvestorProfileMe | null;
  profileRequirements?: NestProfileRequirements;
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
    isPublic: typeof o.isPublic === 'boolean' ? o.isPublic : false,
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
    isPublic: typeof o.isPublic === 'boolean' ? o.isPublic : false,
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
    isPublic: typeof o.isPublic === 'boolean' ? o.isPublic : false,
    agentCount: typeof o.agentCount === 'number' ? o.agentCount : null,
    branchCities: Array.isArray(o.branchCities)
      ? o.branchCities.filter((x): x is string => typeof x === 'string')
      : [],
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

function parseNestFinancialAdvisorProfileMeJson(raw: unknown): NestFinancialAdvisorProfileMe | null {
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
    brandName: typeof o.brandName === 'string' ? o.brandName : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    email: typeof o.email === 'string' ? o.email : '',
    website: typeof o.website === 'string' ? o.website : '',
    ico: typeof o.ico === 'string' ? o.ico : '',
    city: typeof o.city === 'string' ? o.city : '',
    bio: typeof o.bio === 'string' ? o.bio : '',
    specializations: Array.isArray(o.specializations)
      ? o.specializations.filter((x): x is string => typeof x === 'string')
      : [],
    avatarUrl:
      o.avatarUrl === null || typeof o.avatarUrl === 'string' ? (o.avatarUrl as string | null) : null,
    logoUrl: o.logoUrl === null || typeof o.logoUrl === 'string' ? (o.logoUrl as string | null) : null,
    isPublic: typeof o.isPublic === 'boolean' ? o.isPublic : false,
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

function parseNestInvestorProfileMeJson(raw: unknown): NestInvestorProfileMe | null {
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
    investorName: typeof o.investorName === 'string' ? o.investorName : '',
    investorType: typeof o.investorType === 'string' ? o.investorType : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    email: typeof o.email === 'string' ? o.email : '',
    website: typeof o.website === 'string' ? o.website : '',
    city: typeof o.city === 'string' ? o.city : '',
    bio: typeof o.bio === 'string' ? o.bio : '',
    investmentFocus: Array.isArray(o.investmentFocus)
      ? o.investmentFocus.filter((x): x is string => typeof x === 'string')
      : [],
    avatarUrl:
      o.avatarUrl === null || typeof o.avatarUrl === 'string' ? (o.avatarUrl as string | null) : null,
    logoUrl: o.logoUrl === null || typeof o.logoUrl === 'string' ? (o.logoUrl as string | null) : null,
    isPublic: typeof o.isPublic === 'boolean' ? o.isPublic : false,
    verificationStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

function parseNestProfileRequirements(raw: unknown): NestProfileRequirements | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const professional = Array.isArray(o.professional)
    ? o.professional.filter((x): x is string => typeof x === 'string')
    : [];
  const tipar = Array.isArray(o.tipar)
    ? o.tipar.filter((x): x is string => typeof x === 'string')
    : [];
  const checklist = Array.isArray(o.checklist)
    ? o.checklist
        .map((row) => {
          if (row == null || typeof row !== 'object') return null;
          const item = row as Record<string, unknown>;
          if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
          return {
            id: item.id,
            label: item.label,
            missingLabel:
              typeof item.missingLabel === 'string' ? item.missingLabel : item.label,
            satisfied: item.satisfied === true,
          } satisfies ProfileRequirementChecklistItem;
        })
        .filter((x): x is ProfileRequirementChecklistItem => x != null)
    : [];
  return {
    checklist,
    professional,
    tipar,
    canTopUpCredits: o.canTopUpCredits !== false,
    canUseTipar: o.canUseTipar === true,
    showVerifiedBadge: o.showVerifiedBadge === true,
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
  const avatarCropRaw = o.avatarCrop;
  const coverCropRaw = o.coverCrop;
  const avatarCrop =
    avatarCropRaw != null && typeof avatarCropRaw === 'object'
      ? {
          x: Number((avatarCropRaw as { x?: unknown }).x ?? 0),
          y: Number((avatarCropRaw as { y?: unknown }).y ?? 0),
          zoom: Number((avatarCropRaw as { zoom?: unknown }).zoom ?? 1),
        }
      : null;
  const coverCrop =
    coverCropRaw != null && typeof coverCropRaw === 'object'
      ? {
          x: Number((coverCropRaw as { x?: unknown }).x ?? 0),
          y: Number((coverCropRaw as { y?: unknown }).y ?? 0),
          zoom: Number((coverCropRaw as { zoom?: unknown }).zoom ?? 1),
        }
      : null;
  const bio = o.bio === null || typeof o.bio === 'string' ? (o.bio as string | null) : null;
  const createdAt =
    typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
  const phone = typeof o.phone === 'string' ? o.phone : '';
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
  const financialAdvisorProfile =
    'financialAdvisorProfile' in o
      ? o.financialAdvisorProfile === null
        ? null
        : parseNestFinancialAdvisorProfileMeJson(o.financialAdvisorProfile)
      : undefined;
  const investorProfile =
    'investorProfile' in o
      ? o.investorProfile === null
        ? null
        : parseNestInvestorProfileMeJson(o.investorProfile)
      : undefined;
  return {
    id: o.id,
    email: o.email,
    name: typeof o.name === 'string' || o.name === null ? (o.name as string | null) : undefined,
    firstName:
      typeof o.firstName === 'string' || o.firstName === null
        ? (o.firstName as string | null)
        : undefined,
    lastName:
      typeof o.lastName === 'string' || o.lastName === null
        ? (o.lastName as string | null)
        : undefined,
    city:
      o.city === null || typeof o.city === 'string' ? (o.city as string | null) : undefined,
    address:
      typeof o.address === 'string' || o.address === null
        ? (o.address as string | null)
        : undefined,
    postalCode:
      typeof o.postalCode === 'string' || o.postalCode === null
        ? (o.postalCode as string | null)
        : undefined,
    profileIco:
      typeof o.profileIco === 'string' || o.profileIco === null
        ? (o.profileIco as string | null)
        : undefined,
    emailVerified: o.emailVerified === true,
    tiparPayoutBankAccount:
      o.tiparPayoutBankAccount === null || typeof o.tiparPayoutBankAccount === 'string'
        ? (o.tiparPayoutBankAccount as string | null)
        : undefined,
    phone,
    phonePublic: o.phonePublic === true,
    role,
    avatarUrl,
    avatarCrop,
    coverImageUrl,
    coverCrop,
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
    publicProfile:
      typeof o.publicProfile === 'boolean'
        ? o.publicProfile
        : typeof o.isPublicProfile === 'boolean'
          ? o.isPublicProfile
          : undefined,
    professionalVerified: o.professionalVerified === true,
    professionalVerificationStatus:
      o.professionalVerificationStatus === 'NONE' ||
      o.professionalVerificationStatus === 'PENDING' ||
      o.professionalVerificationStatus === 'APPROVED' ||
      o.professionalVerificationStatus === 'REJECTED'
        ? o.professionalVerificationStatus
        : undefined,
    publicProfessionalProfile:
      typeof o.publicProfessionalProfile === 'boolean' ? o.publicProfessionalProfile : undefined,
    professionalVerificationRequestedAt:
      o.professionalVerificationRequestedAt === null ||
      typeof o.professionalVerificationRequestedAt === 'string'
        ? (o.professionalVerificationRequestedAt as string | null)
        : undefined,
    professionalVerifiedAt:
      o.professionalVerifiedAt === null || typeof o.professionalVerifiedAt === 'string'
        ? (o.professionalVerifiedAt as string | null)
        : undefined,
    professionalRejectedAt:
      o.professionalRejectedAt === null || typeof o.professionalRejectedAt === 'string'
        ? (o.professionalRejectedAt as string | null)
        : undefined,
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
    whatsappPhone: typeof o.whatsappPhone === 'string' ? o.whatsappPhone : undefined,
    whatsappVerified: o.whatsappVerified === true,
    whatsappVerifiedAt:
      o.whatsappVerifiedAt === null || typeof o.whatsappVerifiedAt === 'string'
        ? (o.whatsappVerifiedAt as string | null)
        : undefined,
    whatsappEnabled: o.whatsappEnabled === true,
    whatsappMarketingOptOut: o.whatsappMarketingOptOut === true,
    whatsappNotifyMyUploads: o.whatsappNotifyMyUploads === true,
    whatsappNotifyNewPosts: o.whatsappNotifyNewPosts === true,
    brokerReviewAverage:
      typeof o.brokerReviewAverage === 'number' ? o.brokerReviewAverage : undefined,
    brokerReviewCount: typeof o.brokerReviewCount === 'number' ? o.brokerReviewCount : undefined,
    creditBalance: typeof o.creditBalance === 'number' ? o.creditBalance : undefined,
    isTipar: typeof o.isTipar === 'boolean' ? o.isTipar : undefined,
    portalWorkerStatus:
      o.portalWorkerStatus === 'PENDING_APPROVAL' ||
      o.portalWorkerStatus === 'APPROVED' ||
      o.portalWorkerStatus === 'REJECTED' ||
      o.portalWorkerStatus === 'SUSPENDED'
        ? o.portalWorkerStatus
        : o.portalWorkerStatus === null
          ? null
          : undefined,
    portalWorkerApprovedAt:
      o.portalWorkerApprovedAt === null || typeof o.portalWorkerApprovedAt === 'string'
        ? (o.portalWorkerApprovedAt as string | null)
        : undefined,
    marketingConsentWhatsApp: o.marketingConsentWhatsApp === true,
    marketingConsentEmail: o.marketingConsentEmail === true,
    consentCreatedAt:
      o.consentCreatedAt === null || typeof o.consentCreatedAt === 'string'
        ? (o.consentCreatedAt as string | null)
        : undefined,
    consentSource:
      o.consentSource === null || typeof o.consentSource === 'string'
        ? (o.consentSource as string | null)
        : undefined,
    shareCount: typeof o.shareCount === 'number' ? o.shareCount : undefined,
    shareCompletedAt:
      o.shareCompletedAt === null || typeof o.shareCompletedAt === 'string'
        ? (o.shareCompletedAt as string | null)
        : undefined,
    invitedViaWhatsApp: o.invitedViaWhatsApp === true,
    facebookUrl:
      o.facebookUrl === null || typeof o.facebookUrl === 'string'
        ? (o.facebookUrl as string | null)
        : undefined,
    facebookImportEnabled:
      typeof o.facebookImportEnabled === 'boolean' ? o.facebookImportEnabled : undefined,
    facebookLastSyncAt:
      o.facebookLastSyncAt === null || typeof o.facebookLastSyncAt === 'string'
        ? (o.facebookLastSyncAt as string | null)
        : undefined,
    facebookImportStatus:
      o.facebookImportStatus === 'IDLE' ||
      o.facebookImportStatus === 'RUNNING' ||
      o.facebookImportStatus === 'OK' ||
      o.facebookImportStatus === 'ERROR'
        ? o.facebookImportStatus
        : undefined,
    facebookImportError:
      o.facebookImportError === null || typeof o.facebookImportError === 'string'
        ? (o.facebookImportError as string | null)
        : undefined,
    agentProfile,
    companyProfile,
    agencyProfile,
    financialAdvisorProfile,
    investorProfile,
    profileRequirements: parseNestProfileRequirements(o.profileRequirements),
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
  whatsappMessages?: number;
  emailLogs?: number;
  marketingCampaigns?: number;
  crmContacts?: number;
  bonusClaims?: number;
  creditLedgerEntries?: number;
  registrationsToday?: number;
  topupsTodayCzk?: number;
  newListingsToday?: number;
};

export type AdminPortalSearchResult = {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    phone: string | null;
    whatsappPhone: string | null;
  }>;
  properties: Array<{
    id: string;
    title: string;
    city: string;
    importExternalId: string | null;
  }>;
};

export type AdminListingPhotoWatermarkSettings = {
  enabled: boolean;
  position: 'left-top' | 'right-top' | 'left-bottom' | 'right-bottom';
  logoWidthRatio: number;
  opacity: number;
  marginPx: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
  createdAt: string;
  isPremiumBroker?: boolean;
  isPromoProfile?: boolean;
  promoProfileActive?: boolean;
  isPublicBrokerProfile?: boolean;
  publicProfile?: boolean;
  publicProfessionalProfile?: boolean;
  brokerPoints?: number;
  brokerFreeLeads?: number;
  creditBalance?: number;
  realCreditBalance?: number;
  bonusCreditBalance?: number;
  pendingCreditBalance?: number;
  isCreditVerified?: boolean;
  firstTopUpUsed?: boolean;
  whatsappPhone?: string;
  whatsappVerified?: boolean;
  whatsappVerifiedAt?: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  phone?: string;
  profileIco?: string | null;
  creditDebt?: number;
  accountLimited?: boolean;
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

export async function nestAdminPortalSearch(
  token: string | null,
  q: string,
): Promise<AdminPortalSearchResult | null> {
  if (!API_BASE_URL || !token || q.trim().length < 2) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/search?${new URLSearchParams({ q: q.trim() })}`,
    { headers: { ...nestAuthHeaders(token), Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as AdminPortalSearchResult;
}

export async function nestAdminListingPhotoWatermarkSettings(
  token: string | null,
): Promise<AdminListingPhotoWatermarkSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/listing-photo-watermark`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as AdminListingPhotoWatermarkSettings | null;
}

export type AdminShareTextsSettings = {
  shareClassicTitle: string;
  shareClassicDescription: string;
  shareShortsTitle: string;
  shareShortsDescription: string;
  shareTipTitle: string;
  shareTipDescription: string;
  shareTiparPromoText: string;
};

export async function nestAdminShareTextsSettings(
  token: string | null,
): Promise<AdminShareTextsSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/share-texts`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as AdminShareTextsSettings | null;
}

export async function nestAdminUpdateShareTextsSettings(
  token: string | null,
  body: Partial<AdminShareTextsSettings>,
): Promise<{ ok: boolean; data?: AdminShareTextsSettings; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/share-texts`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: err.message || `HTTP ${res.status}` };
  }
  const data = (await res.json().catch(() => null)) as AdminShareTextsSettings | null;
  if (!data) return { ok: false, error: 'Neplatná odpověď serveru.' };
  return { ok: true, data };
}

export type ListingApprovalSettings = {
  requireNewListingApproval: boolean;
  requireEditApproval: boolean;
  autoPublishOnCreate: boolean;
  autoPublishVerifiedUsersOnly: boolean;
  autoPublishProfessionalsOnly: boolean;
  privateListingsAlwaysPending: boolean;
};

export async function nestAdminListingApprovalSettingsGet(
  token: string | null,
): Promise<ListingApprovalSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/listing-approval-settings`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as ListingApprovalSettings | null;
}

export async function nestAdminListingApprovalSettingsPatch(
  token: string | null,
  body: Partial<ListingApprovalSettings>,
): Promise<{ ok: boolean; data?: ListingApprovalSettings; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/listing-approval-settings`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: err.message || `HTTP ${res.status}` };
  }
  const data = (await res.json().catch(() => null)) as ListingApprovalSettings | null;
  if (!data) return { ok: false, error: 'Neplatná odpověď serveru.' };
  return { ok: true, data };
}

export async function nestFetchPropertySocialPublishSummary(
  token: string | null,
  propertyId: string,
): Promise<PropertySocialPublishSummary | null> {
  if (!API_BASE_URL || !token || !propertyId) return null;
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}/social-publish-summary`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PropertySocialPublishSummary | null;
}

export async function nestAdminUpdateListingPhotoWatermarkSettings(
  token: string | null,
  body: Partial<AdminListingPhotoWatermarkSettings>,
): Promise<{ ok: boolean; data?: AdminListingPhotoWatermarkSettings; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/listing-photo-watermark`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: err.message || `HTTP ${res.status}` };
  }
  const data = (await res.json().catch(() => null)) as AdminListingPhotoWatermarkSettings | null;
  if (!data) return { ok: false, error: 'Neplatná odpověď serveru.' };
  return { ok: true, data };
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
  description?: string;
  price?: number | null;
  city?: string;
  location?: string;
  listingType?: string;
  isTiparTip?: boolean;
  isTip?: boolean;
  listingStatus?: string;
  authorEmail?: string;
  isActive?: boolean;
  approved?: boolean;
  deletedAt?: string | null;
  activeFrom?: string | null;
  activeUntil?: string | null;
  createdAt?: string;
  userId?: string;
  viewsCount?: number;
  realViews?: number;
  manualViews?: number;
  autopilotViews?: number;
  viewsAutopilotEnabled?: boolean;
  autoViewsEnabled?: boolean;
  autoViewsIncrement?: number;
  autoViewsIntervalMinutes?: number;
  lastAutoViewsAt?: string | null;
  images?: string[];
  importSource?: string | null;
  importMethod?: string | null;
  importExternalId?: string | null;
  importSourceUrl?: string | null;
  importedAt?: string | null;
  lastSyncedAt?: string | null;
  importDisabled?: boolean;
  sourcePortalKey?: string | null;
  sourcePortalLabel?: string | null;
  propertyTypeKey?: string | null;
  propertyTypeLabel?: string | null;
  importCategoryKey?: string | null;
  importCategoryLabel?: string | null;
  canGenerateShorts?: boolean;
  shortsGenerated?: boolean;
  shortsSourceType?: string | null;
  videoUrl?: string | null;
};

export type AdminImportRunState = {
  running: boolean;
  percent: number;
  message: string;
  startedAt?: string;
  phase?: string;
  totalListings?: number;
  processedListings?: number;
  totalDetails?: number;
  processedDetails?: number;
  savedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  failedCount?: number;
  lastProcessedSourceUrl?: string | null;
  lastItemErrorMessage?: string | null;
  lastItemErrorCategory?: string | null;
  lastItemErrorExternalId?: string | null;
  itemErrorLog?: Array<Record<string, unknown>>;
  progressPercent?: number;
  currentMessage?: string;
  etaSeconds?: number | null;
};

export type AdminImportSourceRow = {
  id: string;
  portal: string;
  method: string;
  name: string;
  portalKey?: string;
  portalLabel?: string;
  categoryKey?: string;
  categoryLabel?: string;
  listingType?: string | null;
  propertyType?: string | null;
  sortOrder?: number;
  enabled: boolean;
  intervalMinutes: number;
  limitPerRun: number;
  endpointUrl?: string | null;
  actorId?: string | null;
  actorTaskId?: string | null;
  datasetId?: string | null;
  startUrl?: string | null;
  sourcePortal?: string | null;
  notes?: string | null;
  isActive?: boolean;
  lastRunId?: string | null;
  lastDatasetId?: string | null;
  lastProcessedUrl?: string | null;
  lastError?: string | null;
  credentialsJson?: Record<string, unknown> | null;
  settingsJson?: Record<string, unknown> | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  progressPercent?: number;
  totalItems?: number | null;
  processedItems?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  currentMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  latestLog?: {
    id: string;
    status: string;
    importedNew: number;
    importedUpdated: number;
    skipped: number;
    disabled: number;
    error?: string | null;
    createdAt: string;
  } | null;
  running?: AdminImportRunState | null;
};

export type AdminImportLogRow = {
  id: string;
  sourceId: string;
  portal: string;
  method: string;
  status: string;
  message?: string | null;
  importedNew: number;
  importedUpdated: number;
  skipped: number;
  disabled: number;
  error?: string | null;
  createdAt: string;
  source?: AdminImportSourceRow;
  payloadJson?: Record<string, unknown> | null;
};

export type AdminImportPortalAggregate = {
  portalKey: string;
  portalLabel: string;
  branchesTotal: number;
  branchesEnabled: number;
  branchesRunning: number;
  branchesError: number;
  totalNew: number;
  totalUpdated: number;
};

export type AdminImportSourcesOverview = {
  portals: AdminImportPortalAggregate[];
  branches: AdminImportSourceRow[];
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
  type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
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
  type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
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
  type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
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

export async function nestSubmitFinancialAdvisorProfileRequest(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/agent-profile/request/financial-advisor`, {
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

export async function nestSubmitInvestorProfileRequest(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/agent-profile/request/investor`, {
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
): Promise<{ ok: boolean; error?: string; message?: string }> {
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
  const successMessage =
    typeof data.message === 'string' && data.message.trim()
      ? data.message.trim()
      : 'Role uživatele byla změněna.';
  return { ok: true };
}

export async function nestAdminSetUserPublicProfile(
  token: string | null,
  userId: string,
  publicProfile: boolean,
): Promise<{ ok: boolean; error?: string; publicProfile?: boolean }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/public-profile`,
    {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publicProfile }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
    publicProfile?: boolean;
    isPublicProfile?: boolean;
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
    publicProfile:
      typeof data.publicProfile === 'boolean'
        ? data.publicProfile
        : data.isPublicProfile === true,
  };
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

export async function nestAdminImportSources(
  token: string | null,
  filter?: {
    portalKey?: string;
    onlyEnabled?: boolean;
    onlyRunning?: boolean;
    onlyError?: boolean;
    search?: string;
  },
): Promise<AdminImportSourceRow[] | AdminImportSourcesOverview | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (filter?.portalKey) sp.set('portalKey', filter.portalKey);
  if (filter?.onlyEnabled) sp.set('onlyEnabled', '1');
  if (filter?.onlyRunning) sp.set('onlyRunning', '1');
  if (filter?.onlyError) sp.set('onlyError', '1');
  if (filter?.search?.trim()) sp.set('search', filter.search.trim());
  const qs = sp.toString();
  const res = await fetch(`${API_BASE_URL}/admin/import-sources${qs ? `?${qs}` : ''}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { portals?: unknown }).portals) &&
    Array.isArray((data as { branches?: unknown }).branches)
  ) {
    return data as AdminImportSourcesOverview;
  }
  return Array.isArray(data) ? (data as AdminImportSourceRow[]) : null;
}

export async function nestAdminUpdateImportSource(
  token: string | null,
  sourceId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: AdminImportSourceRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as AdminImportSourceRow };
}

export async function nestAdminCreateImportSource(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: AdminImportSourceRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-sources`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as AdminImportSourceRow };
}

export async function nestAdminDeleteImportSource(
  token: string | null,
  sourceId: string,
): Promise<{ ok: boolean; deletedId?: string; propertiesAffected?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  const deletedId =
    typeof data.deletedId === 'string' ? data.deletedId : sourceId;
  const propertiesAffected =
    typeof data.propertiesAffected === 'number' ? data.propertiesAffected : undefined;
  return { ok: true, deletedId, propertiesAffected };
}

/** Odpověď POST /admin/import-sources/:id/run (ImportRunResult z backendu). */
export type NestAdminImportRunResult = {
  importedNew?: number;
  importedUpdated?: number;
  skipped?: number;
  skippedInvalid?: number;
  failed?: number;
  disabled?: number;
  summary?: string | null;
  warnings?: string[];
  stats?: Record<string, unknown>;
  errors?: string[];
  itemErrors?: Array<Record<string, unknown>>;
};

export async function nestAdminRunImportSource(
  token: string | null,
  sourceId: string,
): Promise<{ ok: boolean; data?: NestAdminImportRunResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-sources/${encodeURIComponent(sourceId)}/run`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as NestAdminImportRunResult };
}

export async function nestAdminRunApifyImportSource(
  token: string | null,
  sourceId: string,
): Promise<{ ok: boolean; data?: NestAdminImportRunResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/imports/apify/${encodeURIComponent(sourceId)}/run`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as NestAdminImportRunResult };
}

export type ApifyImportQueueJob = {
  id: string;
  sourceId: string;
  apifyUrl: string;
  APIFY_URL?: string;
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'disabled';
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
  imagesSaved: number;
  progressPercent?: number;
  totalItems?: number;
  processedItems?: number;
  runAt: string;
  finishedAt?: string;
};

export async function nestImportApifyQueueStart(
  token: string | null,
  payload: { sourceId: string; APIFY_URL?: string },
): Promise<{ ok: boolean; data?: { jobId: string; status: string; APIFY_URL?: string }; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/import/apify`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    data: {
      jobId: String(data.jobId ?? ''),
      status: String(data.status ?? 'queued'),
      APIFY_URL: typeof data.APIFY_URL === 'string' ? data.APIFY_URL : undefined,
    },
  };
}

export async function nestImportApifyQueueJob(
  token: string | null,
  jobId: string,
): Promise<{ ok: boolean; data?: ApifyImportQueueJob; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/import/apify/jobs/${encodeURIComponent(jobId)}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: (data.job ?? data) as ApifyImportQueueJob };
}

export async function nestAdminToggleImportSource(
  token: string | null,
  sourceId: string,
  enabled: boolean,
): Promise<{ ok: boolean; data?: AdminImportSourceRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/imports/${encodeURIComponent(sourceId)}/toggle`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as AdminImportSourceRow };
}

export async function nestAdminImportSourceStatus(
  token: string | null,
  sourceId: string,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/imports/${encodeURIComponent(sourceId)}/status`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export type AdminImportProgressRow = {
  progressPercent: number;
  processedItems: number;
  totalItems: number | null;
  etaSeconds: number | null;
  currentMessage: string;
  lastError?: string | null;
  running?: boolean;
  done?: boolean;
};

export async function nestAdminImportProgress(
  token: string | null,
  sourceId: string,
): Promise<{ ok: boolean; data?: AdminImportProgressRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import/${encodeURIComponent(sourceId)}/progress`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as AdminImportProgressRow };
}

export async function nestAdminRunImportPortal(
  token: string | null,
  portalKey: string,
): Promise<{ ok: boolean; data?: Array<{ sourceId: string; ok: boolean; error?: string }>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-portals/${encodeURIComponent(portalKey)}/run`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    data: Array.isArray(data) ? (data as Array<{ sourceId: string; ok: boolean; error?: string }>) : [],
  };
}

export type AdminApifyDatasetImportResult = {
  imported: number;
  updated: number;
  failed: number;
  brokersCreated: number;
  brokersUpdated: number;
  imagesSaved: number;
  itemsWithImage?: number;
  itemsWithDetailUrl?: number;
  detailsFetched?: number;
  detailsFailed?: number;
  firstItemKeys?: string[];
  lastError: string | null;
};

export async function nestAdminImportApifyDataset(
  token: string | null,
  datasetUrl: string,
): Promise<{ ok: boolean; data?: AdminApifyDatasetImportResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/imports/apify-dataset`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ datasetUrl }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as AdminApifyDatasetImportResult };
}

/** POST /admin/imported-listings/bulk-shorts-drafts — hromadné koncepty shorts + náhodná hudba z knihovny. */
export async function nestAdminBulkShortsDraftsFromImported(
  token: string | null,
  body: {
    sourcePortalKey?: string;
    importCategoryKey?: string;
    city?: string;
    onlyNewImports?: boolean;
    limit?: number;
    propertyIds?: string[];
  },
): Promise<{
  ok: boolean;
  data?: {
    requestedLimit: number;
    attempted: number;
    succeeded: number;
    failed: number;
    results: Array<{ id: string; ok: boolean; error?: string }>;
  };
  error?: string;
}> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/imported-listings/bulk-shorts-drafts`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    data: data as {
      requestedLimit: number;
      attempted: number;
      succeeded: number;
      failed: number;
      results: Array<{ id: string; ok: boolean; error?: string }>;
    },
  };
}

export type NestAdminImportStreamEvent =
  | {
      type: 'progress';
      percent: number;
      message: string;
      phase?: string;
      totalListings?: number;
      processedListings?: number;
      totalDetails?: number;
      processedDetails?: number;
      savedCount?: number;
      updatedCount?: number;
      skippedCount?: number;
      errorCount?: number;
      failedCount?: number;
      lastProcessedSourceUrl?: string | null;
      lastItemErrorMessage?: string | null;
      lastItemErrorCategory?: string | null;
      lastItemErrorExternalId?: string | null;
      itemErrorLog?: Array<Record<string, unknown>>;
      progressPercent?: number;
      currentMessage?: string;
    }
  | {
      type: 'result';
      importedNew?: number;
      importedUpdated?: number;
      skipped?: number;
      skippedInvalid?: number;
      failed?: number;
      disabled?: number;
      summary?: string | null;
      warnings?: string[];
      stats?: Record<string, unknown>;
      errors?: string[];
      itemErrors?: Array<Record<string, unknown>>;
    }
  | { type: 'error'; message: string };

/**
 * NDJSON stream z POST `/admin/import-sources/:id/run-stream` — průběh importu + finální výsledek.
 */
export async function nestAdminRunImportSourceStream(
  token: string | null,
  sourceId: string,
  onEvent: (ev: NestAdminImportStreamEvent) => void,
): Promise<{ ok: boolean; data?: NestAdminImportRunResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/import-sources/${encodeURIComponent(sourceId)}/run-stream`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/x-ndjson' },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    } catch {
      return { ok: false, error: text.trim() || `HTTP ${res.status}` };
    }
  }
  if (!res.body) {
    return { ok: false, error: 'Prázdná odpověď streamu importu.' };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let finalResult: NestAdminImportRunResult | undefined;
  let streamError: string | undefined;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let ev: NestAdminImportStreamEvent;
      try {
        ev = JSON.parse(t) as NestAdminImportStreamEvent;
      } catch {
        continue;
      }
      onEvent(ev);
      if (ev.type === 'result') {
        finalResult = {
          importedNew: typeof ev.importedNew === 'number' ? ev.importedNew : 0,
          importedUpdated: typeof ev.importedUpdated === 'number' ? ev.importedUpdated : 0,
          skipped: typeof ev.skipped === 'number' ? ev.skipped : 0,
          skippedInvalid: typeof ev.skippedInvalid === 'number' ? ev.skippedInvalid : 0,
          failed: typeof ev.failed === 'number' ? ev.failed : 0,
          disabled: typeof ev.disabled === 'number' ? ev.disabled : 0,
          summary: typeof ev.summary === 'string' ? ev.summary : null,
          warnings: Array.isArray(ev.warnings) ? ev.warnings.filter((x): x is string => typeof x === 'string') : [],
          stats: ev.stats,
          errors: Array.isArray(ev.errors) ? ev.errors.filter((x): x is string => typeof x === 'string') : [],
          itemErrors: Array.isArray(ev.itemErrors) ? ev.itemErrors : [],
        };
      }
      if (ev.type === 'error') {
        streamError = ev.message;
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      const ev = JSON.parse(tail) as NestAdminImportStreamEvent;
      onEvent(ev);
      if (ev.type === 'result') {
        finalResult = {
          importedNew: typeof ev.importedNew === 'number' ? ev.importedNew : 0,
          importedUpdated: typeof ev.importedUpdated === 'number' ? ev.importedUpdated : 0,
          skipped: typeof ev.skipped === 'number' ? ev.skipped : 0,
          skippedInvalid: typeof ev.skippedInvalid === 'number' ? ev.skippedInvalid : 0,
          failed: typeof ev.failed === 'number' ? ev.failed : 0,
          disabled: typeof ev.disabled === 'number' ? ev.disabled : 0,
          summary: typeof ev.summary === 'string' ? ev.summary : null,
          warnings: Array.isArray(ev.warnings) ? ev.warnings.filter((x): x is string => typeof x === 'string') : [],
          stats: ev.stats,
          errors: Array.isArray(ev.errors) ? ev.errors.filter((x): x is string => typeof x === 'string') : [],
          itemErrors: Array.isArray(ev.itemErrors) ? ev.itemErrors : [],
        };
      }
      if (ev.type === 'error') streamError = ev.message;
    } catch {
      /* ignore */
    }
  }
  if (streamError) return { ok: false, error: streamError };
  if (finalResult) return { ok: true, data: finalResult };
  return { ok: false, error: 'Stream skončil bez výsledku importu.' };
}

export async function nestAdminImportLogs(
  token: string | null,
  filter?: { sourceId?: string; portalKey?: string; categoryKey?: string },
): Promise<AdminImportLogRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (filter?.sourceId) sp.set('sourceId', filter.sourceId);
  if (filter?.portalKey) sp.set('portalKey', filter.portalKey);
  if (filter?.categoryKey) sp.set('categoryKey', filter.categoryKey);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/import-logs${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AdminImportLogRow[]) : null;
}

export async function nestAdminBulkDisableImported(
  token: string | null,
  body: { source?: string; method?: string },
): Promise<{ ok: boolean; affected?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/import-disable/bulk`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, affected: typeof data.affected === 'number' ? data.affected : 0 };
}

export type AdminImportedBrokerContactRow = {
  id: string;
  fullName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  website: string | null;
  address: string | null;
  sourcePortal: string | null;
  sourceUrl: string | null;
  city: string | null;
  notes: string | null;
  listingCount: number;
  status: string;
  contactStatus: string;
  profileCreated: boolean;
  invitedAt: string | null;
  outreachStatus: string;
  outreachNote: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  importedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminImportedBrokerContactsList = {
  items: AdminImportedBrokerContactRow[];
  total: number;
  skip: number;
  take: number;
};

export type AdminImportedBrokerContactsQuery = {
  search?: string;
  portal?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  profileCreated?: boolean;
  outreachStatus?: string;
  contactStatus?: string;
  sort?: string;
  skip?: number;
  take?: number;
};

export async function nestAdminBrokerContacts(
  token: string | null,
  query?: AdminImportedBrokerContactsQuery,
): Promise<AdminImportedBrokerContactsList | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (query?.search) sp.set('search', query.search);
  if (query?.portal) sp.set('portal', query.portal);
  if (query?.hasEmail === true) sp.set('hasEmail', '1');
  if (query?.hasEmail === false) sp.set('hasEmail', '0');
  if (query?.hasPhone === true) sp.set('hasPhone', '1');
  if (query?.hasPhone === false) sp.set('hasPhone', '0');
  if (query?.profileCreated === true) sp.set('profileCreated', '1');
  if (query?.profileCreated === false) sp.set('profileCreated', '0');
  if (query?.outreachStatus) sp.set('outreachStatus', query.outreachStatus);
  if (query?.contactStatus) sp.set('contactStatus', query.contactStatus);
  if (query?.sort) sp.set('sort', query.sort);
  if (query?.skip != null) sp.set('skip', String(query.skip));
  if (query?.take != null) sp.set('take', String(query.take));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/broker-contacts${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as AdminImportedBrokerContactsList | null;
  if (!data || !Array.isArray(data.items)) return null;
  return data;
}

export async function nestAdminBrokerContactDetail(
  token: string | null,
  id: string,
): Promise<unknown | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/broker-contacts/${encodeURIComponent(id)}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function nestAdminPatchBrokerContact(
  token: string | null,
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/broker-contacts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminBrokerContactsBulkUpdate(
  token: string | null,
  body: { ids: string[]; outreachStatus?: string; contactStatus?: string; status?: string; profileCreated?: boolean },
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/broker-contacts/bulk-update`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, updated: typeof data.updated === 'number' ? data.updated : 0 };
}

export async function nestAdminDownloadBrokerContactsCsv(
  token: string | null,
  query?: Pick<
    AdminImportedBrokerContactsQuery,
    'search' | 'portal' | 'hasEmail' | 'hasPhone' | 'contactStatus' | 'outreachStatus' | 'profileCreated'
  >,
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const sp = new URLSearchParams();
  if (query?.search) sp.set('search', query.search);
  if (query?.portal) sp.set('portal', query.portal);
  if (query?.hasEmail === true) sp.set('hasEmail', '1');
  if (query?.hasEmail === false) sp.set('hasEmail', '0');
  if (query?.hasPhone === true) sp.set('hasPhone', '1');
  if (query?.hasPhone === false) sp.set('hasPhone', '0');
  if (query?.profileCreated === true) sp.set('profileCreated', '1');
  if (query?.profileCreated === false) sp.set('profileCreated', '0');
  if (query?.outreachStatus) sp.set('outreachStatus', query.outreachStatus);
  if (query?.contactStatus) sp.set('contactStatus', query.contactStatus);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/broker-contacts/export${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'text/csv' },
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const blob = await res.blob();
  return { ok: true, blob };
}

export type BrokerDirectoryImportPreview = {
  profilesFound: number;
  sample: Array<{
    companyName: string;
    email: string | null;
    phone: string | null;
    normalizedPhone: string | null;
    website: string | null;
    city: string | null;
    address: string | null;
    sourceUrl: string;
    listingCount: number;
  }>;
  pagesScanned: number;
  errors: string[];
};

export type BrokerDirectoryImportResult = {
  profilesFound: number;
  created: number;
  updated: number;
  duplicates: number;
  withoutEmail: number;
  withoutPhone: number;
  errors: string[];
  pagesScanned: number;
};

export type BrokerDatabaseWhatsAppAudience = {
  mode: 'selected_ids' | 'filtered' | 'all_imported';
  selectedContactIds?: string[];
  filter?: AdminImportedBrokerContactsQuery;
};

export async function nestAdminBrokerDatabaseImportPreview(
  token: string | null,
  body: { directoryUrl?: string; source?: string },
): Promise<{ ok: boolean; data?: BrokerDirectoryImportPreview; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/broker-database/import-preview`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as unknown as BrokerDirectoryImportPreview };
}

export async function nestAdminBrokerDatabaseImportRun(
  token: string | null,
  body: { directoryUrl?: string; source?: string },
): Promise<{ ok: boolean; data?: BrokerDirectoryImportResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/broker-database/import-run`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data: data as unknown as BrokerDirectoryImportResult };
}

export async function nestAdminBrokerDatabaseWhatsAppCount(
  token: string | null,
  audience: BrokerDatabaseWhatsAppAudience,
): Promise<{ count: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/broker-database/whatsapp-campaign/count`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audience }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { count?: number } | null;
  return { count: typeof data?.count === 'number' ? data.count : 0 };
}

export async function nestAdminBrokerDatabaseWhatsAppCampaign(
  token: string | null,
  body: {
    audience: BrokerDatabaseWhatsAppAudience;
    name?: string;
    waMetaTemplateId?: string;
    waTemplateName?: string;
    waTemplateLanguage?: string;
    confirmed?: boolean;
  },
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/broker-database/whatsapp-campaign`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, data };
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

export type PropertySocialNetworkStatus = {
  platform: 'facebook' | 'instagram' | 'youtube' | 'tiktok';
  label: string;
  enabled: boolean;
  configured: boolean;
  status: 'NOT_PUBLISHED' | 'PENDING' | 'PUBLISHED' | 'FAILED' | 'REPEAT_ACTIVE' | 'DISABLED';
  publishedUrl: string | null;
  lastError: string | null;
  lastAt: string | null;
};

export type PropertySocialPublishSummary = {
  autoPublishEnabled: boolean;
  publishedNetworks: string[];
  disabledMessage: string | null;
  networks: PropertySocialNetworkStatus[];
  logs: Array<{
    id: string;
    createdAt: string;
    platform: string;
    publishKind: string | null;
    status: string;
    publishedUrl: string | null;
    lastError: string | null;
    triggeredBy: string | null;
  }>;
};

export type PropertyCreationMeta = {
  propertyId: string;
  requiresApproval: boolean;
  listingStatus: string;
  socialPublish: PropertySocialPublishSummary;
};

export async function nestCreatePropertyListingMultipart(
  token: string | null,
  formData: FormData,
): Promise<
  | { ok: true; bonusGranted?: BonusGrantedDto; creationMeta?: PropertyCreationMeta }
  | { ok: false; error?: string }
> {
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
      bonusGranted?: BonusGrantedDto;
      creationMeta?: PropertyCreationMeta;
      id?: string;
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
      bonusGranted: data.bonusGranted?.granted ? data.bonusGranted : undefined,
      creationMeta: data.creationMeta,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type ListingPrefillFromUrlData = {
  title: string | null;
  description: string | null;
  location: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  district: string | null;
  propertyType: string | null;
  offerType: string | null;
  subType: string | null;
  area: number | null;
  landArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  condition: string | null;
  construction: string | null;
  ownership: string | null;
  energyClass: string | null;
  equipment: string | null;
  price: number | null;
  currency: string | null;
  sourceImageUrls: string[];
  canUseSourceImages: boolean;
  rawSourceData: Record<string, unknown> | null;
};

export async function nestPrefillListingFromUrl(
  token: string | null,
  sourceUrl: string,
  options?: { timeoutMs?: number },
): Promise<
  { ok: true; data: ListingPrefillFromUrlData } | { ok: false; error: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/listings/prefill-from-url`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ sourceUrl }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: ListingPrefillFromUrlData;
    };
    if (!res.ok || !data.ok || !data.data) {
      const statusHint =
        res.status === 403
          ? 'Sreality blokuje načtení (HTTP 403).'
          : res.status === 408 || res.status === 504
            ? 'Načtení trvalo příliš dlouho. Zkuste to později nebo vyplňte inzerát ručně.'
            : res.status >= 500
              ? `Chyba serveru (HTTP ${res.status}).`
              : null;
      return {
        ok: false,
        error:
          data.error ??
          statusHint ??
          `Import selhal (HTTP ${res.status}). Vyplňte inzerát ručně.`,
      };
    }
    return { ok: true, data: data.data };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Načtení trvalo příliš dlouho. Zkuste to později nebo vyplňte inzerát ručně.',
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    const hint = /timeout|aborted/i.test(msg)
      ? 'Načtení trvalo příliš dlouho. Zkuste to později nebo vyplňte inzerát ručně.'
      : /network|fetch/i.test(msg)
        ? 'Síťová chyba při komunikaci se serverem.'
        : `Chyba připojení: ${msg}`;
    return { ok: false, error: hint };
  } finally {
    clearTimeout(timer);
  }
}

export type SrealityPrefillDebugLog = {
  url: string;
  extractedListingId?: string | null;
  strategyUsed?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  apiStatus?: number | null;
  htmlStatus?: number | null;
  playwrightStatus?: string | null;
  httpStatus: number | null;
  cloudflareDetected: boolean;
  playwrightAttempted?: boolean;
  playwrightLoaded: boolean;
  playwrightFailed?: boolean;
  fetchFallbackUsed?: boolean;
  foundJsonLd: boolean;
  foundNextData: boolean;
  foundInitialState: boolean;
  foundOpenGraph: boolean;
  foundHtmlParser: boolean;
  fieldsFoundCount: number;
  fieldsFound: string[];
  parsersUsed: string[];
  htmlLength: number;
  finalUrl: string;
  errorCode?: string;
  errorDetail?: string;
};

export type SrealityPrefillDebugResult = {
  ok: boolean;
  error?: string;
  data?: ListingPrefillFromUrlData;
  log?: SrealityPrefillDebugLog;
  debug?: {
    foundJsonLd: boolean;
    foundNextData: boolean;
    foundInitialState: boolean;
    foundOpenGraph: boolean;
    foundHtmlParser: boolean;
    parsersUsed: string[];
    fieldsFound: string[];
    fieldsFoundCount: number;
  };
};

export async function nestAdminSrealityPrefillDebug(
  token: string | null,
  sourceUrl: string,
): Promise<{ ok: boolean; error?: string; data?: SrealityPrefillDebugResult }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/listings/sreality-prefill-debug`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ sourceUrl }),
    });
    const payload = (await res.json().catch(() => ({}))) as SrealityPrefillDebugResult;
    if (!res.ok) {
      return {
        ok: false,
        error: payload.error ?? `Debug selhal (HTTP ${res.status}).`,
        data: payload,
      };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Debug selhal.',
    };
  }
}

export async function nestFetchListingSourceImages(
  token: string | null,
  urls: string[],
): Promise<
  | {
      ok: true;
      images: Array<{ fileName: string; mimeType: string; base64: string }>;
    }
  | { ok: false; error: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/listings/fetch-source-images`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ urls }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      images?: Array<{ fileName: string; mimeType: string; base64: string }>;
    };
    if (!res.ok || !data.ok || !data.images?.length) {
      return {
        ok: false,
        error: data.error ?? 'Fotky prosím nahrajte vlastní.',
      };
    }
    return { ok: true, images: data.images };
  } catch {
    return { ok: false, error: 'Fotky prosím nahrajte vlastní.' };
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

export async function nestNotificationsUnreadCount(token: string | null): Promise<number> {
  if (!API_BASE_URL || !token) return 0;
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return 0;
    const data = (await res.json().catch(() => ({}))) as { count?: number };
    return typeof data.count === 'number' ? data.count : 0;
  } catch {
    return 0;
  }
}

export type NotificationPrefs = {
  notifyNewPosts: boolean;
  notifyNewMessages: boolean;
  notifyWhatsAppAlerts: boolean;
  notifyPwaPush: boolean;
  pushConfigured: boolean;
  pushSubscribed: boolean;
  pushSetupIssues?: string[];
  pushSetupInstructions?: string[];
  vapidActive?: boolean;
  pushActive?: boolean;
};

export async function nestGetNotificationPrefs(
  token: string,
): Promise<NotificationPrefs | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/notification-prefs`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as NotificationPrefs;
  } catch {
    return null;
  }
}

export async function nestPatchNotificationPrefs(
  token: string,
  body: Partial<
    Pick<
      NotificationPrefs,
      'notifyNewPosts' | 'notifyNewMessages' | 'notifyWhatsAppAlerts' | 'notifyPwaPush'
    >
  >,
): Promise<{ ok: true; prefs: NotificationPrefs } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/notification-prefs`, {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as NotificationPrefs & {
      message?: string | string[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, prefs: data as NotificationPrefs };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestPushAdminStatus(
  token: string,
): Promise<{
  configured: boolean;
  issues: string[];
  instructions: string[];
} | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/push/admin-status`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      configured?: boolean;
      issues?: string[];
      instructions?: string[];
    };
    return {
      configured: Boolean(data.configured),
      issues: Array.isArray(data.issues) ? data.issues.filter((x) => typeof x === 'string') : [],
      instructions: Array.isArray(data.instructions)
        ? data.instructions.filter((x) => typeof x === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export async function nestPushVapidPublicKey(
  token: string,
): Promise<{ publicKey: string | null; configured: boolean } | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/push/vapid-public-key`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string | null; configured?: boolean };
    return {
      publicKey: typeof data.publicKey === 'string' ? data.publicKey : null,
      configured: Boolean(data.configured),
    };
  } catch {
    return null;
  }
}

export async function nestPushSubscribe(
  token: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(subscription),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestPushTest(
  token: string,
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/push/test`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    const data = (await res.json().catch(() => ({}))) as {
      sent?: number;
      message?: string | string[];
    };
    if (!res.ok) {
      return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
    }
    return { ok: true, sent: typeof data.sent === 'number' ? data.sent : 0 };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestSendEmailVerification(
  token: string | null,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!token) return { ok: false, error: 'Nejste přihlášeni.' };
  const url = API_BASE_URL
    ? `${API_BASE_URL}/auth/send-email-verification`
    : '/api/auth/send-email-verification';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      credentials: 'include',
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error:
          data.error ??
          nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    if (data.success === false) {
      return { ok: false, error: data.error ?? 'Odeslání e-mailu se nezdařilo.' };
    }
    return { ok: true, message: data.message ?? 'Ověřovací e-mail byl odeslán.' };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestVerifyEmailByToken(
  verifyToken: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const trimmed = verifyToken.trim();
  if (!trimmed) {
    return { ok: false, error: 'Ověřovací odkaz je neplatný nebo expiroval.' };
  }
  const url = API_BASE_URL
    ? `${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(trimmed)}`
    : `/api/auth/verify-email?token=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { method: 'GET', credentials: 'include' });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
    };
    if (!res.ok || data.success === false) {
      return {
        ok: false,
        error: data.error ?? 'Ověřovací odkaz je neplatný nebo expiroval.',
      };
    }
    return { ok: true, message: data.message ?? 'E-mail byl úspěšně ověřen.' };
  } catch {
    return { ok: false, error: 'Nelze se spojit se serverem.' };
  }
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
  price: number | null;
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

export type NestProfileWallPost = {
  id: string;
  title?: string | null;
  content?: string | null;
  description?: string | null;
  createdAt?: string;
  media?: Array<{ url?: string; type?: string; order?: number }>;
  source?: 'INTERNAL' | 'FACEBOOK' | string;
  isFacebookPagePost?: boolean;
  facebookPostType?: 'FACEBOOK_POST' | 'FACEBOOK_VIDEO' | 'FACEBOOK_REEL' | string | null;
  facebookEmbedUrl?: string | null;
  facebookPermalink?: string | null;
  externalUrl?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  previewImage?: string | null;
  previewSiteName?: string | null;
  facebookVideoThumbnail?: string | null;
};

export type NestProfileWallVideo = {
  id: string;
  url?: string | null;
  description?: string | null;
  createdAt?: string;
};

export async function nestFetchProfileWall(
  profileUserId: string,
  token?: string | null,
): Promise<{ posts: NestProfileWallPost[]; videos: NestProfileWallVideo[] } | null> {
  const profile = await nestFetchPublicProfile(profileUserId, token);
  if (!profile) return null;
  const posts = Array.isArray(profile.posts) ? (profile.posts as NestProfileWallPost[]) : [];
  const videos = Array.isArray(profile.videos) ? (profile.videos as NestProfileWallVideo[]) : [];
  return { posts, videos };
}

/** GET /users/:id — chybějící profil vrátí null, nevyhazuje. */
export async function nestFetchPublicProfile(
  profileUserId: string,
  token?: string | null,
): Promise<{
  user: Record<string, unknown> | null;
  posts?: unknown[];
  videos?: unknown[];
  properties?: unknown[];
} | null> {
  if (!API_BASE_URL || !profileUserId.trim()) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(profileUserId)}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token ? nestAuthHeaders(token) : {}),
      },
    });
    const data = (await res.json().catch(() => null)) as {
      user?: Record<string, unknown> | null;
      posts?: unknown[];
      videos?: unknown[];
      properties?: unknown[];
    } | null;
    if (!res.ok || !data?.user) {
      console.error('PROFILE LOAD FAILED', profileUserId, res.status);
      return null;
    }
    return {
      user: data.user,
      posts: data.posts,
      videos: data.videos,
      properties: data.properties,
    };
  } catch (err) {
    console.error('PROFILE LOAD FAILED', profileUserId, err);
    return null;
  }
}

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
  sourceOfferType?: string;
  isTiparTip?: boolean;
  overlayText?: string;
  overlayStyle?: string;
  overlayFont?: string;
  overlayColor?: string;
  overlayFontSize?: number;
  overlayPosition?: string;
  showLogo?: boolean;
  showOverlayText?: boolean;
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

/** POST /properties/:id/top — topování vlastního inzerátu (JWT). */
export async function nestTopMyProperty(
  token: string | null,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}/top`, {
    method: 'POST',
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

export type NestPropertyDetailFetchResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number };

/** GET /properties/:id — detail s JWT (vlastník vidí neschválené). */
export async function nestFetchPropertyDetail(
  propertyId: string,
  token: string | null,
  options?: { includeOther?: boolean; signal?: AbortSignal },
): Promise<NestPropertyDetailFetchResult> {
  if (!API_BASE_URL) return { ok: false, status: 0 };
  const qs =
    options?.includeOther === false ? '?includeOther=false' : '';
  const url = `${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}${qs}`;
  const { logListingDetailNavigation, shouldLogListingDetailNav } = await import(
    '@/lib/listing-detail-debug'
  );
  if (shouldLogListingDetailNav()) {
    logListingDetailNavigation('api-request', {
      listingId: propertyId,
      url,
      apiBase: API_BASE_URL,
    });
  }
  const res = await fetch(url, {
    cache: 'no-store',
    signal: options?.signal,
    headers: { Accept: 'application/json', ...nestAuthHeaders(token) },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json().catch(() => null)) as unknown;
  if (data == null) return { ok: false, status: 502 };
  return { ok: true, data };
}

/** @deprecated Použijte nestFetchPropertyDetail. */
export async function nestFetchPropertyDetailJson(
  propertyId: string,
  token: string | null,
): Promise<unknown | null> {
  const r = await nestFetchPropertyDetail(propertyId, token);
  return r.ok ? r.data : null;
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

export async function nestPatchProfessionalVisibility(
  token: string | null,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string; role?: string; isPublic?: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/me/professional-visibility`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isPublic }),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    role: typeof raw.role === 'string' ? raw.role : undefined,
    isPublic: typeof raw.isPublic === 'boolean' ? raw.isPublic : undefined,
  };
}

export type ProfessionalVerificationRequestRow = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  roleLabel: string;
  bio: string;
  avatarUrl: string | null;
  companyOrBrand: string | null;
  requestedAt: string | null;
};

/** POST /profile/request-verification */
export async function nestRequestProfessionalVerification(
  token: string | null,
  body: { requestVerification: boolean; publishAfterApproval: boolean },
): Promise<{ ok: boolean; error?: string; message?: string; professionalVerificationStatus?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/profile/request-verification`, {
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
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    professionalVerificationStatus:
      typeof raw.professionalVerificationStatus === 'string'
        ? raw.professionalVerificationStatus
        : undefined,
  };
}

export async function nestAdminProfessionalVerificationRequests(
  token: string | null,
): Promise<ProfessionalVerificationRequestRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/professional-verification-requests`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return null;
  return data
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const o = row as Record<string, unknown>;
      if (typeof o.id !== 'string') return null;
      return {
        id: o.id,
        userId: typeof o.userId === 'string' ? o.userId : o.id,
        email: typeof o.email === 'string' ? o.email : '',
        name: typeof o.name === 'string' ? o.name : null,
        role: typeof o.role === 'string' ? o.role : '',
        roleLabel: typeof o.roleLabel === 'string' ? o.roleLabel : '',
        bio: typeof o.bio === 'string' ? o.bio : '',
        avatarUrl:
          o.avatarUrl === null || typeof o.avatarUrl === 'string'
            ? (o.avatarUrl as string | null)
            : null,
        companyOrBrand:
          o.companyOrBrand === null || typeof o.companyOrBrand === 'string'
            ? (o.companyOrBrand as string | null)
            : null,
        requestedAt:
          o.requestedAt === null || typeof o.requestedAt === 'string'
            ? (o.requestedAt as string | null)
            : null,
      };
    })
    .filter((x): x is ProfessionalVerificationRequestRow => Boolean(x));
}

export async function nestAdminApproveProfessionalVerification(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/professional-verification-requests/${encodeURIComponent(userId)}/approve`,
    { method: 'POST', headers: { ...nestAuthHeaders(token), Accept: 'application/json' } },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminRejectProfessionalVerification(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/professional-verification-requests/${encodeURIComponent(userId)}/reject`,
    { method: 'POST', headers: { ...nestAuthHeaders(token), Accept: 'application/json' } },
  );
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export type NestCompanyAdRow = {
  id: string;
  isActive: boolean;
};

export async function nestListMyCompanyAds(
  token: string | null,
): Promise<NestCompanyAdRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/company-ads/me`, {
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) return null;
  return data
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      if (typeof o.id !== 'string') return null;
      return { id: o.id, isActive: o.isActive === true };
    })
    .filter((x): x is NestCompanyAdRow => Boolean(x));
}

export type NestPublicBrokerCard = {
  id: string;
  slug: string | null;
  role: 'AGENT' | 'COMPANY' | 'AGENCY' | 'CRAFTSMAN' | 'FINANCIAL_ADVISOR' | 'INVESTOR' | 'PORTAL_WORKER';
  name: string | null;
  avatarUrl: string | null;
  officeName: string;
  regionLabel: string;
  city?: string;
  phonePublic?: string | null;
  emailPublic?: string | null;
  bioExcerpt: string;
  ratingAverage: number | null;
  ratingCount: number | null;
  verificationStatus: 'pending' | 'verified' | 'rejected' | null;
  isVerified: boolean;
};

function normalizeNestPublicBrokerCard(raw: unknown): NestPublicBrokerCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const role = String(o.role ?? 'AGENT').toUpperCase();
  const allowed = [
    'AGENT',
    'COMPANY',
    'AGENCY',
    'CRAFTSMAN',
    'FINANCIAL_ADVISOR',
    'INVESTOR',
    'PORTAL_WORKER',
  ] as const;
  if (!allowed.includes(role as (typeof allowed)[number])) return null;
  const vsRaw = o.verificationStatus;
  const verificationStatus =
    vsRaw === 'pending' || vsRaw === 'verified' || vsRaw === 'rejected' ? vsRaw : null;
  const isVerified = o.isVerified === true || verificationStatus === 'verified';
  const city =
    typeof o.city === 'string' && o.city.trim()
      ? o.city.trim()
      : typeof o.regionLabel === 'string'
        ? o.regionLabel
        : '';
  return {
    id: o.id,
    slug: typeof o.slug === 'string' ? o.slug : null,
    role: role as NestPublicBrokerCard['role'],
    name: typeof o.name === 'string' ? o.name : null,
    avatarUrl: typeof o.avatarUrl === 'string' ? o.avatarUrl : null,
    officeName: typeof o.officeName === 'string' ? o.officeName : '',
    regionLabel: typeof o.regionLabel === 'string' ? o.regionLabel : city,
    city,
    phonePublic: typeof o.phonePublic === 'string' ? o.phonePublic : null,
    emailPublic: typeof o.emailPublic === 'string' ? o.emailPublic : null,
    bioExcerpt: typeof o.bioExcerpt === 'string' ? o.bioExcerpt : '',
    ratingAverage: typeof o.ratingAverage === 'number' ? o.ratingAverage : null,
    ratingCount: typeof o.ratingCount === 'number' ? o.ratingCount : null,
    verificationStatus,
    isVerified,
  };
}

/** GET /professionals/public (fallback /brokers/public) */
export async function nestListPublicProfessionals(
  options?: { roles?: string },
): Promise<NestPublicBrokerCard[] | null> {
  if (!API_BASE_URL) return null;
  const qs = options?.roles?.trim()
    ? `?roles=${encodeURIComponent(options.roles.trim())}`
    : '';
  const endpoints = [`${API_BASE_URL}/professionals/public${qs}`, `${API_BASE_URL}/brokers/public${qs}`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) continue;
      const rows = data
        .map((row) => normalizeNestPublicBrokerCard(row))
        .filter((row): row is NestPublicBrokerCard => Boolean(row));
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.info('[professionals] loaded', { url, count: rows.length });
      }
      return rows;
    } catch {
      /* try fallback */
    }
  }
  return null;
}

/** GET /brokers/public */
export async function nestListPublicBrokers(
  token: string | null,
  options?: { roles?: string },
): Promise<NestPublicBrokerCard[] | null> {
  void token;
  return nestListPublicProfessionals(options);
}

export type PurchaseAdviceArticleRow = {
  id: string;
  title: string;
  imageUrl?: string | null;
  category?: string;
  body?: string;
  isPublished?: boolean;
  sortOrder?: number;
  createdAt?: string;
};

export type PurchaseAdviceArticleAdminRow = PurchaseAdviceArticleRow & {
  body: string;
  isPublished: boolean;
  sortOrder: number;
};

export async function nestListPurchaseAdviceArticles(
  limit = 12,
): Promise<PurchaseAdviceArticleRow[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(
      `${API_BASE_URL}/purchase-advice-articles/public?limit=${encodeURIComponent(String(limit))}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as PurchaseAdviceArticleRow[]) : [];
  } catch {
    return [];
  }
}

export async function nestGetPurchaseAdviceArticle(
  id: string,
): Promise<PurchaseAdviceArticleRow | null> {
  if (!API_BASE_URL || !id.trim()) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/purchase-advice-articles/public/${encodeURIComponent(id.trim())}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    return (await res.json()) as PurchaseAdviceArticleRow;
  } catch {
    return null;
  }
}

export async function nestAdminPurchaseAdviceArticlesList(
  token: string,
): Promise<{ ok: boolean; rows?: PurchaseAdviceArticleAdminRow[]; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/admin/purchase-advice-articles`, {
      cache: 'no-store',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminPurchaseAdviceArticleCreate(
  token: string,
  body: {
    title: string;
    imageUrl?: string;
    body: string;
    category?: string;
    isPublished?: boolean;
    sortOrder?: number;
  },
): Promise<{ ok: boolean; row?: PurchaseAdviceArticleAdminRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/admin/purchase-advice-articles`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, row: data as PurchaseAdviceArticleAdminRow };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminPurchaseAdviceArticleUpdate(
  token: string,
  id: string,
  body: Partial<{
    title: string;
    imageUrl: string;
    body: string;
    category: string;
    isPublished: boolean;
    sortOrder: number;
  }>,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/purchase-advice-articles/${encodeURIComponent(id)}`,
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminPurchaseAdviceArticleDelete(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/purchase-advice-articles/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: nestAuthHeaders(token),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type NestStoryRow = {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  mediaUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  expiresAt: string;
  user: {
    id: string;
    name: string | null;
    avatar: string | null;
    role: string;
    brokerProfileSlug: string | null;
  };
};

export async function nestListPublicStories(): Promise<NestStoryRow[] | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/stories/public`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as unknown;
  return Array.isArray(data) ? (data as NestStoryRow[]) : null;
}

export async function nestCreateStory(
  token: string | null,
  file: File,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/stories`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: fd,
  });
  if (res.ok) return { ok: true };
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
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
    whatsappEnabled?: boolean;
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

export type ShareGateVideoAdminDto = {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  targetType: string;
  isActive: boolean;
  sortOrder: number;
  minWatchSeconds: number;
  buttonText: string;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function nestAdminShareGateVideosList(
  token: string | null,
): Promise<ShareGateVideoAdminDto[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/share-gate-videos`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as ShareGateVideoAdminDto[]) : null;
}

export async function nestAdminShareGateVideoUpload(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true; video: ShareGateVideoAdminDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/share-gate-videos/upload`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as ShareGateVideoAdminDto & {
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
    return { ok: false, error: 'Server nevrátil video.' };
  }
  return { ok: true, video: data as ShareGateVideoAdminDto };
}

/** PATCH /admin/share-gate-videos/:id — multipart metadata + volitelně video/poster. */
export async function nestAdminShareGateVideoPatch(
  token: string | null,
  id: string,
  formData: FormData,
): Promise<{ ok: true; video: ShareGateVideoAdminDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/share-gate-videos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as ShareGateVideoAdminDto & {
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
    return { ok: false, error: 'Server nevrátil upravené video.' };
  }
  return { ok: true, video: data as ShareGateVideoAdminDto };
}

export async function nestAdminShareGateVideoUpdate(
  token: string | null,
  id: string,
  body: {
    title?: string;
    targetType?: string;
    isActive?: boolean;
    sortOrder?: number;
    minWatchSeconds?: number;
    buttonText?: string;
    activeFrom?: string | null;
    activeTo?: string | null;
    clearPoster?: boolean;
  },
  files?: { video?: File | null; poster?: File | null },
): Promise<{ ok: boolean; error?: string; video?: ShareGateVideoAdminDto }> {
  const fd = new FormData();
  if (body.title !== undefined) fd.append('title', body.title);
  if (body.targetType !== undefined) fd.append('targetType', body.targetType);
  if (body.isActive !== undefined) fd.append('isActive', body.isActive ? 'true' : 'false');
  if (body.sortOrder !== undefined) fd.append('sortOrder', String(body.sortOrder));
  if (body.minWatchSeconds !== undefined) fd.append('minWatchSeconds', String(body.minWatchSeconds));
  if (body.buttonText !== undefined) fd.append('buttonText', body.buttonText);
  if (body.activeFrom !== undefined) fd.append('activeFrom', body.activeFrom ?? '');
  if (body.activeTo !== undefined) fd.append('activeTo', body.activeTo ?? '');
  if (body.clearPoster) fd.append('clearPoster', 'true');
  if (files?.video) fd.append('video', files.video);
  if (files?.poster) fd.append('poster', files.poster);

  const r = await nestAdminShareGateVideoPatch(token, id, fd);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, video: r.video };
}

export async function nestAdminShareGateVideoDelete(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/share-gate-videos/${encodeURIComponent(id)}`, {
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

export type BonusCampaignAdminDto = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  bonusText: string;
  amount: number;
  appliesTo: 'LISTING' | 'TIP' | 'BOTH';
  actionType: string;
  roles: string[];
  isActive: boolean;
  activeFrom: string | null;
  activeTo: string | null;
  oncePerUser: boolean;
  maxTotalClaims: number | null;
  maxClaimsPerUser: number;
  conditionMinCount: number;
  customConditionText: string;
  claimsCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type BonusGrantedDto = {
  granted: boolean;
  amount?: number;
  message?: string;
  campaignId?: string;
};

export async function nestAdminBonusCampaignsList(
  token: string | null,
): Promise<BonusCampaignAdminDto[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/bonus-campaigns`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as BonusCampaignAdminDto[]) : null;
}

export async function nestAdminBonusCampaignCreate(
  token: string | null,
  body: Omit<BonusCampaignAdminDto, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ ok: true; campaign: BonusCampaignAdminDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/bonus-campaigns`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BonusCampaignAdminDto & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, campaign: data };
}

export async function nestAdminBonusCampaignUpdate(
  token: string | null,
  id: string,
  body: Partial<Omit<BonusCampaignAdminDto, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<{ ok: true; campaign: BonusCampaignAdminDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/bonus-campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BonusCampaignAdminDto & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, campaign: data };
}

export type RegistrationGateAdminSettings = {
  id: string;
  requireFirstContent: boolean;
  shortsGateEnabled: boolean;
  shortsGateAfterViews: number;
  gateType: string;
  title: string;
  description: string;
  buttonText: string;
  videoUrl: string | null;
  bannerImageUrl: string | null;
  skipAfterSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export async function nestAdminRegistrationGateGet(
  token: string | null,
): Promise<RegistrationGateAdminSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/registration-gate`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as RegistrationGateAdminSettings | null;
}

export async function nestAdminRegistrationGatePatch(
  token: string | null,
  body: Partial<
    Omit<RegistrationGateAdminSettings, 'id' | 'createdAt' | 'updatedAt'>
  >,
): Promise<{ ok: true; settings: RegistrationGateAdminSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/registration-gate`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as RegistrationGateAdminSettings & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, settings: data };
}

export async function nestAdminRegistrationGateUploadVideo(
  token: string | null,
  file: File,
): Promise<{ ok: true; settings: RegistrationGateAdminSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const fd = new FormData();
  fd.append('video', file);
  const res = await fetch(`${API_BASE_URL}/admin/registration-gate/upload-video`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as RegistrationGateAdminSettings & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, settings: data };
}

export async function nestAdminRegistrationGateUploadBanner(
  token: string | null,
  file: File,
): Promise<{ ok: true; settings: RegistrationGateAdminSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const fd = new FormData();
  fd.append('banner', file);
  const res = await fetch(`${API_BASE_URL}/admin/registration-gate/upload-banner`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as RegistrationGateAdminSettings & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, settings: data };
}

export type RegistrationGamificationConfig = {
  gameTitle: string;
  introText: string;
  colors: { primary: string; secondary: string; background: string; accent: string };
  offers: Array<{
    id: string;
    emoji: string;
    title: string;
    city: string;
    price: string;
    description: string;
    imageUrl?: string;
  }>;
  buttons: { buy: string; invest: string; sell: string; build: string; skip: string };
  resultPages: Record<string, { title: string; subtitle: string; bullets: string[] }>;
  rewardTitle: string;
  rewardDescription: string;
  formTitle: string;
  formSubtitle: string;
  thankYouTitle: string;
  thankYouSubtitle: string;
  soundsEnabled: boolean;
  closeModal: {
    title: string;
    subtitle: string;
    benefits: string[];
    motivationText: string;
  };
};

export type GamificationOnCloseAction =
  | 'OPEN_REGISTRATION_MODAL'
  | 'REDIRECT_REGISTER'
  | 'REDIRECT_LOGIN'
  | 'CLOSE_ONLY';

export type RegistrationGamificationPublicSettings = {
  enabled: boolean;
  gameType: string;
  audience: string;
  showOnHome: boolean;
  showOnShorts: boolean;
  showOnClassic: boolean;
  showOnPosts: boolean;
  showOnProfessionalProfile: boolean;
  triggerType: string;
  triggerShortsViews: number;
  triggerSecondsOnSite: number;
  triggerPagesVisited: number;
  frequency: string;
  decisionsCount: number;
  offerIntervalSec: number;
  bonusCredits: number;
  bonusDescription: string;
  onCloseAction: GamificationOnCloseAction;
  closeModalPromoEnabled: boolean;
  config: RegistrationGamificationConfig;
};

export type RegistrationGamificationAdminSettings = RegistrationGamificationPublicSettings & {
  id: string;
  autoEmailMarketing: boolean;
  autoWhatsAppCampaign: boolean;
  autoCrm: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationGamificationLeadRow = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  companyName: string | null;
  visitorType: string;
  status: GameLeadStatus;
  score: number;
  gameDurationSec: number | null;
  visitSource: string | null;
  landingPage: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  registered: boolean;
  userId: string | null;
  createdAt: string;
};

export type GameLeadStatus = 'NEW' | 'SEEN' | 'CONTACTED' | 'REGISTERED' | 'INVALID';

export type GameLeadStats = {
  newCount: number;
  todayCount: number;
  weekCount: number;
  totalCount: number;
};

export async function nestRegistrationGamificationSettings(): Promise<RegistrationGamificationPublicSettings | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/registration-gamification/settings`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.enabled !== true) return null;
  return data as RegistrationGamificationPublicSettings;
}

export async function nestRegistrationGamificationCheckEmail(
  email: string,
): Promise<{ exists: boolean; suggestLogin: boolean } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/registration-gamification/check-email`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function nestRegistrationGamificationSubmitLead(body: Record<string, unknown>): Promise<{
  ok: boolean;
  suggestLogin?: boolean;
  message?: string;
  bonusCredits?: number;
  bonusDescription?: string;
  thankYouTitle?: string;
  thankYouSubtitle?: string;
  error?: string;
}> {
  if (!API_BASE_URL) return { ok: false, error: 'API není nastaveno' };
  const res = await fetch(`${API_BASE_URL}/registration-gamification/submit-lead`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return data as {
    ok: boolean;
    suggestLogin?: boolean;
    message?: string;
    bonusCredits?: number;
    bonusDescription?: string;
  };
}

export async function nestRegistrationGamificationEvent(body: Record<string, unknown>): Promise<void> {
  if (!API_BASE_URL) return;
  void fetch(`${API_BASE_URL}/registration-gamification/event`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export async function nestAdminRegistrationGamificationGet(
  token: string | null,
): Promise<RegistrationGamificationAdminSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/settings`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as RegistrationGamificationAdminSettings | null;
}

export async function nestAdminRegistrationGamificationPatch(
  token: string | null,
  body: Partial<RegistrationGamificationAdminSettings>,
): Promise<{ ok: true; settings: RegistrationGamificationAdminSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/settings`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, settings: data as RegistrationGamificationAdminSettings };
}

export async function nestAdminRegistrationGamificationStats(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/stats`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function nestAdminRegistrationGamificationLeads(
  token: string | null,
  query?: { search?: string; visitorType?: string; registered?: boolean; skip?: number; take?: number },
): Promise<{ items: RegistrationGamificationLeadRow[]; total: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (query?.search) sp.set('search', query.search);
  if (query?.visitorType) sp.set('visitorType', query.visitorType);
  if (query?.registered === true) sp.set('registered', '1');
  if (query?.registered === false) sp.set('registered', '0');
  if (query?.skip != null) sp.set('skip', String(query.skip));
  if (query?.take != null) sp.set('take', String(query.take));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/leads${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function nestAdminRegistrationGamificationDeleteLeads(
  token: string | null,
  ids: string[],
): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/leads`, {
    method: 'DELETE',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, deleted: typeof data.deleted === 'number' ? data.deleted : 0 };
}

export async function nestAdminRegistrationGamificationExportCsv(
  token: string | null,
  query?: { search?: string; visitorType?: string; registered?: boolean },
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const sp = new URLSearchParams();
  if (query?.search) sp.set('search', query.search);
  if (query?.visitorType) sp.set('visitorType', query.visitorType);
  if (query?.registered === true) sp.set('registered', '1');
  if (query?.registered === false) sp.set('registered', '0');
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/registration-gamification/leads/export-csv${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'text/csv' },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return { ok: true, blob: await res.blob() };
}

export async function nestAdminGameLeadsStats(token: string | null): Promise<GameLeadStats | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/game-leads/stats`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as GameLeadStats | null;
}

export async function nestAdminGameLeads(
  token: string | null,
  query?: {
    search?: string;
    visitorType?: string;
    status?: GameLeadStatus;
    registered?: boolean;
    skip?: number;
    take?: number;
  },
): Promise<{ items: RegistrationGamificationLeadRow[]; total: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (query?.search) sp.set('search', query.search);
  if (query?.visitorType) sp.set('visitorType', query.visitorType);
  if (query?.status) sp.set('status', query.status);
  if (query?.registered === true) sp.set('registered', '1');
  if (query?.registered === false) sp.set('registered', '0');
  if (query?.skip != null) sp.set('skip', String(query.skip));
  if (query?.take != null) sp.set('take', String(query.take));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/game-leads${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    items: RegistrationGamificationLeadRow[];
    total: number;
  } | null;
}

export async function nestAdminGameLeadUpdateStatus(
  token: string | null,
  id: string,
  status: GameLeadStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/game-leads/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminGameLeadsMarkSeen(
  token: string | null,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/game-leads/mark-seen`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, updated: typeof data.updated === 'number' ? data.updated : 0 };
}

export type MetaCatalogAdminSettings = {
  id: string;
  enabled: boolean;
  lastItemCount: number;
  lastGeneratedAt: string | null;
  lastError: string | null;
  carouselListingIds: string[];
  allowContactExport: boolean;
  exportFieldFlags: Record<string, boolean>;
  syncIntervalMinutes: number;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  syncRunning: boolean;
  feedCsvUrl: string;
  feedXmlUrl?: string;
  feedJsonUrl?: string;
  carouselJsonUrl: string;
  updatedAt: string;
};

export type MetaCatalogFieldConfig = {
  key: string;
  label: string;
  category: 'required' | 'optional' | 'sensitive';
  defaultEnabled: boolean;
  enabled: boolean;
};

export type MetaCatalogDashboard = {
  counts: {
    exported: number;
    pending: number;
    errors: number;
    hidden: number;
    active: number;
    lastItemCount: number;
  };
  sync: {
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    syncRunning: boolean;
    syncIntervalMinutes: number;
    lastRun: {
      id: string;
      startedAt: string;
      result: string;
      exportedCount: number;
      errorCount: number;
    } | null;
  };
  services: Record<string, string>;
  settings: {
    enabled: boolean;
    allowContactExport: boolean;
    lastError: string | null;
    lastGeneratedAt: string | null;
  };
};

export type MetaCatalogExportedListing = {
  propertyId: string;
  title: string;
  city: string;
  price: number | null;
  currency: string;
  image: string | null;
  exportStatus: string;
  lastExportedAt: string | null;
  metaProductId: string | null;
  pixelStatus: string | null;
  synced: boolean;
  lastChangedAt: string | null;
  lastError: string | null;
};

export type MetaCatalogSyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  exportedCount: number;
  changedCount: number;
  errorCount: number;
  durationMs: number | null;
  result: string;
  mode: string;
};

export type MetaCatalogPreviewField = {
  key: string;
  label: string;
  category: 'required' | 'optional' | 'sensitive';
  enabled: boolean;
  exported: boolean;
  value: string;
};

export type MetaCatalogItemPreview = {
  propertyId: string;
  fields: MetaCatalogPreviewField[];
  xml: string;
  csv: string;
  json: string;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
};

export type MetaCatalogListingPreview = {
  id: string;
  title: string;
  city: string;
  price: number | null;
  currency: string;
  propertyType: string;
  hasImage: boolean;
  link: string | null;
  image: string | null;
};

export async function nestAdminMetaCatalogGet(
  token: string | null,
): Promise<MetaCatalogAdminSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/settings`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as MetaCatalogAdminSettings | null;
}

export async function nestAdminMetaCatalogPatch(
  token: string | null,
  body: Partial<
    Pick<
      MetaCatalogAdminSettings,
      'enabled' | 'carouselListingIds' | 'allowContactExport' | 'exportFieldFlags' | 'syncIntervalMinutes'
    >
  >,
): Promise<{ ok: true; settings: MetaCatalogAdminSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/settings`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, settings: data.settings as MetaCatalogAdminSettings };
}

export async function nestAdminMetaCatalogListings(
  token: string | null,
  query?: { city?: string; propertyType?: string; priceMin?: string; priceMax?: string; search?: string },
): Promise<{ items: MetaCatalogListingPreview[] } | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (query?.city) sp.set('city', query.city);
  if (query?.propertyType) sp.set('propertyType', query.propertyType);
  if (query?.priceMin) sp.set('priceMin', query.priceMin);
  if (query?.priceMax) sp.set('priceMax', query.priceMax);
  if (query?.search) sp.set('search', query.search);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/listings${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { items: MetaCatalogListingPreview[] };
}

export async function nestAdminMetaCatalogPreviewCount(
  token: string | null,
  query?: { city?: string; propertyType?: string; priceMin?: string; priceMax?: string },
): Promise<{ total: number; withImage: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const sp = new URLSearchParams();
  if (query?.city) sp.set('city', query.city);
  if (query?.propertyType) sp.set('propertyType', query.propertyType);
  if (query?.priceMin) sp.set('priceMin', query.priceMin);
  if (query?.priceMax) sp.set('priceMax', query.priceMax);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/preview-count${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { total: number; withImage: number };
}

async function metaCatalogAdminFetch<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function nestAdminMetaCatalogDashboard(
  token: string | null,
): Promise<MetaCatalogDashboard | null> {
  return metaCatalogAdminFetch<MetaCatalogDashboard>(token, '/dashboard');
}

export async function nestAdminMetaCatalogExportFields(
  token: string | null,
): Promise<{
  fields: MetaCatalogFieldConfig[];
  allowContactExport: boolean;
  contactExportWarning: string;
} | null> {
  return metaCatalogAdminFetch(token, '/export-fields');
}

export async function nestAdminMetaCatalogPreviewItem(
  token: string | null,
  propertyId: string,
): Promise<MetaCatalogItemPreview | null> {
  return metaCatalogAdminFetch(token, `/preview/${encodeURIComponent(propertyId)}`);
}

export async function nestAdminMetaCatalogExportedListings(
  token: string | null,
  filter?: string,
): Promise<{ items: MetaCatalogExportedListing[] } | null> {
  const qs = filter ? `?filter=${encodeURIComponent(filter)}` : '';
  return metaCatalogAdminFetch(token, `/exported-listings${qs}`);
}

export async function nestAdminMetaCatalogSyncHistory(
  token: string | null,
): Promise<{ items: MetaCatalogSyncRun[] } | null> {
  return metaCatalogAdminFetch(token, '/sync-history');
}

export async function nestAdminMetaCatalogSyncRun(
  token: string | null,
  mode: string,
): Promise<{ ok: boolean; error?: string; exportedCount?: number; runId?: string } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/sync`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  });
  return (await res.json().catch(() => null)) as {
    ok: boolean;
    error?: string;
    exportedCount?: number;
    runId?: string;
  };
}

export async function nestAdminMetaCatalogQuality(
  token: string | null,
  options?: { probe?: boolean },
): Promise<{
  score: number;
  checks: Array<{ key: string; label: string; level: string; message: string }>;
  summary: { ok: number; warning: number; error: number };
  imageSummary?: {
    listings: number;
    mainOk: number;
    mainFailed: number;
    galleryOk: number;
    galleryFailed: number;
    failedUrls: string[];
  };
} | null> {
  const qs = options?.probe ? '?probe=1' : '';
  return metaCatalogAdminFetch(token, `/quality${qs}`);
}

export type MetaCatalogImageProbeResult = {
  propertyId: string;
  title: string;
  role: 'image_link' | 'additional_image_link';
  url: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  width: number | null;
  height: number | null;
  durationMs: number;
  ok: boolean;
  error: string | null;
};

export type MetaCatalogImageListingDiagnostic = {
  propertyId: string;
  title: string;
  imageLink: string | null;
  additionalCount: number;
  firstImageUrl: string | null;
  imageLinkOk: boolean;
  imageLinkHttpStatus?: number | null;
  imageLinkContentType?: string | null;
  imageLinkContentLength?: number | null;
  imageLinkError?: string | null;
  galleryOk?: boolean;
  galleryFailedCount?: number;
  failedUrls?: string[];
};

export async function nestAdminMetaCatalogImageDiagnostics(
  token: string | null,
): Promise<{ listings: MetaCatalogImageListingDiagnostic[] } | null> {
  return metaCatalogAdminFetch(token, '/image-diagnostics');
}

export async function nestAdminMetaCatalogVerifyImages(
  token: string | null,
): Promise<{
  summary: { totalUrls: number; ok: number; failed: number; listings: number };
  items: MetaCatalogImageProbeResult[];
  listings: MetaCatalogImageListingDiagnostic[];
} | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/verify-images`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    summary: { totalUrls: number; ok: number; failed: number; listings: number };
    items: MetaCatalogImageProbeResult[];
    listings: MetaCatalogImageListingDiagnostic[];
  } | null;
}

export async function nestAdminMetaCatalogStatistics(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  return metaCatalogAdminFetch(token, '/statistics');
}

export async function nestAdminMetaCatalogTestMeta(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/meta-catalog/test-meta`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown>;
}

export async function nestAdminMetaCatalogLogs(
  token: string | null,
): Promise<Array<{ id: string; eventType: string; message: string | null; createdAt: string }> | null> {
  return metaCatalogAdminFetch(token, '/logs');
}

export type MetaDiagnosticLevel = 'ok' | 'warning' | 'error';

export type MetaCenterServiceCard = {
  key: string;
  label: string;
  status: 'online' | 'offline' | 'optional';
  statusLabel: string;
  detail?: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  graphApiVersion: string;
};

export type FacebookAppsConfig = {
  login: {
    appName: string;
    appId: string | null;
    appSecretConfigured: boolean;
    appSecretMasked: string | null;
    oauthRedirectUri: string | null;
    configured: boolean;
    missing: string[];
    idValidation: { ok: boolean; error: string | null };
  };
  pages: {
    appName: string;
    appId: string | null;
    appSecretConfigured: boolean;
    appSecretMasked: string | null;
    pageConnectRedirectUri: string | null;
    metaConnectRedirectUri: string | null;
    configured: boolean;
    missing: string[];
    idValidation: { ok: boolean; error: string | null };
  };
  graphApiVersion: string;
  frontendUrl: string | null;
  backendUrl: string | null;
  webhookUri: string | null;
};

export type MetaCenterSettings = {
  id: string;
  facebookAppId: string | null;
  facebookAppSecretMasked: string | null;
  facebookPagesAppId: string | null;
  facebookPagesSecretMasked: string | null;
  loginOAuthRedirectUri?: string | null;
  metaConnectRedirectUri?: string | null;
  pageConnectRedirectUri?: string | null;
  facebookApps?: FacebookAppsConfig;
  businessManagerId: string | null;
  commerceManagerId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  pixelId: string | null;
  pixelName: string | null;
  conversionsApiTokenMasked: string | null;
  webhookVerifyTokenMasked: string | null;
  webhookSecretMasked: string | null;
  frontendUrl: string;
  backendUrl: string;
  redirectUri: string;
  callbackUrl: string;
  encryptionKeyMasked: string | null;
  graphApiVersion: string;
  domainVerification: string | null;
  catalogFeedEnabled: boolean;
  capiEventToggles: Record<string, boolean>;
  pixelMapping: Record<string, string>;
  remarketingAudiences: unknown;
  autoCampaignRules: unknown;
  adFormatFlags: Record<string, boolean>;
  metaConnectedAt: string | null;
  metaConnectedUserId: string | null;
  metaConnectedUserName: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  pageId: string | null;
  pageName: string | null;
  instagramBusinessId: string | null;
  instagramUsername: string | null;
  catalogName: string | null;
  commerceAccountId: string | null;
  testEventCode: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappPhoneNumberId: string | null;
  lastAutoSyncAt: string | null;
  syncEnabled: boolean;
  isMetaConnected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MetaConnectionStatusLevel = 'online' | 'optional' | 'missing_config' | 'api_error';

export type MetaConnectionSource =
  | 'whatsapp_module'
  | 'social_autopost'
  | 'user_facebook_pages'
  | 'facebook_login'
  | 'meta_connect'
  | 'meta_catalog'
  | 'env'
  | 'graph_api'
  | 'feed';

export type MetaConnectionCheck = {
  key: string;
  label: string;
  connected: boolean;
  optional?: boolean;
  status?: MetaConnectionStatusLevel;
  error: string | null;
  detail?: string | null;
  fixAction: string | null;
  fixHref?: string | null;
  source?: MetaConnectionSource | string;
};

export type MetaCatalogGraphDiagnostics = {
  businessId: string | null;
  businessName: string | null;
  catalogId: string | null;
  catalogName: string | null;
  commerceManagerId: string | null;
  commerceManagerName: string | null;
  datasetId: string | null;
  commerceOnline: boolean;
  commerceMessage: string;
  catalogOnline: boolean;
  catalogMessage: string;
  productCount: number | null;
  lastCatalogUpdate: string | null;
  lastLocalSync: string | null;
  importErrorCount: number;
  metaImagesLoaded: number | null;
  metaVideoCount: number | null;
  graphCheckedAt: string;
  graphError: string | null;
  graphErrorJson: string | null;
};

export type MetaCenterApiLogRow = {
  id: string;
  createdAt: string;
  endpoint: string;
  method: string;
  request: unknown;
  response: unknown;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

export type MetaCenterDashboard = {
  settings: MetaCenterSettings;
  services: MetaCenterServiceCard[];
  diagnostics: {
    items: { key: string; label: string; level: MetaDiagnosticLevel; message: string }[];
    summary: Record<MetaDiagnosticLevel, number>;
  };
  catalog: MetaCatalogAdminSettings;
  feedStats: {
    itemCount: number;
    photoCount: number;
    videoCount: number;
    sizeBytes: number;
    lastExport: string | null;
    lastError: string | null;
    generationMs: number;
  } | null;
  catalogGraph: MetaCatalogGraphDiagnostics;
  pixel: {
    pixelId: string | null;
    pixelName: string | null;
    lastEventAt: string | null;
    eventsToday: number;
    eventsMonth: number;
    status: string;
  };
  capi: {
    datasetId: string | null;
    tokenConfigured: boolean;
    toggles: Record<string, boolean>;
    status: string;
  };
};

export type MetaCenterEventLogRow = {
  id: string;
  createdAt: string;
  eventType: string;
  listingId: string | null;
  userId: string | null;
  result: string;
  status: string | null;
  response: unknown;
  request: unknown;
  source: string | null;
};

async function metaCenterFetch<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/meta-center${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  return { ok: true, data };
}

export async function nestAdminMetaCenterDashboard(
  token: string | null,
): Promise<MetaCenterDashboard | null> {
  const r = await metaCenterFetch<MetaCenterDashboard>(token, '/dashboard');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterGetSettings(
  token: string | null,
): Promise<MetaCenterSettings | null> {
  const r = await metaCenterFetch<MetaCenterSettings>(token, '/settings');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterPatchSettings(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: true; settings: MetaCenterSettings } | { ok: false; error?: string }> {
  const r = await metaCenterFetch<{ ok: boolean; settings: MetaCenterSettings }>(token, '/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!r.ok) return r;
  return { ok: true, settings: r.data.settings };
}

export async function nestAdminMetaCenterTestService(
  token: string | null,
  key: string,
): Promise<{ key: string; online: boolean; result: string; message: string } | null> {
  const r = await metaCenterFetch<{ key: string; online: boolean; result: string; message: string }>(
    token,
    `/test-service/${encodeURIComponent(key)}`,
    { method: 'POST' },
  );
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterDiagnostics(token: string | null) {
  const r = await metaCenterFetch<MetaCenterDashboard['diagnostics']>(token, '/diagnostics', {
    method: 'POST',
  });
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterTestAll(token: string | null) {
  const r = await metaCenterFetch<unknown>(token, '/test-all', { method: 'POST' });
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterPixelTest(
  token: string | null,
  eventType: string,
  listingId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await metaCenterFetch<{ ok: boolean }>(token, '/pixel/test-event', {
    method: 'POST',
    body: JSON.stringify({ eventType, listingId }),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterPatchCapi(
  token: string | null,
  toggles: Record<string, boolean>,
): Promise<{ ok: boolean; error?: string }> {
  const r = await metaCenterFetch<{ ok: boolean }>(token, '/capi', {
    method: 'PATCH',
    body: JSON.stringify({ toggles }),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterRegenerateFeeds(
  token: string | null,
): Promise<{ ok: boolean; error?: string; stats?: unknown }> {
  const r = await metaCenterFetch<{ ok: boolean; stats?: unknown; error?: string }>(
    token,
    '/feeds/regenerate',
    { method: 'POST' },
  );
  return r.ok ? { ok: r.data.ok, stats: r.data.stats, error: r.data.error } : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterValidateFeed(token: string | null) {
  const r = await metaCenterFetch<{ ok: boolean; errors: string[]; itemCount: number }>(
    token,
    '/feeds/validate',
    { method: 'POST' },
  );
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterLogs(
  token: string | null,
  query?: { eventType?: string; source?: string; take?: number },
): Promise<{ total: number; items: MetaCenterEventLogRow[] } | null> {
  const sp = new URLSearchParams();
  if (query?.eventType) sp.set('eventType', query.eventType);
  if (query?.source) sp.set('source', query.source);
  if (query?.take) sp.set('take', String(query.take));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const r = await metaCenterFetch<{ total: number; items: MetaCenterEventLogRow[] }>(
    token,
    `/logs${qs}`,
  );
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterGetCommerce(token: string | null) {
  const r = await metaCenterFetch<unknown>(token, '/commerce');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterConnectUrl(
  token: string | null,
): Promise<{ url: string; appId?: string | null; redirectUri?: string | null } | null> {
  const r = await metaCenterFetch<{ url: string; appId?: string; redirectUri?: string }>(
    token,
    '/connect/url',
  );
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterApps(
  token: string | null,
): Promise<FacebookAppsConfig | null> {
  const r = await metaCenterFetch<FacebookAppsConfig>(token, '/apps');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterLoginOAuthUrl(
  token: string | null,
): Promise<{ url: string; redirectUri?: string | null } | null> {
  const r = await metaCenterFetch<{ url: string; redirectUri?: string }>(token, '/login/oauth-url');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterConnectionStatus(token: string | null) {
  const r = await metaCenterFetch<{
    settings: MetaCenterSettings;
    apps?: FacebookAppsConfig;
    checklist: Array<{ key: string; label: string; connected: boolean }>;
    diagnostics: MetaConnectionCheck[];
    connectedAt: string | null;
    lastSyncAt: string | null;
  }>(token, '/connection/status');
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterSync(token: string | null) {
  const r = await metaCenterFetch<{ ok: boolean; error?: string }>(token, '/connection/sync', {
    method: 'POST',
  });
  return r.ok ? r.data : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterFix(
  token: string | null,
  action: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const r = await metaCenterFetch<{ ok: boolean; error?: string; message?: string }>(
    token,
    `/connection/fix/${encodeURIComponent(action)}`,
    { method: 'POST' },
  );
  return r.ok ? r.data : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterProvision(
  token: string | null,
  resource: string,
): Promise<{ ok: boolean; error?: string; pixelId?: string; catalogId?: string }> {
  const r = await metaCenterFetch<{
    ok: boolean;
    error?: string;
    pixelId?: string;
    catalogId?: string;
  }>(token, `/provision/${encodeURIComponent(resource)}`, { method: 'POST' });
  return r.ok ? r.data : { ok: false, error: r.error };
}

export async function nestAdminMetaCenterApiLogs(token: string | null, take = 80) {
  const r = await metaCenterFetch<{ items: MetaCenterApiLogRow[] }>(
    token,
    `/api-logs?take=${take}`,
  );
  return r.ok ? r.data : null;
}

export async function nestAdminMetaCenterTestAllEvents(token: string | null) {
  const r = await metaCenterFetch<{
    ok: boolean;
    results: Array<{ event: string; ok: boolean; error?: string }>;
  }>(token, '/events/test-all', { method: 'POST' });
  return r.ok ? r.data : null;
}

export async function nestAdminBonusCampaignDelete(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/bonus-campaigns/${encodeURIComponent(id)}`, {
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
 * POST /upload/avatar — pouze nahrání souboru, bez PATCH uživatele.
 */
export async function nestUploadImageFile(
  token: string | null,
  file: File,
): Promise<{ url?: string; error?: string }> {
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
  if (!url) return { error: 'Server nevrátil URL obrázku' };
  return { url };
}

/**
 * POST /upload/avatar (soubor) → PATCH /users/avatar { avatarUrl }.
 */
export async function nestUploadAvatar(
  token: string | null,
  file: File,
  crop?: { x: number; y: number; zoom: number },
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
    body: JSON.stringify({ avatarUrl: url, ...(crop ? { crop } : {}) }),
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
  crop?: { x: number; y: number; zoom: number },
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
    body: JSON.stringify({ coverImageUrl: url, ...(crop ? { crop } : {}) }),
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

export async function nestPatchAvatarCrop(
  token: string | null,
  avatarUrl: string,
  crop: { x: number; y: number; zoom: number },
): Promise<{ ok: boolean; error?: string; avatarUrl?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/avatar`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ avatarUrl, crop }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : avatarUrl,
  };
}

export async function nestPatchCoverCrop(
  token: string | null,
  coverImageUrl: string,
  crop: { x: number; y: number; zoom: number },
): Promise<{ ok: boolean; error?: string; coverImageUrl?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/cover`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coverImageUrl, crop }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    coverImageUrl:
      typeof data.coverImageUrl === 'string' ? data.coverImageUrl : coverImageUrl,
  };
}

export async function nestPatchProfileBio(
  token: string | null,
  body: {
    bio?: string | null;
    name?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    phonePublic?: boolean;
    brokerOfficeName?: string;
    city?: string;
    address?: string;
    postalCode?: string;
    profileIco?: string;
    tiparPayoutBankAccount?: string | null;
  },
): Promise<{
  ok: boolean;
  bio?: string | null;
  name?: string | null;
  phone?: string;
  phonePublic?: boolean;
  error?: string;
}> {
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
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    bio?: string | null;
    user?: { name?: string | null; phone?: string; phonePublic?: boolean };
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
  return {
    ok: true,
    bio: data.bio ?? null,
    name: data.user?.name ?? null,
    phone: data.user?.phone ?? '',
    phonePublic: data.user?.phonePublic === true,
  };
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
  viewsCount?: number;
  isTiparTip?: boolean;
  isTip?: boolean;
  listingType?: string | null;
  contactUnlocked?: boolean;
  sellerContactVisible?: boolean;
  buyerInterestSubmitted?: boolean;
  contactUnlockPrice?: number;
  contactUnlockAvailable?: boolean;
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

export async function nestFetchVideos(token?: string | null): Promise<ShortVideo[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/feed/shorts`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token ? nestAuthHeaders(token) : {}),
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data)
      ? (data as ShortVideo[])
      : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
        ? (((data as { items: unknown[] }).items ?? []) as ShortVideo[])
        : [];
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
  const videoFromMedia = (p: Record<string, unknown>): string | null => {
    const media = p.media;
    if (!Array.isArray(media)) return null;
    for (const row of media) {
      if (!row || typeof row !== 'object') continue;
      const m = row as Record<string, unknown>;
      const type = typeof m.type === 'string' ? m.type.toLowerCase() : '';
      const url = typeof m.url === 'string' ? m.url.trim() : '';
      if (type === 'video' && url) return url;
    }
    return null;
  };

  const mapDetailProperty = (p: Record<string, unknown>, fallbackId: string): ShortVideo | null => {
    const videoUrl =
      (typeof p.videoUrl === 'string' && p.videoUrl.trim() ? p.videoUrl.trim() : null) ||
      videoFromMedia(p);
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
      viewsCount:
        typeof p.viewsCount === 'number' && Number.isFinite(p.viewsCount)
          ? Math.max(0, Math.trunc(p.viewsCount))
          : undefined,
      userId: typeof p.userId === 'string' ? p.userId : undefined,
    };
  };
  try {
    const apiBase = API_BASE_URL;
    if (apiBase) {
      const shareRes = await fetch(
        `${apiBase}/properties/${encodeURIComponent(id)}/public-share?shareAs=shorts`,
        { cache: 'no-store', headers: { Accept: 'application/json' } },
      );
      if (shareRes.ok) {
        const root = (await shareRes.json()) as { property?: Record<string, unknown> };
        const p = root.property;
        if (p && typeof p === 'object') {
          const mapped = mapDetailProperty(p, id);
          if (mapped) return mapped;
        }
      }
      const res = await fetch(`${apiBase}/properties/${encodeURIComponent(id)}`, {
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
  propertyPrice: number | null;
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
    price: number | null;
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
  price: number | null;
  city: string;
  type: 'post' | 'short' | string;
  createdAt: string;
  media: ListingMedia[];
  user?: {
    id: string;
    name?: string | null;
    email?: string;
    avatar?: string | null;
    role?: string;
    profileHref?: string;
    isVerified?: boolean;
    verifiedBadgeLabel?: string | null;
  } | null;
  _count?: {
    favorites?: number;
    comments?: number;
  };
  category?:
    | 'MAKLERI'
    | 'STAVEBNI_FIRMY'
    | 'REALITNI_KANCELARE'
    | 'FINANCNI_PORADCI'
    | 'INVESTORI';
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number;
  reactions?: Array<{
    userId: string;
    postId: string;
    type: 'LIKE' | 'DISLIKE';
  }>;
  externalUrl?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
  previewImage?: string | null;
  previewSiteName?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isFacebookPagePost?: boolean;
  facebookPermalink?: string | null;
  facebookEmbedUrl?: string | null;
  facebookPostType?: 'FACEBOOK_POST' | 'FACEBOOK_VIDEO' | 'FACEBOOK_REEL' | string | null;
  facebookVideoThumbnail?: string | null;
  facebookVideoDurationSec?: number | null;
  facebookVideoSourceUrl?: string | null;
  facebookVideoHasAudio?: boolean | null;
  facebookVideoMimeType?: string | null;
  source?: 'INTERNAL' | 'FACEBOOK' | string;
  publishedAt?: string | null;
  soundTrack?: {
    id: string;
    title: string;
    artist?: string | null;
    fileUrl: string;
    previewUrl?: string | null;
    durationSec?: number | null;
  } | null;
  isFollowedAuthor?: boolean;
};

export type CommunityPostsFeedResult = {
  items: ListingPost[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type LinkPreviewResponse = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  failed?: boolean;
};

const LINK_PREVIEW_CLIENT_TIMEOUT_MS = 8_000;

export async function nestFetchLinkPreview(
  token: string,
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true; preview: LinkPreviewResponse } | { ok: false; error?: string }> {
  const apiUrl = getLinkPreviewApiUrl();

  if (!apiUrl || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }

  // eslint-disable-next-line no-console
  console.log('LINK PREVIEW FETCH URL', apiUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_CLIENT_TIMEOUT_MS);
  const merged = signal
    ? (() => {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
        return controller.signal;
      })()
    : controller.signal;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      signal: merged,
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    const data = (await res.json().catch(() => ({}))) as LinkPreviewResponse & {
      message?: string | string[];
      error?: string;
    };

    // eslint-disable-next-line no-console
    console.log('LINK PREVIEW RESPONSE', {
      status: res.status,
      ok: res.ok,
      body: data,
    });

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
    if (!data.url?.trim()) {
      return { ok: false, error: 'Náhled se nepodařilo načíst' };
    }
    return { ok: true, preview: data };
  } catch {
    return { ok: false, error: 'Síťová chyba nebo timeout' };
  } finally {
    clearTimeout(timeout);
  }
}

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
    price: number | null;
    city: string;
    type: 'post' | 'short';
    video?: File | null;
    images: File[];
    imageOrder: string[];
    category?:
      | 'MAKLERI'
      | 'STAVEBNI_FIRMY'
      | 'REALITNI_KANCELARE'
      | 'FINANCNI_PORADCI'
      | 'INVESTORI';
    latitude?: number;
    longitude?: number;
    soundTrackId?: string;
  },
): Promise<{ ok: true; post: ListingPost } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  const fd = new FormData();
  fd.append('title', input.title);
  fd.append('description', input.description);
  const normalizedPrice =
    typeof input.price === 'number' && Number.isFinite(input.price) && input.price > 0
      ? Math.trunc(input.price)
      : null;
  if (normalizedPrice != null) {
    fd.append('price', String(normalizedPrice));
  }
  fd.append('city', input.city);
  fd.append('type', input.type);
  if (input.category) fd.append('category', input.category);
  if (input.soundTrackId?.trim()) fd.append('soundTrackId', input.soundTrackId.trim());
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

export type NestEmailLogRow = {
  id: string;
  type: string;
  templateKey?: string | null;
  subject: string;
  recipientEmail: string;
  senderEmail?: string | null;
  senderName?: string | null;
  status: 'queued' | 'sent' | 'failed';
  provider?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
};

export type NestEmailTemplateRow = {
  id: string;
  key: string;
  name: string;
  category?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  isActive: boolean;
  variables?: string[];
  createdAt: string;
  updatedAt: string;
};

export type NestEmailCampaignRow = {
  id: string;
  type: string;
  title: string;
  subject: string;
  templateKey?: string | null;
  htmlContent: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  createdAt: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
};

export async function nestShareListingByEmail(input: {
  propertyId: string;
  recipientEmail: string;
  recipientName?: string;
  senderName?: string;
  senderEmail?: string;
  senderMessage?: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API není nakonfigurováno' };
  try {
    const res = await fetch(`${API_BASE_URL}/emails/share-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      message?: string;
    };
    if (!res.ok || data.success === false) {
      return { ok: false, error: data.error ?? data.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: data.message ?? 'E-mail byl odeslán.' };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminEmailLogs(
  token: string | null,
): Promise<NestEmailLogRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/emails/logs`, {
      cache: 'no-store',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NestEmailLogRow[]) : null;
  } catch {
    return null;
  }
}

export async function nestAdminEmailTemplates(
  token: string | null,
): Promise<NestEmailTemplateRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/emails/templates`, {
      cache: 'no-store',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NestEmailTemplateRow[]) : null;
  } catch {
    return null;
  }
}

export async function nestAdminUpdateEmailTemplate(
  token: string | null,
  id: string,
  body: Partial<Pick<NestEmailTemplateRow, 'subject' | 'htmlContent' | 'textContent' | 'isActive' | 'name'>>,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/admin/emails/templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminSendTemplateTest(
  token: string | null,
  id: string,
  toEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/emails/templates/${encodeURIComponent(id)}/test`,
      {
        method: 'POST',
        headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminEmailCampaigns(
  token: string | null,
): Promise<NestEmailCampaignRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/emails/campaigns`, {
      cache: 'no-store',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NestEmailCampaignRow[]) : null;
  } catch {
    return null;
  }
}

export async function nestAdminCreateEmailCampaign(
  token: string | null,
  body: {
    type: string;
    title: string;
    subject: string;
    templateKey?: string;
    htmlContent: string;
    scheduledAt?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/admin/emails/campaigns`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return { ok: false, error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type EmailCampaignAudience = {
  mode: 'selected_ids' | 'filtered' | 'all_imported' | 'portal_roles';
  selectedContactIds?: string[];
  filter?: AdminImportedBrokerContactsQuery;
  portalRoles?: string[];
};

export type EmailCampaignStepRow = {
  id?: string;
  stepOrder: number;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  delayDays: number;
  delayHours: number;
  isActive: boolean;
};

export type EmailCampaignDetail = {
  id: string;
  title: string;
  type: string;
  status: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  senderName: string;
  minDaysBetweenSends: number;
  templateKey?: string | null;
  audience: EmailCampaignAudience;
  recipientCount: number;
  stepCount: number;
  logCount: number;
  steps: EmailCampaignStepRow[];
  recipients: Array<{
    id: string;
    email: string;
    fullName: string;
    status: string;
    lastCompletedStepOrder: number;
    nextStepAt: string | null;
    lastSentAt: string | null;
    errorMessage: string | null;
  }>;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type EmailCampaignTemplate = {
  key: string;
  name: string;
  description: string;
  steps: EmailCampaignStepRow[];
  variables: string[];
};

async function emailCampaignsFetch<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error?: string }> {
  if (!API_BASE_URL || !token) return { data: null, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/admin/email-campaigns${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { data: null, error: nestErrorMessage(raw, `HTTP ${res.status}`) };
    }
    return { data: raw as T };
  } catch {
    return { data: null, error: 'Síťová chyba' };
  }
}

export async function nestAdminEmailCampaignTemplates(
  token: string | null,
): Promise<EmailCampaignTemplate[]> {
  const r = await emailCampaignsFetch<EmailCampaignTemplate[]>(token, '/templates');
  return r.data ?? [];
}

export async function nestAdminEmailCampaignDetail(
  token: string | null,
  id: string,
): Promise<{ campaign: EmailCampaignDetail | null; error?: string }> {
  const r = await emailCampaignsFetch<EmailCampaignDetail>(token, `/${encodeURIComponent(id)}`);
  return { campaign: r.data, error: r.error };
}

export async function nestAdminEmailCampaignRecipientCount(
  token: string | null,
  body: { audience: EmailCampaignAudience; minDaysBetweenSends?: number },
): Promise<{ total: number; error?: string }> {
  const r = await emailCampaignsFetch<{ total: number }>(token, '/recipients/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.error) return { total: 0, error: r.error };
  return { total: r.data?.total ?? 0 };
}

export async function nestAdminCreateEmailCampaignFull(
  token: string | null,
  body: {
    title: string;
    type?: string;
    senderName?: string;
    minDaysBetweenSends?: number;
    audience?: EmailCampaignAudience;
    templateKey?: string;
    steps?: EmailCampaignStepRow[];
  },
): Promise<{ campaign: EmailCampaignDetail | null; error?: string }> {
  const r = await emailCampaignsFetch<EmailCampaignDetail>(token, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { campaign: r.data, error: r.error };
}

export async function nestAdminUpdateEmailCampaign(
  token: string | null,
  id: string,
  body: Partial<{
    title: string;
    senderName: string;
    minDaysBetweenSends: number;
    audience: EmailCampaignAudience;
    status: string;
    steps: EmailCampaignStepRow[];
  }>,
): Promise<{ campaign: EmailCampaignDetail | null; error?: string }> {
  const r = await emailCampaignsFetch<EmailCampaignDetail>(token, `/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { campaign: r.data, error: r.error };
}

export async function nestAdminEmailCampaignPreview(
  token: string | null,
  id: string,
  stepOrder = 0,
): Promise<{
  preview: { subject: string; htmlContent: string; textContent: string } | null;
  error?: string;
}> {
  const r = await emailCampaignsFetch<{ subject: string; htmlContent: string; textContent: string }>(
    token,
    `/${encodeURIComponent(id)}/preview?stepOrder=${stepOrder}`,
  );
  return { preview: r.data, error: r.error };
}

export async function nestAdminEmailCampaignTestSend(
  token: string | null,
  id: string,
  toEmail: string,
  stepOrder = 0,
): Promise<{ ok: boolean; error?: string }> {
  const r = await emailCampaignsFetch<{ ok: boolean }>(token, `/${encodeURIComponent(id)}/test-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toEmail, stepOrder }),
  });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true };
}

export async function nestAdminEmailCampaignStart(
  token: string | null,
  id: string,
): Promise<{
  ok: boolean;
  error?: string;
  recipients?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  processed?: number;
}> {
  const r = await emailCampaignsFetch<{
    ok: boolean;
    recipients?: number;
    sentCount?: number;
    failedCount?: number;
    skippedCount?: number;
    processed?: number;
  }>(token, `/${encodeURIComponent(id)}/start`, { method: 'POST' });
  if (r.error) return { ok: false, error: r.error };
  return {
    ok: true,
    recipients: r.data?.recipients,
    sentCount: r.data?.sentCount,
    failedCount: r.data?.failedCount,
    skippedCount: r.data?.skippedCount,
    processed: r.data?.processed,
  };
}

export type EmailCampaignHistoryRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  subject: string;
  recipientCount: number;
  stepCount: number;
  logCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount?: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  sentAt?: string | null;
};

export async function nestAdminEmailCampaignsList(
  token: string | null,
): Promise<EmailCampaignHistoryRow[]> {
  const r = await emailCampaignsFetch<EmailCampaignHistoryRow[]>(token, '');
  return r.data ?? [];
}

export type EmailCampaignRecipientRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  source: string;
  sourceLabel: string;
  status: string;
  lastSentAt: string | null;
  errorMessage: string | null;
  latestLogId: string | null;
  latestLogStatus: string | null;
  latestLogSentAt: string | null;
};

export async function nestAdminEmailCampaignRecipients(
  token: string | null,
  campaignId: string,
  query?: { status?: string; page?: number; limit?: number },
): Promise<{
  items: EmailCampaignRecipientRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.page != null) params.set('page', String(query.page));
  if (query?.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  const r = await emailCampaignsFetch<{
    items: EmailCampaignRecipientRow[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }>(token, `/${encodeURIComponent(campaignId)}/recipients${qs ? `?${qs}` : ''}`);
  if (r.error) {
    return { items: [], page: 0, limit: 50, total: 0, hasMore: false, error: r.error };
  }
  return r.data ?? { items: [], page: 0, limit: 50, total: 0, hasMore: false };
}

export type EmailCampaignSentEmail = {
  id: string;
  campaignId: string;
  recipientId: string;
  email: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};

export async function nestAdminEmailCampaignSentEmail(
  token: string | null,
  campaignId: string,
  query?: { logId?: string; recipientId?: string },
): Promise<{ email: EmailCampaignSentEmail | null; error?: string }> {
  const params = new URLSearchParams();
  if (query?.logId) params.set('logId', query.logId);
  if (query?.recipientId) params.set('recipientId', query.recipientId);
  const qs = params.toString();
  const r = await emailCampaignsFetch<EmailCampaignSentEmail>(
    token,
    `/${encodeURIComponent(campaignId)}/sent-email${qs ? `?${qs}` : ''}`,
  );
  return { email: r.data, error: r.error };
}

export async function nestAdminDuplicateEmailCampaign(
  token: string | null,
  id: string,
): Promise<{ campaign: EmailCampaignDetail | null; error?: string }> {
  const r = await emailCampaignsFetch<EmailCampaignDetail>(token, `/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
  });
  return { campaign: r.data, error: r.error };
}

export async function nestAdminEmailCampaignUploadImage(
  token: string | null,
  file: File,
): Promise<{ publicUrl: string; url: string; error?: string }> {
  if (!API_BASE_URL || !token) return { publicUrl: '', url: '', error: 'API nebo token chybí' };
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE_URL}/admin/email-campaigns/upload-image`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { publicUrl: '', url: '', error: nestErrorMessage(data, `HTTP ${res.status}`) };
    }
    return {
      publicUrl: String(data.publicUrl ?? ''),
      url: String(data.url ?? ''),
    };
  } catch {
    return { publicUrl: '', url: '', error: 'Síťová chyba' };
  }
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


export type CommunityPostsCategory =
  | 'VSE'
  | 'MAKLERI'
  | 'STAVEBNI_FIRMY'
  | 'REALITNI_KANCELARE'
  | 'FINANCNI_PORADCI'
  | 'INVESTORI'
  | 'PRACOVNICI_PORTALU';

export async function nestFetchCommunityPosts(
  category?: CommunityPostsCategory,
  options?: {
    radiusKm?: number;
    lat?: number;
    lng?: number;
    page?: number;
    limit?: number;
  },
  token?: string | null,
): Promise<CommunityPostsFeedResult> {
  const empty: CommunityPostsFeedResult = { items: [], page: 0, limit: 30, hasMore: false };
  if (!API_BASE_URL) return empty;
  const params = new URLSearchParams();
  if (category && category !== 'VSE') {
    const role = communityCategoryToAuthorRole(category as CommunityCategoryKey);
    if (role) params.set('authorRole', role);
    params.set('category', category);
  }
  if (Number.isFinite(options?.radiusKm)) params.set('radiusKm', String(options?.radiusKm));
  if (Number.isFinite(options?.lat)) params.set('lat', String(options?.lat));
  if (Number.isFinite(options?.lng)) params.set('lng', String(options?.lng));
  if (Number.isFinite(options?.page)) params.set('page', String(options?.page));
  if (Number.isFinite(options?.limit)) params.set('limit', String(options?.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${postsApiBase()}/posts${qs}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...nestAuthHeaders(token ?? null) },
  });
  if (!res.ok) return empty;
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) {
    return { items: data as ListingPost[], page: 0, limit: data.length, hasMore: false };
  }
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    const o = data as { items: ListingPost[]; page?: number; limit?: number; hasMore?: boolean };
    return {
      items: o.items,
      page: typeof o.page === 'number' ? o.page : 0,
      limit: typeof o.limit === 'number' ? o.limit : o.items.length,
      hasMore: o.hasMore === true,
    };
  }
  return empty;
}

export async function nestPatchMePublicProfile(
  token: string | null,
  publicProfile: boolean,
): Promise<{ ok: boolean; error?: string; publicProfile?: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/me/public-profile`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicProfile }),
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  const data = (await res.json().catch(() => ({}))) as {
    publicProfile?: boolean;
    isPublicProfile?: boolean;
  };
  return {
    ok: true,
    publicProfile:
      typeof data.publicProfile === 'boolean'
        ? data.publicProfile
        : data.isPublicProfile === true,
  };
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

async function nestError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return nestErrorMessage(data, `HTTP ${res.status}`);
}

export async function nestAdminUpdateUserCredit(
  token: string | null,
  userId: string,
  creditBalance: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/credit`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ creditBalance: Math.max(0, Math.trunc(creditBalance)) }),
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export async function nestDeleteAvatar(
  token: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/avatar`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export async function nestPatchProfileVisibility(
  token: string | null,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string; publicProfile?: boolean }> {
  return nestPatchMePublicProfile(token, isPublic);
}

export async function nestChangeMyPassword(
  token: string | null,
  body: { currentPassword: string; newPassword: string; confirmPassword: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/me/password`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export async function nestUpdateMyPost(
  token: string | null,
  postId: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const res = await fetch(`${postsBase}/posts/${encodeURIComponent(postId)}/update`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export async function nestDeleteMyPost(
  token: string | null,
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  const res = await fetch(`${postsBase}/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export type TiparPostRow = {
  id: string;
  userId: string;
  title: string;
  description: string;
  images: string[];
  mainImage?: string | null;
  videoUrl?: string | null;
  generatedVideoUrl?: string | null;
  selectedMusicId?: string | null;
  city: string;
  propertyPrice?: number | null;
  sourceUrl?: string | null;
  ownerNote?: string | null;
  contactUnlockPrice: number;
  contactUnlockAvailable?: boolean;
  isShorts: boolean;
  publishedPropertyId?: string | null;
  contactUnlocked?: boolean;
  contact?: {
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  };
  tiparBadge?: string;
  unlockCount?: number;
  author?: { id: string; name: string; avatar?: string | null; isTipar?: boolean };
  isOwner?: boolean;
  createdAt: string;
};

export async function nestTiparActivate(
  token: string | null,
): Promise<{ ok: boolean; isTipar?: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/tipar/activate`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, isTipar: data.isTipar === true };
}

export async function nestTiparMyPosts(token: string | null): Promise<TiparPostRow[]> {
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/tipar/posts/me`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as TiparPostRow[]) : [];
}

export async function nestTiparGetPost(
  token: string | null,
  postId: string,
): Promise<TiparPostRow | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/tipar/posts/${encodeURIComponent(postId)}`, {
    headers: token
      ? { ...nestAuthHeaders(token), Accept: 'application/json' }
      : { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as TiparPostRow | null;
}

export async function nestTiparCreatePost(
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: TiparPostRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/tipar/posts`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  return { ok: true, data: data as TiparPostRow };
}

/** POST /api/tips — multipart vytvoření tipu s fotkami a videem. */
export async function nestTipCreateMultipart(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true; data: TiparPostRow } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/tips`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as TiparPostRow & {
      message?: string | string[];
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
      };
    }
    return { ok: true, data: data as TiparPostRow };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

/** POST /api/tips/upload-photo */
export async function nestTipUploadPhoto(
  token: string | null,
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/tips/upload-photo`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  const url = typeof data.url === 'string' ? data.url.trim() : '';
  if (!url) return { ok: false, error: 'Server nevrátil URL fotky.' };
  return { ok: true, url };
}

/** POST /api/tips/upload-video */
export async function nestTipUploadVideo(
  token: string | null,
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/tips/upload-video`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  const url = typeof data.url === 'string' ? data.url.trim() : '';
  if (!url) return { ok: false, error: 'Server nevrátil URL videa.' };
  return { ok: true, url };
}

/** POST /api/tips/generate-shorts-from-photos */
export async function nestTipGenerateShortsFromPhotos(
  token: string | null,
  formData: FormData,
): Promise<{ ok: true; videoUrl: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/tips/generate-shorts-from-photos`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as { videoUrl?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
      };
    }
    const videoUrl = typeof data.videoUrl === 'string' ? data.videoUrl.trim() : '';
    if (!videoUrl) return { ok: false, error: 'Server nevrátil odkaz na video.' };
    return { ok: true, videoUrl };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

/** PATCH /api/tips/:id — multipart úprava tipu. */
export async function nestTipUpdateMultipart(
  token: string | null,
  tipId: string,
  formData: FormData,
): Promise<{ ok: true; data: TiparPostRow } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/tips/${encodeURIComponent(tipId)}`, {
      method: 'PATCH',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as TiparPostRow & Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, data: data as TiparPostRow };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestTiparDeletePost(
  token: string | null,
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/tipar/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

/** PATCH /api/tips/:id/media-order */
export async function nestTipReorderMedia(
  token: string | null,
  tipId: string,
  orderedUrls: string[],
): Promise<{ ok: boolean; data?: TiparPostRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/tips/${encodeURIComponent(tipId)}/media-order`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderedUrls }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data as Record<string, unknown>, `HTTP ${res.status}`),
    };
  }
  return { ok: true, data: data as TiparPostRow };
}

export async function nestTiparUnlockContact(
  token: string | null,
  postId: string,
  payload: { name: string; email: string; phone: string },
): Promise<{
  ok: boolean;
  data?: {
    unlocked: boolean;
    alreadyOwned?: boolean;
    cost?: number;
    creditBalance?: number;
    contact?: TiparPostRow['contact'];
  };
  error?: string;
  code?: string;
}> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/tipar/posts/${encodeURIComponent(postId)}/unlock-contact`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const nested =
      data.message && typeof data.message === 'object' && !Array.isArray(data.message)
        ? (data.message as Record<string, unknown>)
        : null;
    const msg =
      typeof data.message === 'string'
        ? data.message
        : typeof nested?.message === 'string'
          ? nested.message
          : nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`);
    return {
      ok: false,
      error: msg,
      code:
        typeof data.code === 'string'
          ? data.code
          : typeof nested?.code === 'string'
            ? nested.code
            : undefined,
    };
  }
  return {
    ok: true,
    data: data as {
      unlocked: boolean;
      alreadyOwned?: boolean;
      cost?: number;
      creditBalance?: number;
      contact?: TiparPostRow['contact'];
    },
  };
}

export async function nestListingUnlockContact(
  token: string | null,
  listingId: string,
  payload: { name: string; email: string; phone: string; message?: string },
): Promise<{
  ok: boolean;
      data?: {
    phone?: string | null;
    email?: string | null;
    contactName?: string | null;
    alreadyUnlocked?: boolean;
    contactUnlocked?: boolean;
    creditCharged?: number;
    submitted?: boolean;
    duplicate?: boolean;
    status?: string;
    sellerContactVisible?: boolean;
    message?: string;
  };
  error?: string;
  code?: string;
}> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/listings/${encodeURIComponent(listingId)}/contact-unlock`,
    {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const nested =
      data.message && typeof data.message === 'object' && !Array.isArray(data.message)
        ? (data.message as Record<string, unknown>)
        : null;
    const msg =
      typeof data.message === 'string'
        ? data.message
        : typeof nested?.message === 'string'
          ? nested.message
          : nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`);
    return {
      ok: false,
      error: msg,
      code:
        typeof data.code === 'string'
          ? data.code
          : typeof nested?.code === 'string'
            ? nested.code
            : undefined,
    };
  }
  return {
    ok: true,
    data: {
      phone: typeof data.phone === 'string' ? data.phone : null,
      email: typeof data.email === 'string' ? data.email : null,
      contactName: typeof data.contactName === 'string' ? data.contactName : null,
      alreadyUnlocked: data.alreadyUnlocked === true,
      contactUnlocked: data.contactUnlocked === true || data.alreadyUnlocked === true,
      creditCharged:
        typeof data.creditCharged === 'number' && Number.isFinite(data.creditCharged)
          ? data.creditCharged
          : 0,
      submitted: data.submitted === true,
      duplicate: data.duplicate === true,
      status: typeof data.status === 'string' ? data.status : undefined,
      sellerContactVisible: data.sellerContactVisible === true,
      message: typeof data.message === 'string' ? data.message : undefined,
    },
  };
}

export type AdvertiserListingLeadRow = {
  id: string;
  listingId: string | null;
  listingTitle: string | null;
  listingCity: string | null;
  buyerName: string;
  buyerPhone: string | null;
  buyerEmail: string | null;
  message: string | null;
  leadSource: string | null;
  status: string;
  creditCharged: boolean;
  leadPrice: number;
  unlockedAt: string | null;
  createdAt: string;
};

export async function nestListAdvertiserLeads(
  token: string | null,
): Promise<AdvertiserListingLeadRow[]> {
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/users/me/listing-leads`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as AdvertiserListingLeadRow[]) : [];
}

export async function nestUnlockPendingListingLeads(
  token: string | null,
): Promise<{ ok: boolean; unlocked?: number; remaining?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/users/me/listing-leads/unlock-pending`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof data.message === 'string'
          ? data.message
          : nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return {
    ok: true,
    unlocked: typeof data.unlocked === 'number' ? data.unlocked : 0,
    remaining: typeof data.remaining === 'number' ? data.remaining : 0,
  };
}

export async function nestAdminTiparPosts(token: string | null): Promise<TiparPostRow[]> {
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/admin/tipar/posts`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as TiparPostRow[]) : [];
}

export type TiparAdminStats = {
  postsTotal: number;
  unlocksTotal: number;
  tiparsCount: number;
  totalCreditsEarned: number;
  transactionCount?: number;
  topTipars?: Array<{
    userId: string;
    name?: string | null;
    email?: string | null;
    totalEarned?: number;
    unlockCount?: number;
  }>;
};

export async function nestAdminTiparStats(
  token: string | null,
): Promise<TiparAdminStats | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/tipar/stats`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as TiparAdminStats | null;
}

export async function nestAdminHideTiparPost(
  token: string | null,
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/tipar/posts/${encodeURIComponent(postId)}/hide`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return { ok: false, error: await nestError(res) };
  return { ok: true };
}

export type FacebookPublicConfig = {
  configured: boolean;
  appId: string | null;
};

export async function nestFacebookGetConfig(): Promise<FacebookPublicConfig> {
  if (!API_BASE_URL) {
    return { configured: false, appId: null };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/config`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { configured: false, appId: null };
    const data = (await res.json().catch(() => ({}))) as FacebookPublicConfig;
    return {
      configured: Boolean(data.configured),
      appId: typeof data.appId === 'string' ? data.appId : null,
    };
  } catch {
    return { configured: false, appId: null };
  }
}

export async function nestFacebookGetStatus(
  token: string | null,
): Promise<{ connected: boolean; facebookUserId?: string | null }> {
  if (!API_BASE_URL || !token) return { connected: false };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/status`, {
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { connected: false };
    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      facebookUserId?: string | null;
    };
    return {
      connected: Boolean(data.connected),
      facebookUserId: data.facebookUserId ?? null,
    };
  } catch {
    return { connected: false };
  }
}

export async function nestFacebookConnect(
  token: string | null,
  accessToken: string,
): Promise<{ ok: true; facebookUserId?: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/connect`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      facebookUserId:
        typeof data.facebookUserId === 'string' ? data.facebookUserId : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookUploadVideo(
  token: string | null,
  body: {
    videoUrl: string;
    title: string;
    description: string;
    listingUrl: string;
  },
): Promise<{ ok: true; facebookVideoId?: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/upload-video`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      facebookVideoId:
        typeof data.facebookVideoId === 'string' ? data.facebookVideoId : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type SocialPlatform = 'facebook' | 'tiktok' | 'youtube' | 'instagram';

export async function nestSocialUploadVideo(
  token: string | null,
  platform: SocialPlatform,
  body: {
    videoUrl: string;
    title: string;
    description: string;
    listingUrl: string;
  },
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/${platform}/upload-video`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type OgDebugResponse = {
  selectedOgImage: string;
  selectedSource:
    | 'facebookShareImage'
    | 'thumbnailUrl'
    | 'mainImage'
    | 'firstGalleryImage'
    | 'videoThumbnail'
    | 'logo';
  facebookShareImageUrl?: string | null;
  thumbnailUrl: string | null;
  mainImage: string | null;
  firstGalleryImage: string | null;
  videoThumbnail: string | null;
  isLogoFallback: boolean;
  warning: string | null;
  publicUrl?: string;
  title?: string;
  description?: string;
  ogImage?: string;
  image?: string;
  imageStatus?: number | null;
  contentType?: string | null;
  contentLength?: number | null;
  width?: number | null;
  height?: number | null;
  isPublic?: boolean;
  isWhiteOrBlank?: boolean;
  loadTimeMs?: number | null;
  isCached?: boolean;
  isReadyForFacebook?: boolean;
  cacheControl?: string | null;
};

export async function nestOgDebug(propertyId: string): Promise<OgDebugResponse | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/debug/og/nemovitost/${encodeURIComponent(propertyId)}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as OgDebugResponse | null;
  } catch {
    return null;
  }
}

export type CreditBalanceDto = {
  creditBalance: number;
  realCreditBalance: number;
  bonusCreditBalance: number;
  paidCredit?: number;
  bonusCredit?: number;
  marketingCreditTotal?: number;
  pendingCreditBalance: number;
  creditDebt: number;
  accountLimited: boolean;
  isCreditVerified?: boolean;
  firstTopUpUsed?: boolean;
  warning: string | null;
  pendingTopUps: Array<{
    id: string;
    amount: number;
    status: string;
    expiresAt: string;
    variableSymbol: string;
  }>;
};

export type CreditsBalanceResult =
  | { ok: true; data: CreditBalanceDto }
  | { ok: false; error: string; status?: number };

const CREDITS_BALANCE_TIMEOUT_MS = 15000;

function normalizeCreditBalanceDto(raw: unknown): CreditBalanceDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    creditBalance: Number(o.creditBalance) || 0,
    realCreditBalance: Number(o.realCreditBalance) || 0,
    bonusCreditBalance: Number(o.bonusCreditBalance) || 0,
    paidCredit: Number(o.paidCredit ?? o.realCreditBalance) || 0,
    bonusCredit: Number(o.bonusCredit ?? o.bonusCreditBalance) || 0,
    marketingCreditTotal:
      Number(o.marketingCreditTotal) ||
      (Number(o.realCreditBalance) || 0) + (Number(o.bonusCreditBalance) || 0),
    pendingCreditBalance: Number(o.pendingCreditBalance) || 0,
    creditDebt: Number(o.creditDebt) || 0,
    accountLimited: o.accountLimited === true,
    isCreditVerified: o.isCreditVerified === true,
    firstTopUpUsed: o.firstTopUpUsed === true,
    warning: typeof o.warning === 'string' ? o.warning : null,
    pendingTopUps: Array.isArray(o.pendingTopUps)
      ? (o.pendingTopUps as CreditBalanceDto['pendingTopUps'])
      : [],
  };
}

async function fetchCreditsBalance(
  url: string,
  init: RequestInit,
): Promise<CreditsBalanceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CREDITS_BALANCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const msg = nestApiErrorBodyMessage(
        res.status,
        (parsed ?? {}) as Record<string, unknown>,
        `HTTP ${res.status}`,
      );
      console.error('[credits/balance] API error:', res.status, msg, parsed);
      return { ok: false, error: msg, status: res.status };
    }
    const data = normalizeCreditBalanceDto(parsed);
    if (!data) {
      console.error('[credits/balance] invalid response body:', parsed);
      return { ok: false, error: 'Neplatná odpověď API kreditu.' };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    const msg =
      e instanceof DOMException && e.name === 'AbortError'
        ? 'Vypršel časový limit načítání kreditu.'
        : e instanceof Error
          ? e.message
          : 'Chyba sítě';
    console.error('[credits/balance] request failed:', e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export async function nestCreditsBalance(token: string | null): Promise<CreditsBalanceResult> {
  if (typeof window !== 'undefined') {
    const proxied = await fetchCreditsBalance('/api/nest/credits/balance', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (proxied.ok) return proxied;
    if (proxied.status === 401) return proxied;
    if (API_BASE_URL && token) {
      const direct = await fetchCreditsBalance(`${API_BASE_URL}/credits/balance`, {
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
        cache: 'no-store',
      });
      return direct;
    }
    return proxied;
  }
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  return fetchCreditsBalance(`${API_BASE_URL}/credits/balance`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
}

export type CreditTopUpResultDto = {
  transactionId: string;
  amount: number;
  variableSymbol: string;
  invoiceNumber: string;
  qrPayload: string;
  qrImageUrl: string;
  expiresAt: string;
  message: string;
  paymentDetails: {
    accountNumber: string;
    bankCode: string;
    recipientName: string;
    amount: number;
    currency: string;
    variableSymbol: string;
    paymentMessage: string;
  };
};

export type CreditTopUpAdminDto = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  variableSymbol: string;
  invoiceNumber: string;
  status: string;
  qrPayload: string;
  creditedImmediately: boolean;
  expiresAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
  qrImageUrl: string;
  paymentDetails: {
    account: string;
    amount: number;
    currency: string;
    variableSymbol: string;
    message: string;
  };
};

export type CreditTopUpSettingsDto = {
  id: string;
  accountNumber: string;
  bankCode: string;
  recipientName: string;
  minAmount: number;
  maxAmount: number;
  paymentMessage: string;
  confirmDeadlineDays: number;
  allowUnverifiedFirstTopUp: boolean;
  maxUnverifiedFirstTopUpAmount: number;
  allowPendingCreditSpending: boolean;
  allowPendingForInternalServices: boolean;
  allowBonusCreditOnListingContacts: boolean;
  allowBonusCreditOnTipContacts: boolean;
  dailyTopUpLimit: number;
  pendingTopUpLimit: number;
  createdAt: string;
  updatedAt: string;
};

export async function nestCreditsTopUp(
  token: string | null,
  amount: number,
): Promise<{ ok: true; data: CreditTopUpResultDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/credits/top-up`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  });
  const data = (await res.json().catch(() => ({}))) as CreditTopUpResultDto & {
    message?: string | string[];
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, data };
}

export async function nestAdminCreditTopUpsList(
  token: string | null,
): Promise<CreditTopUpAdminDto[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/credits/top-ups`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as CreditTopUpAdminDto[]) : null;
}

export async function nestAdminCreditTopUpConfirm(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/top-ups/${encodeURIComponent(id)}/confirm`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminCreditTopUpReject(
  token: string | null,
  id: string,
  blockAccount = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/top-ups/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blockAccount }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminCreditTopUpReverse(
  token: string | null,
  id: string,
  blockAccount = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/top-ups/${encodeURIComponent(id)}/reverse`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blockAccount }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminCreditSettingsGet(
  token: string | null,
): Promise<CreditTopUpSettingsDto | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/credits/settings`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as CreditTopUpSettingsDto | null;
}

export async function nestAdminCreditSettingsUpdate(
  token: string | null,
  body: Partial<Omit<CreditTopUpSettingsDto, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<{ ok: true; settings: CreditTopUpSettingsDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/settings`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CreditTopUpSettingsDto & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, settings: data };
}

export async function nestAdminVerifyUserCredit(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/users/${encodeURIComponent(userId)}/verify`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function nestAdminUnverifyUserCredit(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/credits/users/${encodeURIComponent(userId)}/unverify`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function nestAdminRecalculateUserCredit(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/recalculate-credit`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true, data };
}

export type DeveloperNoteRow = {
  id: string;
  category: string;
  status: 'OPEN' | 'RESOLVED';
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; email: string };
  updatedBy?: { id: string; name: string | null; email: string } | null;
};

export async function nestAdminListDeveloperNotes(
  token: string | null,
  params?: { q?: string; category?: string; status?: string },
): Promise<{ items: DeveloperNoteRow[]; total: number }> {
  if (!API_BASE_URL || !token) return { items: [], total: 0 };
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  if (params?.category?.trim()) qs.set('category', params.category.trim());
  if (params?.status?.trim()) qs.set('status', params.status.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/developer-notes${suffix}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json().catch(() => ({}))) as {
    items?: DeveloperNoteRow[];
    total?: number;
  };
  return { items: Array.isArray(data.items) ? data.items : [], total: data.total ?? 0 };
}

export async function nestAdminCreateDeveloperNote(
  token: string | null,
  payload: { body: string; category: string; status?: 'OPEN' | 'RESOLVED' },
): Promise<{ ok: boolean; error?: string; note?: DeveloperNoteRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/developer-notes`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as DeveloperNoteRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true, note: data };
}

export async function nestAdminUpdateDeveloperNote(
  token: string | null,
  id: string,
  payload: Partial<{ body: string; category: string; status: 'OPEN' | 'RESOLVED' }>,
): Promise<{ ok: boolean; error?: string; note?: DeveloperNoteRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/developer-notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as DeveloperNoteRow & {
    message?: string | string[];
  };
  if (!res.ok) {
    const msg = data.message;
    const errText = Array.isArray(msg)
      ? msg.join(', ')
      : typeof msg === 'string'
        ? msg
        : `HTTP ${res.status}`;
    return { ok: false, error: errText };
  }
  return { ok: true, note: data };
}

export async function nestAdminDeleteDeveloperNote(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/developer-notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export type ContactMonetizationSettingsDto = {
  tipPortalPercent: number;
  tipTipsterPercent: number;
  ownerListingContactPrice: number;
  leadPriceClassic: number;
  leadPriceShorts: number;
  leadPriceDeveloper: number;
  leadPriceCompany: number;
  tipMinContactPrice: number;
  tipMaxContactPrice: number;
  tipSuccessBonus: number;
  showSellerContactToBuyer?: boolean;
};

export type CreditHistoryRowDto = {
  id: string;
  source: 'ledger' | 'transaction';
  amount: number;
  type: string;
  purpose?: string | null;
  description?: string | null;
  propertyId?: string | null;
  createdAt: string;
};

export async function nestCreditsHistory(
  token: string | null,
): Promise<{ ok: true; data: CreditHistoryRowDto[] } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/credits/history`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const data = (await res.json().catch(() => [])) as CreditHistoryRowDto[];
  return { ok: true, data: Array.isArray(data) ? data : [] };
}

export async function nestAdminContactMonetizationGet(
  token: string | null,
): Promise<ContactMonetizationSettingsDto | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/contact-monetization`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as ContactMonetizationSettingsDto | null;
}

export async function nestAdminContactMonetizationUpdate(
  token: string | null,
  body: Partial<ContactMonetizationSettingsDto>,
): Promise<{ ok: true; settings: ContactMonetizationSettingsDto } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/contact-monetization`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ContactMonetizationSettingsDto & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
    };
  }
  return { ok: true, settings: data };
}

export type FacebookConfigStatus = {
  configured: boolean;
  missing: string[];
  pagesConfigured?: boolean;
  pagesMissing?: string[];
  loginAppId?: string | null;
  pagesAppId?: string | null;
  oauthRedirectUri?: string | null;
  metaConnectRedirectUri?: string | null;
  pageConnectRedirectUri?: string | null;
  pageConnectRequiresReview?: boolean;
  pageConnectScopesAvailable?: boolean;
  webhookUri?: string | null;
  recommendedMissing?: string[];
  envChecks?: Array<{ key: string; present: boolean; required: boolean }>;
};

export type FacebookAdminStats = {
  connectedAccounts: number;
  connectedLoginAccounts?: number;
  connectedPages: number;
  syncedPosts: number;
  lastSyncAt: string | null;
  lastError: { message: string | null; pageName: string | null; at: string } | null;
};

export async function nestFacebookAdminStats(): Promise<FacebookAdminStats | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/admin-stats`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as FacebookAdminStats;
  } catch {
    return null;
  }
}

export async function nestFacebookConfigStatus(): Promise<FacebookConfigStatus | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/social/facebook/config-status?_=${Date.now()}`,
      {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as FacebookConfigStatus;
  } catch {
    return null;
  }
}

export type FacebookPageStatus = {
  configured: boolean;
  accountConnected: boolean;
  pageConnectScopesAvailable?: boolean;
  connected: boolean;
  facebookUserId: string | null;
  facebookName: string | null;
  facebookEmail: string | null;
  facebookPicture: string | null;
  pageId: string | null;
  pageName: string | null;
  pagePictureUrl?: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  tokenNeedsReauth: boolean;
  pendingPageSelection: boolean;
  needsPageSelection?: boolean;
};

export type FacebookPageOption = { id: string; name: string; picture?: string | null };

export async function nestFacebookPageStatus(
  token: string,
): Promise<FacebookPageStatus | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/page-status`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FacebookPageStatus;
  } catch {
    return null;
  }
}

export async function nestFacebookPageConnectUrl(
  token: string,
  options?: { mode?: 'connect' | 'change_page' },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'Facebook propojení není nakonfigurováno administrátorem.' };
  }
  const mode = options?.mode ?? 'connect';
  const endpoint =
    mode === 'change_page'
      ? `${API_BASE_URL}/social/facebook/connect-page?mode=change_page`
      : `${API_BASE_URL}/social/facebook/connect-page`;
  try {
    const res = await fetch(endpoint, {
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      message?: string | string[];
    };
    if (!res.ok) {
      const msg = Array.isArray(data.message)
        ? data.message.join(' ')
        : typeof data.message === 'string'
          ? data.message
          : 'Nepodařilo se spustit přihlášení přes Facebook.';
      console.error('[nestFacebookPageConnectUrl]', res.status, data);
      return { ok: false, error: msg };
    }
    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) {
      return { ok: false, error: 'Nepodařilo se získat OAuth URL.' };
    }
    return { ok: true, url };
  } catch (err) {
    console.error('[nestFacebookPageConnectUrl]', err);
    return { ok: false, error: 'Síťová chyba při propojení Facebooku.' };
  }
}

export async function nestFacebookPageListPages(
  token: string,
): Promise<
  { ok: true; pages: FacebookPageOption[] } | { ok: false; error: string; permissionDenied?: boolean }
> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'Facebook propojení není nakonfigurováno administrátorem.' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/pages`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`);
      return {
        ok: false,
        error: msg,
        permissionDenied: res.status === 403,
      };
    }
    const pages = Array.isArray(data) ? (data as FacebookPageOption[]) : [];
    return { ok: true, pages };
  } catch {
    return { ok: false, error: 'Síťová chyba při načítání Facebook stránek.' };
  }
}

export async function nestFacebookPageDisconnectPage(
  token: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/disconnect-page`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookPageSelectPage(
  token: string,
  pageId: string,
): Promise<{ ok: true; message?: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/select-page`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      message: typeof data.message === 'string' ? data.message : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookPageDisconnect(
  token: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/disconnect`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookPageSetSyncEnabled(
  token: string,
  syncEnabled: boolean,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/sync-enabled`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ syncEnabled }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookPageSyncNow(
  token: string,
): Promise<
  | {
      ok: true;
      imported?: number;
      found?: number;
      skippedDuplicates?: number;
      reason?: string;
      graphError?: string;
      permissionDenied?: boolean;
      message?: string;
    }
  | { ok: false; error?: string; permissionDenied?: boolean }
> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook/sync-now`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
        permissionDenied: data.permissionDenied === true,
      };
    }
    const imported = typeof data.imported === 'number' ? data.imported : 0;
    const found = typeof data.found === 'number' ? data.found : undefined;
    const reason = typeof data.reason === 'string' ? data.reason : undefined;
    const graphError = typeof data.graphError === 'string' ? data.graphError : undefined;
    const permissionDenied = data.permissionDenied === true;

    let message: string | undefined;
    if (permissionDenied) {
      message =
        typeof data.error === 'string'
          ? data.error
          : 'Znovu propojte Facebook stránku a povolte oprávnění.';
    } else if (imported === 0 && graphError) {
      message = graphError;
    } else if (imported === 0 && found === 0) {
      message = graphError ?? 'Meta API nevrátilo žádné příspěvky.';
    }

    return {
      ok: true,
      imported,
      found,
      skippedDuplicates:
        typeof data.skippedDuplicates === 'number' ? data.skippedDuplicates : undefined,
      reason,
      graphError,
      permissionDenied,
      message,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type FacebookUrlImportStatus = {
  facebookUrl: string | null;
  facebookImportEnabled: boolean;
  facebookLastSyncAt: string | null;
  facebookImportStatus: 'IDLE' | 'RUNNING' | 'OK' | 'ERROR';
  facebookImportError: string | null;
};

export async function nestFacebookUrlImportStatus(
  token: string,
): Promise<FacebookUrlImportStatus | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook-url-import/status`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FacebookUrlImportStatus;
  } catch {
    return null;
  }
}

export async function nestFacebookUrlImportUpdateSettings(
  token: string,
  body: { facebookUrl?: string | null; facebookImportEnabled?: boolean },
): Promise<
  | { ok: true; status?: FacebookUrlImportStatus }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook-url-import/settings`, {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, status: data as FacebookUrlImportStatus };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookUrlImportSync(
  token: string,
): Promise<
  | {
      ok: true;
      imported?: number;
      found?: number;
      skipped?: number;
      detectedReason?: string;
      error?: string | null;
    }
  | { ok: false; error?: string }
> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook-url-import/sync`, {
      method: 'POST',
      headers: nestAuthHeaders(token),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      imported: typeof data.imported === 'number' ? data.imported : undefined,
      found: typeof data.found === 'number' ? data.found : undefined,
      skipped: typeof data.skipped === 'number' ? data.skipped : undefined,
      detectedReason:
        typeof data.detectedReason === 'string' ? data.detectedReason : undefined,
      error:
        data.error === null || typeof data.error === 'string'
          ? (data.error as string | null)
          : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestFacebookUrlImportManualPost(
  token: string,
  body: { postUrl: string; text?: string; imageUrl?: string },
): Promise<{ ok: true; permalink?: string } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/social/facebook-url-import/manual-post`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      permalink: typeof data.permalink === 'string' ? data.permalink : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type AdminFacebookUrlImportProfile = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  facebookUrl: string | null;
  facebookImportEnabled: boolean;
  facebookLastSyncAt: string | null;
  facebookImportStatus: string;
  facebookImportError: string | null;
};

export type AdminFacebookUrlImportLog = {
  id: string;
  userId: string;
  status: string;
  found: number;
  imported: number;
  skipped: number;
  importedCount?: number;
  skippedDuplicates?: number;
  fetchUrl?: string | null;
  httpStatus?: number | null;
  contentLength?: number | null;
  detectedReason?: string | null;
  rawSnippet?: string | null;
  error: string | null;
  createdAt: string;
  user?: { id: string; name: string | null; email: string };
};

export type AdminFacebookUrlImportsResponse = {
  profiles: AdminFacebookUrlImportProfile[];
  recentLogs: AdminFacebookUrlImportLog[];
};

export async function nestAdminFacebookUrlImports(
  token: string,
): Promise<AdminFacebookUrlImportsResponse | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/facebook-url-imports`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as AdminFacebookUrlImportsResponse;
}

export async function nestAdminFacebookUrlImportSync(
  token: string,
  userId: string,
): Promise<{ ok: true; imported?: number } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/facebook-url-imports/${encodeURIComponent(userId)}/sync`,
      { method: 'POST', headers: nestAuthHeaders(token) },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      imported: typeof data.imported === 'number' ? data.imported : undefined,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminFacebookUrlImportSetEnabled(
  token: string,
  userId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/facebook-url-imports/${encodeURIComponent(userId)}/enabled`,
      {
        method: 'PATCH',
        headers: {
          ...nestAuthHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type AdminFacebookConnectionRow = {
  userId: string;
  userName: string | null;
  email: string;
  role: string;
  pageId: string | null;
  pageName: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  importedCount: number;
  lastSyncError: string | null;
  connected: boolean;
};

export async function nestAdminSocialFacebookConnections(
  token: string,
): Promise<AdminFacebookConnectionRow[] | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/social-facebook-connections`, {
    headers: nestAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? (data as AdminFacebookConnectionRow[]) : null;
}

export type WhatsAppConfigStatus = {
  configured: boolean;
  missing: string[];
  webhookUri?: string | null;
  apiVersion?: string;
};

export type WhatsAppAdminStats = WhatsAppConfigStatus & {
  messageCount: number;
  clickCount: number;
  recentErrors: Array<{
    id: string;
    message: string;
    toPhone: string;
    providerMessageId: string | null;
    createdAt: string;
  }>;
};

export async function nestWhatsAppConfigStatus(): Promise<WhatsAppConfigStatus | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/config-status`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as WhatsAppConfigStatus;
  } catch {
    return null;
  }
}

export async function nestAdminWhatsAppStats(
  token: string,
): Promise<WhatsAppAdminStats | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/admin-stats`, {
      headers: nestAuthHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as WhatsAppAdminStats;
  } catch {
    return null;
  }
}

export async function nestPatchWhatsAppSettings(
  token: string,
  body: {
    whatsappPhone?: string;
    whatsappEnabled?: boolean;
    whatsappMarketingOptOut?: boolean;
    whatsappNotifyMyUploads?: boolean;
    whatsappNotifyNewPosts?: boolean;
  },
): Promise<
  | {
      ok: true;
      whatsappPhone?: string;
      whatsappEnabled?: boolean;
      whatsappMarketingOptOut?: boolean;
      whatsappNotifyMyUploads?: boolean;
      whatsappNotifyNewPosts?: boolean;
    }
  | { ok: false; error: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/whatsapp`, {
      method: 'PATCH',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      whatsappPhone:
        typeof data.whatsappPhone === 'string' ? data.whatsappPhone : undefined,
      whatsappEnabled: data.whatsappEnabled === true,
      whatsappMarketingOptOut: data.whatsappMarketingOptOut === true,
      whatsappNotifyMyUploads: data.whatsappNotifyMyUploads === true,
      whatsappNotifyNewPosts: data.whatsappNotifyNewPosts === true,
    };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type WhatsAppVerificationStatusDto = {
  whatsappPhone: string;
  whatsappVerified: boolean;
  whatsappVerifiedAt: string | null;
  pendingVerification: boolean;
  verificationExpiresAt: string | null;
  verificationAttempts: number;
  maxVerificationAttempts: number;
  canResend: boolean;
  resendAvailableAt: string | null;
};

export async function nestWhatsAppVerificationStatus(
  token: string | null,
): Promise<WhatsAppVerificationStatusDto | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/whatsapp-verification`, {
      cache: 'no-store',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as WhatsAppVerificationStatusDto;
  } catch {
    return null;
  }
}

export async function nestRequestWhatsAppVerification(
  token: string,
  phone: string,
): Promise<
  | ({ ok: true; message?: string } & Partial<WhatsAppVerificationStatusDto>)
  | { ok: false; error: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/whatsapp-verification/request`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, ...(data as WhatsAppVerificationStatusDto), message: String(data.message ?? '') };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestConfirmWhatsAppVerification(
  token: string,
  code: string,
): Promise<
  | ({ ok: true; message?: string } & Partial<WhatsAppVerificationStatusDto>)
  | { ok: false; error: string }
> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/whatsapp-verification/confirm`, {
      method: 'POST',
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true, ...(data as WhatsAppVerificationStatusDto), message: String(data.message ?? '') };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestBeginWhatsAppPhoneChange(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!API_BASE_URL || !token) {
    return { ok: false, error: 'API nebo token chybí' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/whatsapp-verification/begin-change`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestResetMyTestAccount(
  token: string | null,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/test-account/reset`, {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
      };
    }
    return { ok: true, message: data.message ?? 'Testovací účet byl resetován.' };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type PortalTestAccountRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isTestAccount: boolean;
  testAccountPublicVisible: boolean;
  config: {
    resetPaidCredit: number;
    resetBonusCredit: number;
    emailVerified: boolean;
    whatsappVerified: boolean;
    profileApproved: boolean;
    publicProfile: boolean;
    testPhone: string;
  };
  paidCredit: number;
  bonusCredit: number;
  emailVerified: boolean;
  whatsappVerified: boolean;
  whatsappPhone: string;
  profileApproved: boolean;
  publicProfile: boolean;
  createdAt: string;
};

export type PortalTestScenarioResult = {
  scenario: string;
  message: string;
  hint?: string;
  url?: string;
};

export async function nestAdminListPortalTestAccounts(
  token: string | null,
): Promise<{ items: PortalTestAccountRow[]; total: number }> {
  if (!API_BASE_URL || !token) return { items: [], total: 0 };
  const res = await fetch(`${API_BASE_URL}/admin/portal-testing`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json().catch(() => ({}))) as {
    items?: PortalTestAccountRow[];
    total?: number;
  };
  return { items: Array.isArray(data.items) ? data.items : [], total: data.total ?? 0 };
}

export async function nestAdminCreatePortalTestAccount(
  token: string | null,
  payload: {
    name: string;
    email: string;
    role: string;
    password: string;
    paidCredit: number;
    bonusCredit: number;
    testPhone?: string;
    emailVerified: boolean;
    whatsappVerified: boolean;
    profileApproved: boolean;
    publicProfile: boolean;
    publicVisible?: boolean;
  },
): Promise<{ ok: boolean; account?: PortalTestAccountRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-testing`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PortalTestAccountRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true, account: data };
}

export async function nestAdminUpdatePortalTestAccount(
  token: string | null,
  userId: string,
  payload: Partial<{
    paidCredit: number;
    bonusCredit: number;
    testPhone: string;
    emailVerified: boolean;
    whatsappVerified: boolean;
    profileApproved: boolean;
    publicProfile: boolean;
    publicVisible: boolean;
  }>,
): Promise<{ ok: boolean; account?: PortalTestAccountRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-testing/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PortalTestAccountRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true, account: data };
}

export async function nestAdminResetPortalTestAccount(
  token: string | null,
  userId: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-testing/${encodeURIComponent(userId)}/reset`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true, message: data.message ?? 'Testovací účet byl resetován.' };
}

export async function nestAdminRunPortalTestScenario(
  token: string | null,
  userId: string,
  scenario: string,
): Promise<{ ok: boolean; result?: PortalTestScenarioResult; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-testing/${encodeURIComponent(userId)}/scenarios/${encodeURIComponent(scenario)}`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const data = (await res.json().catch(() => ({}))) as PortalTestScenarioResult & { message?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true, result: data };
}

export type PortalWorkerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  whatsappPhone: string;
  whatsappVerified: boolean;
  emailVerified: boolean;
  status: string;
  registeredAt: string;
  referredClientCount: number;
  clientsTurnover?: number;
  totalCommission: number;
  maxBonusPerClient?: number;
  commissionPercent?: number | null;
  adminNotes?: string | null;
};

export type PortalWorkerDashboard = {
  clientCount: number;
  totalCommission: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
  isActive?: boolean;
  clients: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    registeredAt: string;
    status: string;
    totalTopUp: number;
    totalCommission: number;
  }>;
  preregistrations?: Array<{
    id: string;
    name: string;
    email: string;
    targetRole: string;
    status: string;
    createdAt: string;
    expiresAt: string;
  }>;
  commissions: Array<{
    id: string;
    referredUserName: string;
    topUpAmount: number;
    percent: number;
    commissionAmount: number;
    status: string;
    createdAt: string;
  }>;
};

export type PortalWorkersListResponse = {
  items: PortalWorkerRow[];
  total: number;
  error?: string;
};

export async function nestAdminListPortalWorkers(
  token: string | null,
): Promise<PortalWorkersListResponse> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/admin/portal-workers', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        items: [],
        total: 0,
        error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`),
      };
    }
    const data = (await res.json()) as { items?: PortalWorkerRow[]; total?: number };
    return { items: data.items ?? [], total: data.total ?? 0 };
  }
  if (!API_BASE_URL || !token) return { items: [], total: 0, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-workers`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      items: [],
      total: 0,
      error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`),
    };
  }
  const data = (await res.json()) as { items?: PortalWorkerRow[]; total?: number };
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function nestAdminPortalWorkerAction(
  token: string | null,
  userId: string,
  action: 'approve' | 'reject' | 'suspend' | 'activate',
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch(
      `/api/nest/admin/portal-workers/${encodeURIComponent(userId)}/${action}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
    }
    return { ok: true };
  }
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-workers/${encodeURIComponent(userId)}/${action}`,
    { method: 'POST', headers: { ...nestAuthHeaders(token), Accept: 'application/json' } },
  );
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export type WorkerCommissionOverviewRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  clientCount: number;
  clientsPaidTopUp: number;
  commissionPercent: number | null;
  maxBonusPerClient: number;
  canAssignBonusCredits: boolean;
  isActive: boolean;
  totalCommission: number;
  estimatedCommission: number;
};

export type WorkerDetailAdmin = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsappPhone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  whatsappVerified: boolean;
  portalWorkerStatus: string;
  publicProfile?: boolean;
  canPublishPosts?: boolean;
  showInProfessionals?: boolean;
  clientCount: number;
  clientsPaidTopUp: number;
  totalCommissionRecorded: number;
  estimatedCommission: number;
  profile: {
    commissionPercent: number | null;
    maxBonusPerClient: number;
    maxBonusPerDay: number | null;
    maxBonusPerMonth: number | null;
    canAssignBonusCredits: boolean;
    isActive: boolean;
    adminNotes: string | null;
  };
};

export async function nestAdminWorkersCommissionOverview(
  token: string | null,
): Promise<{ items: WorkerCommissionOverviewRow[]; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/admin/portal-workers/commission-overview', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return { items: [], error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
    }
    const data = (await res.json()) as { items?: WorkerCommissionOverviewRow[] };
    return { items: data.items ?? [] };
  }
  if (!API_BASE_URL || !token) return { items: [], error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-workers/commission-overview`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return { items: [], error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  const data = (await res.json()) as { items?: WorkerCommissionOverviewRow[] };
  return { items: data.items ?? [] };
}

export async function nestAdminGetWorkerDetail(
  token: string | null,
  userId: string,
): Promise<{ worker: WorkerDetailAdmin | null; error?: string }> {
  const path = `/admin/portal-workers/${encodeURIComponent(userId)}/detail`;
  if (typeof window !== 'undefined') {
    const res = await fetch(`/api/nest/admin/portal-workers/${encodeURIComponent(userId)}/detail`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return { worker: null, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
    }
    return { worker: (await res.json()) as WorkerDetailAdmin };
  }
  if (!API_BASE_URL || !token) return { worker: null, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return { worker: null, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { worker: (await res.json()) as WorkerDetailAdmin };
}

export async function nestAdminUpdateWorkerProfile(
  token: string | null,
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; worker?: WorkerDetailAdmin; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch(
      `/api/nest/admin/portal-workers/${encodeURIComponent(userId)}/profile`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
    }
    return { ok: true, worker: (await res.json()) as WorkerDetailAdmin };
  }
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-workers/${encodeURIComponent(userId)}/profile`,
    {
      method: 'PATCH',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`) };
  }
  return { ok: true, worker: (await res.json()) as WorkerDetailAdmin };
}

export async function nestPortalWorkerDashboard(
  token: string | null,
): Promise<PortalWorkerDashboard | null> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/portal-worker/me/dashboard', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as PortalWorkerDashboard;
  }
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/portal-worker/me/dashboard`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as PortalWorkerDashboard;
}

export async function nestCreateClientPreregistration(
  token: string | null,
  payload: {
    targetRole: string;
    name: string;
    email: string;
    phone: string;
    city?: string;
    note?: string;
  },
): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/portal-worker/client-preregistrations', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
    }
    return { ok: true, message: data.message };
  }
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/portal-worker/client-preregistrations`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  return { ok: true, message: data.message };
}

export async function nestGetWorkerReferralByToken(token: string) {
  if (!API_BASE_URL) return null;
  const res = await fetch(
    `${API_BASE_URL}/auth/worker-referral/${encodeURIComponent(token)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function nestCompleteWorkerReferral(payload: {
  token: string;
  password: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!API_BASE_URL) return { ok: false, error: 'API není nakonfigurováno' };
  const res = await fetch(`${API_BASE_URL}/auth/worker-referral/complete`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  return { ok: true, message: data.message };
}

export async function nestAdminVerifyUserWhatsApp(
  token: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/whatsapp-verification/verify`,
      {
        method: 'PATCH',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestAdminResetUserWhatsApp(
  token: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/whatsapp-verification/reset`,
      {
        method: 'PATCH',
        headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export async function nestWhatsAppClick(body: {
  targetUserId: string;
  listingId?: string;
  listingTitle?: string;
  listingUrl?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!API_BASE_URL) {
    return { ok: false, error: 'API není nakonfigurováno' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/whatsapp/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`),
      };
    }
    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) return { ok: false, error: 'Chybí WhatsApp odkaz.' };
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'Síťová chyba' };
  }
}

export type PublicPromoProfileRow = {
  id: string;
  role: string;
  roleLabel: string;
  avatarUrl: string | null;
  profileHref: string;
  isPromoProfile?: boolean;
  isVerified?: boolean;
  verifiedBadgeLabel?: string | null;
};

export type AdminPromoProfileRow = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  roleLabel: string;
  avatarUrl: string | null;
  isPublic: boolean;
  active: boolean;
  isPromoProfile: boolean;
  createdAt: string;
};

export type PublicPortalProfileRow = PublicPromoProfileRow;

export async function nestFetchPortalProfiles(
  limit = 48,
): Promise<PublicPortalProfileRow[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/portal-profiles/public?limit=${limit}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      const fallback = await fetch(`${API_BASE_URL}/promo-profiles/public?limit=${limit}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!fallback.ok) return [];
      const data = (await fallback.json()) as unknown;
      return Array.isArray(data) ? (data as PublicPortalProfileRow[]) : [];
    }
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as PublicPortalProfileRow[]) : [];
  } catch {
    return [];
  }
}

export async function nestFetchPublicPromoProfiles(
  limit = 48,
): Promise<PublicPromoProfileRow[]> {
  return nestFetchPortalProfiles(limit);
}

export async function nestAdminPromoProfilesList(
  token: string | null,
): Promise<AdminPromoProfileRow[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/promo-profiles`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AdminPromoProfileRow[]) : null;
}

export async function nestAdminPromoProfileGenerateName(
  token: string | null,
): Promise<{ firstName: string; lastName: string } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/promo-profiles/generate-name`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as { firstName: string; lastName: string };
}

export async function nestAdminPromoProfileCreate(
  token: string | null,
  form: FormData,
): Promise<{ ok: boolean; profile?: AdminPromoProfileRow; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/promo-profiles`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, profile: data as AdminPromoProfileRow };
}

export async function nestAdminPromoProfilesBulk(
  token: string | null,
  ids: string[],
  action: 'publish' | 'hide' | 'deactivate' | 'delete',
): Promise<{ ok: boolean; affected?: number; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/promo-profiles/bulk`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids, action }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, affected: typeof data.affected === 'number' ? data.affected : 0 };
}

export type PostSoundTrackDto = {
  id: string;
  title: string;
  artist?: string;
  fileUrl: string;
  previewUrl?: string | null;
  durationSec?: number | null;
  mimeType?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function nestFetchPostSounds(token?: string | null): Promise<PostSoundTrackDto[]> {
  const tracks = await nestListActiveShortsMusicTracks(token ?? null);
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    fileUrl: t.fileUrl ?? t.audioUrl ?? '',
    previewUrl: t.previewUrl ?? t.fileUrl ?? t.audioUrl ?? null,
    durationSec: t.durationSec ?? t.duration ?? null,
  }));
}

export async function nestAdminPostSoundsList(
  token: string | null,
): Promise<PostSoundTrackDto[] | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/post-sounds`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as PostSoundTrackDto[]) : null;
}

export async function nestAdminPostSoundsUpload(
  token: string | null,
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/post-sounds`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminPostSoundsUpdate(
  token: string | null,
  id: string,
  body: { title?: string; artist?: string; description?: string | null; isActive?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/post-sounds/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminPostSoundsDelete(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/post-sounds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export type MarketingPopupRow = {
  id: string;
  slug: string | null;
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  buttons: Array<{ label: string; href: string }>;
  linkUrl: string | null;
  targetRoles: string[];
  excludeRoles: string[];
  triggers: string[];
  profileTriggers: string[];
  isEnabled: boolean;
  sortOrder: number;
  maxViewsPerUser: number;
  repeatAfterDays: number | null;
  displayCount: number;
  isSystem: boolean;
  variant: string;
};

export type PwaPushCampaignRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  targetRoles: string[];
  targetCity: string | null;
  targetInterests: string[];
  scheduledAt: string | null;
  status: string;
  sentCount: number;
  sentAt: string | null;
  createdAt: string;
};

export async function nestMarketingPopupsEligible(
  token: string | null,
  opts?: {
    justRegistered?: boolean;
    justLoggedIn?: boolean;
    isPwaInstalled?: boolean;
    onWorkerPanel?: boolean;
  },
): Promise<MarketingPopupRow[]> {
  if (!API_BASE_URL || !token) return [];
  const qs = new URLSearchParams();
  if (opts?.justRegistered) qs.set('justRegistered', '1');
  if (opts?.justLoggedIn) qs.set('justLoggedIn', '1');
  if (opts?.isPwaInstalled) qs.set('isPwaInstalled', '1');
  if (opts?.onWorkerPanel) qs.set('onWorkerPanel', '1');
  const res = await fetch(`${API_BASE_URL}/marketing-popups/eligible?${qs}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as MarketingPopupRow[]) : [];
}

export async function nestMarketingPopupRecordView(
  token: string | null,
  popupId: string,
): Promise<void> {
  if (!API_BASE_URL || !token) return;
  await fetch(`${API_BASE_URL}/marketing-popups/${encodeURIComponent(popupId)}/record-view`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  }).catch(() => undefined);
}

export async function nestMarketingPopupBySlug(
  token: string | null,
  slug: string,
): Promise<MarketingPopupRow | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/marketing-popups/by-slug/${encodeURIComponent(slug)}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as MarketingPopupRow | null;
}

export async function nestAdminMarketingPopupToggle(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/marketing-popups/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminMarketingPopupsList(token: string | null): Promise<MarketingPopupRow[]> {
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/admin/marketing-popups`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as MarketingPopupRow[]) : [];
}

export async function nestAdminMarketingPopupSave(
  token: string | null,
  body: Partial<MarketingPopupRow> & { name: string; title: string; body: string },
  id?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    id
      ? `${API_BASE_URL}/admin/marketing-popups/${encodeURIComponent(id)}`
      : `${API_BASE_URL}/admin/marketing-popups`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminMarketingPopupDelete(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/marketing-popups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminPwaPushCampaignsList(
  token: string | null,
): Promise<PwaPushCampaignRow[]> {
  if (!API_BASE_URL || !token) return [];
  const res = await fetch(`${API_BASE_URL}/admin/pwa-push-campaigns`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as PwaPushCampaignRow[]) : [];
}

export async function nestAdminPwaPushCampaignSave(
  token: string | null,
  body: {
    title: string;
    body: string;
    url?: string;
    targetRoles?: string[];
    targetCity?: string;
    scheduledAt?: string;
  },
  id?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    id
      ? `${API_BASE_URL}/admin/pwa-push-campaigns/${encodeURIComponent(id)}`
      : `${API_BASE_URL}/admin/pwa-push-campaigns`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: {
        ...nestAuthHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export async function nestAdminPwaPushCampaignSend(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string; sent?: number }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/pwa-push-campaigns/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return { ok: true, sent: typeof data.sent === 'number' ? data.sent : undefined };
}

export type PropertySeekerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsappPhone: string | null;
  whatsappVerifiedPhone: string | null;
  whatsappVerified: boolean;
  marketingConsentWhatsApp: boolean;
  marketingConsentEmail: boolean;
  consentCreatedAt: string | null;
  consentSource: string | null;
  shareCount: number;
  shareCompletedAt: string | null;
  invitedViaWhatsApp: boolean;
  registeredAt: string;
};

export type PropertySeekerStatus = {
  role: string;
  whatsappVerified: boolean;
  whatsappPhone: string | null;
  shareCount: number;
  shareRequired: number;
  shareCompletedAt: string | null;
  onboardingComplete: boolean;
  marketingConsentWhatsApp: boolean;
  marketingConsentEmail: boolean;
  invitedViaWhatsApp: boolean;
};

export async function nestPropertySeekerStatus(
  token: string | null,
): Promise<PropertySeekerStatus | null> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/property-seeker/me/status', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as PropertySeekerStatus;
  }
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/property-seeker/me/status`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as PropertySeekerStatus;
}

export async function nestPropertySeekerRecordShare(
  token: string | null,
): Promise<{ ok: boolean; shareCount?: number; completed?: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/property-seeker/me/record-share', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
    }
    return {
      ok: true,
      shareCount: typeof data.shareCount === 'number' ? data.shareCount : undefined,
      completed: data.completed === true,
    };
  }
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/property-seeker/me/record-share`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: nestApiErrorBodyMessage(res.status, data, `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    shareCount: typeof data.shareCount === 'number' ? data.shareCount : undefined,
    completed: data.completed === true,
  };
}

export async function nestAdminListPropertySeekers(
  token: string | null,
): Promise<{ items: PropertySeekerRow[]; total: number; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/admin/property-seekers', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        items: [],
        total: 0,
        error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`),
      };
    }
    const data = (await res.json()) as { items?: PropertySeekerRow[]; total?: number };
    return { items: data.items ?? [], total: data.total ?? 0 };
  }
  if (!API_BASE_URL || !token) return { items: [], total: 0, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/property-seekers`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      items: [],
      total: 0,
      error: nestApiErrorBodyMessage(res.status, raw, `HTTP ${res.status}`),
    };
  }
  const data = (await res.json()) as { items?: PropertySeekerRow[]; total?: number };
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function nestAdminExportPropertySeekersCsv(
  token: string | null,
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/nest/admin/property-seekers/export', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, blob: await res.blob() };
  }
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/property-seekers/export`, {
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return { ok: true, blob: await res.blob() };
}

export type PortalTermsVersionRow = import('@/lib/portal-terms').PortalTermsVersion;

export async function nestFetchCurrentPortalTerms(): Promise<PortalTermsVersionRow | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/portal-terms/current`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PortalTermsVersionRow | null;
}

export async function nestAdminListPortalTermsVersions(
  token: string | null,
): Promise<{ items: PortalTermsVersionRow[]; total: number }> {
  if (!API_BASE_URL || !token) return { items: [], total: 0 };
  const res = await fetch(`${API_BASE_URL}/admin/portal-terms/versions`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json().catch(() => ({}))) as {
    items?: PortalTermsVersionRow[];
    total?: number;
  };
  return { items: Array.isArray(data.items) ? data.items : [], total: data.total ?? 0 };
}

export async function nestAdminCreatePortalTermsVersion(
  token: string | null,
  payload: {
    title: string;
    termsHtml: string;
    rulesHtml: string;
    operatorContact: string;
    publish?: boolean;
    requireReacceptOnLogin?: boolean;
  },
): Promise<{ ok: boolean; error?: string; version?: PortalTermsVersionRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-terms/versions`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PortalTermsVersionRow & {
    message?: string | string[];
  };
  if (!res.ok) {
    const msg = data.message;
    const errText = Array.isArray(msg)
      ? msg.join(', ')
      : typeof msg === 'string'
        ? msg
        : `HTTP ${res.status}`;
    return { ok: false, error: errText };
  }
  return { ok: true, version: data };
}

export async function nestAdminUpdatePortalTermsVersion(
  token: string | null,
  id: string,
  payload: Partial<{
    title: string;
    termsHtml: string;
    rulesHtml: string;
    operatorContact: string;
    requireReacceptOnLogin: boolean;
  }>,
): Promise<{ ok: boolean; error?: string; version?: PortalTermsVersionRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-terms/versions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PortalTermsVersionRow & {
    message?: string | string[];
  };
  if (!res.ok) {
    const msg = data.message;
    const errText = Array.isArray(msg)
      ? msg.join(', ')
      : typeof msg === 'string'
        ? msg
        : `HTTP ${res.status}`;
    return { ok: false, error: errText };
  }
  return { ok: true, version: data };
}

export async function nestAdminPublishPortalTermsVersion(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string; version?: PortalTermsVersionRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-terms/versions/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const data = (await res.json().catch(() => ({}))) as PortalTermsVersionRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true, version: data };
}

export async function nestAdminUnpublishPortalTermsVersion(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; error?: string; version?: PortalTermsVersionRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-terms/versions/${encodeURIComponent(id)}/unpublish`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    },
  );
  const data = (await res.json().catch(() => ({}))) as PortalTermsVersionRow & { message?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true, version: data };
}

export async function nestAcceptTerms(
  token: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/auth/accept-terms`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export type PortalPresentationPageRow = import('@/lib/portal-presentation').PortalPresentationPage;

export type PresentationAnalyticsSummary = {
  days: number;
  pageViews: number;
  uniqueVisitors: number;
  ctaClicks: number;
  scrollDepthBuckets: Record<string, number>;
  topReferrers: Array<{ referrer: string; count: number }>;
  totalEvents: number;
};

export async function nestAdminGetPresentation(
  token: string | null,
  locale = 'cs',
): Promise<PortalPresentationPageRow | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation?locale=${encodeURIComponent(locale)}`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PortalPresentationPageRow | null;
}

export async function nestAdminUpdatePresentationPage(
  token: string | null,
  payload: Record<string, unknown>,
  locale = 'cs',
): Promise<{ ok: boolean; error?: string; page?: PortalPresentationPageRow }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation?locale=${encodeURIComponent(locale)}`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PortalPresentationPageRow & { message?: string };
  if (!res.ok) return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  return { ok: true, page: data };
}

export async function nestAdminUpsertPresentationSection(
  token: string | null,
  payload: Record<string, unknown>,
  locale = 'cs',
): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'API nebo token chybí' };
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation/sections?locale=${encodeURIComponent(locale)}`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function nestAdminDeletePresentationSection(
  token: string | null,
  id: string,
): Promise<{ ok: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false };
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation/sections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: nestAuthHeaders(token),
  });
  return { ok: res.ok };
}

export async function nestAdminReorderPresentationSections(
  token: string | null,
  orderedIds: string[],
  locale = 'cs',
): Promise<{ ok: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false };
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-presentation/sections/reorder?locale=${encodeURIComponent(locale)}`,
    {
      method: 'POST',
      headers: { ...nestAuthHeaders(token), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    },
  );
  return { ok: res.ok };
}

export async function nestAdminUpsertPresentationFaq(
  token: string | null,
  payload: { id?: string; question: string; answerHtml: string; sortOrder?: number },
  locale = 'cs',
): Promise<{ ok: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false };
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation/faq?locale=${encodeURIComponent(locale)}`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok };
}

export async function nestAdminDeletePresentationFaq(
  token: string | null,
  id: string,
): Promise<{ ok: boolean }> {
  if (!API_BASE_URL || !token) return { ok: false };
  const res = await fetch(`${API_BASE_URL}/admin/portal-presentation/faq/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: nestAuthHeaders(token),
  });
  return { ok: res.ok };
}

export async function nestAdminGetPresentationAnalytics(
  token: string | null,
  locale = 'cs',
  days = 30,
): Promise<PresentationAnalyticsSummary | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/portal-presentation/analytics?locale=${encodeURIComponent(locale)}&days=${days}`,
    { headers: { ...nestAuthHeaders(token), Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PresentationAnalyticsSummary | null;
}

// —— Portal analytics (návštěvnost) ——

export type NestAnalyticsSettings = {
  id: string;
  anonymizeIp: boolean;
  excludeStaff: boolean;
  trackingEnabled: boolean;
  updatedAt: string;
};

export type NestAnalyticsLiveRow = {
  id: string;
  sessionId: string;
  at: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  visitorId: string;
  path: string;
  title: string;
  url: string;
  referrer: string;
  previousPath: string | null;
  deviceType: string;
  browser: string;
  os: string;
  ip: string | null;
  country: string;
  city: string;
  language: string;
};

export type NestAnalyticsRealtime = {
  cards: {
    onlineTotal: number;
    onlineLoggedIn: number;
    onlineAnonymous: number;
    activeSessions5m: number;
    visitsToday: number;
    pageViewsToday: number;
  };
  liveRows: NestAnalyticsLiveRow[];
};

export type NestAnalyticsSessionBrief = {
  id: string;
  visitorId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  ip: string | null;
  deviceType: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  language: string;
  referrer: string;
  pageViewCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  currentPath: string | null;
  currentTitle: string | null;
  currentUrl: string | null;
  isOnline: boolean;
};

export type NestAnalyticsSessionDetail = NestAnalyticsSessionBrief & {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  userAgent: string;
  durationSeconds: number;
  pageViews: Array<{
    id: string;
    path: string;
    title: string;
    url: string;
    referrer: string;
    previousPath: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    createdAt: string;
  }>;
};

export type NestAnalyticsSummary = {
  period: { from: string; to: string };
  sessions: number;
  pageViews: number;
  onlineNow: number;
  uniqueVisitors: number;
  returningVisitors: number;
  newVisitors: number;
  charts: {
    visitsByHour: Array<{ hour: string; sessions: number; pageViews: number }>;
    onlineByMinute: Array<{ minute: string; count: number }>;
    topPages: Array<{ path: string; count: number }>;
    topReferrers: Array<{ referrer: string; count: number }>;
    byCountry: Array<{ country: string; count: number }>;
    byCity: Array<{ city: string; country: string; count: number }>;
    byDevice: Array<{ device: string; count: number }>;
  };
};

function analyticsQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function nestAdminAnalyticsRealtime(
  token: string | null,
): Promise<NestAnalyticsRealtime | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/analytics/realtime`, {
    cache: 'no-store',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestAnalyticsRealtime | null;
}

export async function nestAdminAnalyticsSummary(
  token: string | null,
  query: { period?: string; from?: string; to?: string } = {},
): Promise<NestAnalyticsSummary | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/analytics/summary${analyticsQuery(query)}`,
    { cache: 'no-store', headers: nestAuthHeaders(token) },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestAnalyticsSummary | null;
}

export async function nestAdminAnalyticsSessions(
  token: string | null,
  query: {
    period?: string;
    from?: string;
    to?: string;
    path?: string;
    country?: string;
    city?: string;
    referrer?: string;
    loggedIn?: string;
    deviceType?: string;
    limit?: string;
  } = {},
): Promise<{ items: NestAnalyticsSessionBrief[] } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/analytics/sessions${analyticsQuery(query)}`,
    { cache: 'no-store', headers: nestAuthHeaders(token) },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { items: NestAnalyticsSessionBrief[] } | null;
}

export async function nestAdminAnalyticsSessionDetail(
  token: string | null,
  sessionId: string,
): Promise<NestAnalyticsSessionDetail | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/analytics/sessions/${encodeURIComponent(sessionId)}`,
    { cache: 'no-store', headers: nestAuthHeaders(token) },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestAnalyticsSessionDetail | null;
}

export async function nestAdminAnalyticsLocations(
  token: string | null,
  query: { period?: string; from?: string; to?: string } = {},
): Promise<{
  items: Array<{
    country: string;
    city: string;
    visitors: number;
    pageViews: number;
    lastActivity: string | null;
  }>;
} | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(
    `${API_BASE_URL}/admin/analytics/locations${analyticsQuery(query)}`,
    { cache: 'no-store', headers: nestAuthHeaders(token) },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    items: Array<{
      country: string;
      city: string;
      visitors: number;
      pageViews: number;
      lastActivity: string | null;
    }>;
  } | null;
}

export async function nestAdminAnalyticsSettings(
  token: string | null,
): Promise<NestAnalyticsSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/analytics/settings`, {
    cache: 'no-store',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestAnalyticsSettings | null;
}

export async function nestAdminUpdateAnalyticsSettings(
  token: string | null,
  patch: Partial<Pick<NestAnalyticsSettings, 'anonymizeIp' | 'excludeStaff' | 'trackingEnabled'>>,
): Promise<NestAnalyticsSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/analytics/settings`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestAnalyticsSettings | null;
}

// —— SEO portálu ——

export type NestSeoSettings = {
  id: string;
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string[];
  defaultOgImageUrl: string | null;
  robotsIndex: boolean;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  googleSearchConsoleVerification: string | null;
  metaPixelId: string | null;
  seznamWebmasterVerification: string | null;
  bingWebmasterVerification: string | null;
  yandexVerification: string | null;
  pinterestVerification: string | null;
  tiktokPixelId: string | null;
  linkedInInsightId: string | null;
  cookieConsentEnabled: boolean;
  hreflangLocales: string[];
  updatedAt: string;
};

export type NestSeoHealth = {
  indexedListings: number;
  totalListings: number;
  missingMetaTitle: number;
  missingMetaDescription: number;
  missingSlug: number;
  duplicateSlugs: number;
  seoScore: number;
};

export async function nestAdminSeoSettings(token: string | null): Promise<NestSeoSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/settings`, {
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestSeoSettings | null;
}

export async function nestAdminSeoUpdateSettings(
  token: string | null,
  patch: Partial<NestSeoSettings>,
): Promise<NestSeoSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/settings`, {
    method: 'PATCH',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestSeoSettings | null;
}

export async function nestAdminSeoHealth(token: string | null): Promise<NestSeoHealth | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/health`, {
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as NestSeoHealth | null;
}

export async function nestAdminSeoBackfillSlugs(
  token: string | null,
): Promise<{ processed: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/backfill-slugs`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { processed: number } | null;
}

export type SeoIndexationRow = {
  id: string;
  contentType: string;
  contentId: string;
  url: string;
  inSitemap: boolean;
  status: string;
  lastSubmittedAt: string | null;
  lastIndexedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function nestAdminSeoIndexationList(
  token: string | null,
  opts?: { q?: string; status?: string; limit?: number; offset?: number },
): Promise<{ items: SeoIndexationRow[]; total: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.status) params.set('status', opts.status);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/admin/seo/indexation${qs ? `?${qs}` : ''}`, {
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { items: SeoIndexationRow[]; total: number } | null;
}

export async function nestAdminSeoIndexationReindex(
  token: string | null,
  id: string,
): Promise<{ ok: boolean; status?: string } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/indexation/${encodeURIComponent(id)}/reindex`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { ok: boolean; status?: string } | null;
}

export async function nestAdminSeoIndexationProcessPending(
  token: string | null,
): Promise<{ processed: number; submitted: number } | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/seo/indexation/process-pending`, {
    method: 'POST',
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { processed: number; submitted: number } | null;
}

export type StatisticsSettings = {
  id: string;
  shortsViewsAutopilotEnabled: boolean;
  shortsViewsRatePerHour: number;
  shortsViewsRateMin: number;
  shortsViewsRateMax: number;
  shortsViewsIntervalMinutes: number;
  shortsViewsMaxPerDay: number;
  shortsViewsMaxTotal: number;
  classicViewsAutopilotEnabled: boolean;
  classicViewsRatePerHour: number;
  classicViewsRateMin: number;
  classicViewsRateMax: number;
  classicViewsIntervalMinutes: number;
  classicViewsMaxPerDay: number;
  classicViewsMaxTotal: number;
  newListingBoostHours: number;
  newListingBoostMultiplier: number;
  postsLikesAutopilotEnabled: boolean;
  postsLikesRatePerHour: number;
  postsLikesRateMin: number;
  postsLikesRateMax: number;
  postsLikesIntervalMinutes: number;
  postsLikesMaxPerDay: number;
  postsLikesMaxTotal: number;
  postsLikesAfter24hMax: number;
  viewDedupHours: number;
};

export async function nestAdminGetStatisticsSettings(
  token: string | null,
): Promise<StatisticsSettings | null> {
  if (!API_BASE_URL || !token) return null;
  const res = await fetch(`${API_BASE_URL}/admin/statistics-settings`, {
    headers: nestAuthHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as StatisticsSettings | null;
}

export async function nestAdminUpdateStatisticsSettings(
  token: string | null,
  patch: Partial<StatisticsSettings>,
): Promise<{ ok: true; data: StatisticsSettings } | { ok: false; error?: string }> {
  if (!API_BASE_URL || !token) return { ok: false, error: 'Chybí API nebo token' };
  const res = await fetch(`${API_BASE_URL}/admin/statistics-settings`, {
    method: 'PUT',
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: err || `HTTP ${res.status}` };
  }
  const data = (await res.json()) as StatisticsSettings;
  return { ok: true, data };
}

