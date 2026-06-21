import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

export type RegistrationStepKey =
  | 'FIRST_LISTING'
  | 'FIRST_POST'
  | 'FACEBOOK_PAGE'
  | 'PROFILE_COMPLETE'
  | 'PHONE_VERIFIED'
  | 'EMAIL_VERIFIED';

export type RegistrationRequirementsStatus = {
  allCompleted: boolean;
  pendingCount: number;
  steps: Array<{
    key: RegistrationStepKey;
    label: string;
    completed: boolean;
    required: boolean;
    href: string;
  }>;
};

export type RegistrationRequirementRoleSetting = {
  role: string;
  requireFirstListing: boolean;
  requireFirstPost: boolean;
  requireFacebookPage: boolean;
  requireProfileComplete: boolean;
  requirePhoneVerified: boolean;
  requireEmailVerified: boolean;
  updatedAt: string;
};

export type MarketingBonusActionType =
  | 'FACEBOOK_CONNECT'
  | 'INVITE_EMAIL'
  | 'INVITE_WHATSAPP'
  | 'REFERRAL_REGISTRATION'
  | 'FIRST_AD'
  | 'FIRST_VIDEO_AD'
  | 'FIRST_POST'
  | 'PROFILE_COMPLETE'
  | 'PROFILE_VERIFIED'
  | 'CUSTOM'
  | 'LEGACY_LISTING_TIP';

export type UserBonusCampaign = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  bonusText: string;
  amount: number;
  actionType: MarketingBonusActionType;
  conditionMinCount: number;
};

export type ReferralInfo = {
  referralCode: string;
  referralUrl: string;
  stats: {
    emailInvites: number;
    whatsappInvites: number;
    registrations: number;
  };
};

export type BonusClaimAdminRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  campaignId: string;
  campaignTitle: string;
  actionType: string;
  amount: number;
  reason: string | null;
  createdAt: string;
};

function apiBase(): string {
  if (!API_BASE_URL) return '';
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

export async function nestAdminRegistrationRequirementsList(
  token: string | null,
): Promise<RegistrationRequirementRoleSetting[] | null> {
  const base = apiBase();
  if (!base || !token) return null;
  const res = await fetch(`${base}/admin/registration-requirements`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as RegistrationRequirementRoleSetting[]) : null;
}

export async function nestAdminRegistrationRequirementPatch(
  token: string | null,
  role: string,
  patch: Partial<Omit<RegistrationRequirementRoleSetting, 'role' | 'updatedAt'>>,
): Promise<{ ok: true; setting: RegistrationRequirementRoleSetting } | { ok: false; error?: string }> {
  const base = apiBase();
  if (!base || !token) return { ok: false, error: 'Chybí API nebo token' };
  const res = await fetch(`${base}/admin/registration-requirements/${encodeURIComponent(role)}`, {
    method: 'PATCH',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data?.message === 'string' ? data.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true, setting: data as RegistrationRequirementRoleSetting };
}

export async function nestFetchActiveBonusCampaignsForMe(
  token: string | null,
): Promise<UserBonusCampaign[]> {
  const base = apiBase();
  if (!base || !token) return [];
  const res = await fetch(`${base}/bonus-campaign/active-for-me`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as UserBonusCampaign[]) : [];
}

export async function nestFetchReferralInfo(token: string | null): Promise<ReferralInfo | null> {
  const base = apiBase();
  if (!base || !token) return null;
  const res = await fetch(`${base}/referral/me`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as ReferralInfo | null;
}

export async function nestLogReferralInvite(
  token: string | null,
  body: { channel: 'EMAIL' | 'WHATSAPP'; target?: string },
): Promise<{ ok: boolean; error?: string }> {
  const base = apiBase();
  if (!base || !token) return { ok: false, error: 'Chybí API nebo token' };
  const res = await fetch(`${base}/referral/invites`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: typeof data?.message === 'string' ? data.message : `HTTP ${res.status}`,
    };
  }
  return { ok: true };
}

export async function nestAdminBonusClaimsList(
  token: string | null,
): Promise<{ summary: { totalClaims: number; totalCreditsGranted: number }; claims: BonusClaimAdminRow[] } | null> {
  const base = apiBase();
  if (!base || !token) return null;
  const res = await fetch(`${base}/admin/bonus-campaigns/claims`, {
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    summary: { totalClaims: number; totalCreditsGranted: number };
    claims: BonusClaimAdminRow[];
  } | null;
}

export async function nestAdminManualBonusGrant(
  token: string | null,
  body: { userId: string; amount: number; campaignId?: string; reason?: string; description?: string },
): Promise<{ ok: boolean; error?: string }> {
  const base = apiBase();
  if (!base || !token) return { ok: false, error: 'Chybí API' };
  const res = await fetch(`${base}/admin/bonus-campaigns/manual-grant`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: typeof data?.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function nestAdminManualBonusRevoke(
  token: string | null,
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = apiBase();
  if (!base || !token) return { ok: false, error: 'Chybí API' };
  const res = await fetch(`${base}/admin/bonus-campaigns/manual-revoke`, {
    method: 'POST',
    headers: {
      ...nestAuthHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ claimId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: typeof data?.message === 'string' ? data.message : `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function nestVerifyEmail(token: string | null): Promise<boolean> {
  const { nestSendEmailVerification } = await import('@/lib/nest-client');
  const result = await nestSendEmailVerification(token);
  return result.ok;
}

export async function nestVerifyPhone(token: string | null): Promise<boolean> {
  const base = apiBase();
  if (!base || !token) return false;
  const res = await fetch(`${base}/users/me/verify-phone`, {
    method: 'POST',
    headers: { ...nestAuthHeaders(token), Accept: 'application/json' },
  });
  return res.ok;
}

export const BONUS_ACTION_LABELS: Record<MarketingBonusActionType, string> = {
  FACEBOOK_CONNECT: 'Propojení Facebook stránky',
  INVITE_EMAIL: 'Pozvánky e-mailem',
  INVITE_WHATSAPP: 'Pozvánky přes WhatsApp',
  REFERRAL_REGISTRATION: 'Registrace pozvaného přítele',
  FIRST_AD: 'První inzerát',
  FIRST_VIDEO_AD: 'První video inzerát',
  FIRST_POST: 'První příspěvek',
  PROFILE_COMPLETE: 'Dokončený profil',
  PROFILE_VERIFIED: 'Ověřený profil',
  CUSTOM: 'Vlastní akce',
  LEGACY_LISTING_TIP: 'První inzerát / tip (legacy)',
};

export function bonusCampaignHref(actionType: MarketingBonusActionType): string {
  switch (actionType) {
    case 'FACEBOOK_CONNECT':
      return '/profil/dashboard?tab=social-integrations';
    case 'INVITE_EMAIL':
    case 'INVITE_WHATSAPP':
    case 'REFERRAL_REGISTRATION':
      return '/profil/dashboard?tab=referral';
    case 'FIRST_AD':
    case 'FIRST_VIDEO_AD':
      return '/inzerat/pridat';
    case 'FIRST_POST':
      return '/profil';
    case 'PROFILE_COMPLETE':
    case 'PROFILE_VERIFIED':
      return '/profil/dashboard?tab=settings';
    default:
      return '/profil/dashboard';
  }
}
