/** Normalizace uživatele z /auth/me nebo login response. */

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  phone?: string;
  phonePublic?: boolean;
  role: string;
  createdAt: string;
  portalWorkerStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
  avatar?: string | null;
  avatarCrop?: { x: number; y: number; zoom: number } | null;
  coverImage?: string | null;
  coverCrop?: { x: number; y: number; zoom: number } | null;
  bio?: string | null;
  firstContentCompleted?: boolean;
  requireFirstContent?: boolean;
  registrationRequirements?: import('@/lib/marketing-bonus').RegistrationRequirementsStatus | null;
  termsReacceptRequired?: boolean;
  currentTermsVersion?: number | null;
  publicProfile?: boolean;
};

export function normalizeAuthUser(raw: unknown): AuthUser | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.email !== 'string' || typeof o.role !== 'string') {
    return null;
  }
  const avatarRaw = o.avatar ?? o.avatarUrl;
  const coverRaw = o.coverImage ?? o.coverImageUrl;
  const avatarCropRaw = o.avatarCrop;
  const coverCropRaw = o.coverCrop;
  const avatar =
    typeof avatarRaw === 'string' && avatarRaw.trim() ? avatarRaw.trim() : null;
  const coverImage =
    typeof coverRaw === 'string' && coverRaw.trim() ? coverRaw.trim() : null;
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
  const name =
    o.name === undefined
      ? undefined
      : o.name === null || typeof o.name === 'string'
        ? typeof o.name === 'string'
          ? o.name.trim() || null
          : null
        : undefined;
  const createdAt =
    typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
  const portalWorkerStatus =
    o.portalWorkerStatus === 'PENDING_APPROVAL' ||
    o.portalWorkerStatus === 'APPROVED' ||
    o.portalWorkerStatus === 'REJECTED' ||
    o.portalWorkerStatus === 'SUSPENDED'
      ? o.portalWorkerStatus
      : o.portalWorkerStatus === null
        ? null
        : undefined;
  return {
    id: o.id,
    email: o.email,
    name,
    phone: typeof o.phone === 'string' ? o.phone : '',
    phonePublic: o.phonePublic === true,
    role: o.role,
    createdAt,
    portalWorkerStatus,
    avatar,
    avatarCrop,
    coverImage,
    coverCrop,
    bio,
    firstContentCompleted: o.firstContentCompleted === true,
    requireFirstContent: o.requireFirstContent === true,
    registrationRequirements:
      o.registrationRequirements && typeof o.registrationRequirements === 'object'
        ? (o.registrationRequirements as AuthUser['registrationRequirements'])
        : null,
    termsReacceptRequired: o.termsReacceptRequired === true,
    currentTermsVersion:
      typeof o.currentTermsVersion === 'number' ? o.currentTermsVersion : null,
    publicProfile: o.publicProfile === true || o.isPublicProfile === true,
  };
}
