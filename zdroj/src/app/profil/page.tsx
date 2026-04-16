'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestChangeMyPassword,
  nestDeleteAvatar,
  nestDeleteCover,
  nestDeleteMyPost,
  nestDeleteMyProperty,
  nestDeleteShortsListing,
  nestFetchFavorites,
  nestFetchMe,
  nestFetchProfileWall,
  nestListNotifications,
  nestMarkNotificationRead,
  nestPatchBrokerLeadPrefs,
  nestPatchBrokerPublicProfile,
  nestPatchAvatarCrop,
  nestPatchCoverCrop,
  nestPatchProfileVisibility,
  nestPatchProfessionalVisibility,
  nestListMyCompanyAds,
  nestPatchProfileBio,
  nestCreateStory,
  nestSubmitAgentProfileRequest,
  nestSubmitAgencyProfileRequest,
  nestSubmitCompanyProfileRequest,
  nestSubmitFinancialAdvisorProfileRequest,
  nestSubmitInvestorProfileRequest,
  nestUploadAgentProfileLogo,
  nestUploadAvatar,
  nestUploadCover,
  nestUpdateMyPost,
  NEST_PROFILE_IMAGE_MAX_BYTES,
  type NestMeProfile,
  type NestProfileWallPost,
  type NestProfileWallVideo,
  type NestCompanyAdRow,
  type UserNotificationRow,
} from '@/lib/nest-client';
import {
  ImageCropEditorModal,
  imageCropToStyle,
  type ImageCrop,
} from '@/components/profile/image-crop-editor-modal';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';
import {
  canCreateProfessionalListingsAndPosts,
  canRequestProfessionalProfileUpgrade,
  dashboardPathForRole,
} from '@/lib/roles';
import { ProfessionalOnlyDialog } from '@/components/auth/ProfessionalListingRestriction';

const BIO_MAX = 500;
const ACCEPT_IMAGES = 'image/jpeg,image/jpg,image/png,image/webp';

function assertImageFile(file: File): string | null {
  const okMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const lower = file.name.toLowerCase();
  const okExt = /\.(jpe?g|png|webp)$/.test(lower);
  if (!okMime && !okExt) {
    return 'Nepodporovaný formát. Použijte JPG, PNG nebo WebP.';
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export default function ProfilPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, apiAccessToken, refresh, setUser } = useAuth();
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const [nestAvatar, setNestAvatar] = useState<string | null>(null);
  const [nestCover, setNestCover] = useState<string | null>(null);
  const [nestBio, setNestBio] = useState<string | null>(null);
  const [nestMe, setNestMe] = useState<NestMeProfile | null>(null);
  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [favorites, setFavorites] = useState<PropertyFeedItem[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [wallLoading, setWallLoading] = useState(false);
  const [wallPosts, setWallPosts] = useState<NestProfileWallPost[]>([]);
  const [wallVideos, setWallVideos] = useState<NestProfileWallVideo[]>([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [professionalVisibility, setProfessionalVisibility] = useState<boolean>(false);
  const [companyAds, setCompanyAds] = useState<NestCompanyAdRow[]>([]);

  const [brokerOffice, setBrokerOffice] = useState('');
  const [brokerSpec, setBrokerSpec] = useState('');
  const [brokerRegion, setBrokerRegion] = useState('');
  const [brokerWeb, setBrokerWeb] = useState('');
  const [brokerPhone, setBrokerPhone] = useState('');
  const [brokerEmailPub, setBrokerEmailPub] = useState('');
  const [brokerFieldsSaving, setBrokerFieldsSaving] = useState(false);
  const [brokerFieldsError, setBrokerFieldsError] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<ImageCrop | null>(null);
  const [coverCrop, setCoverCrop] = useState<ImageCrop | null>(null);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const [avatarCropImageUrl, setAvatarCropImageUrl] = useState<string | null>(null);
  const [coverCropImageUrl, setCoverCropImageUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState('');
  const [bioEditing, setBioEditing] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profilePhoneDraft, setProfilePhoneDraft] = useState('');
  const [profilePhonePublicDraft, setProfilePhonePublicDraft] = useState(false);

  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentFullName, setAgentFullName] = useState('');
  const [agentCompany, setAgentCompany] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentWeb, setAgentWeb] = useState('');
  const [agentIco, setAgentIco] = useState('');
  const [agentCity, setAgentCity] = useState('');
  const [agentBio, setAgentBio] = useState('');
  const [agentLogoUrl, setAgentLogoUrl] = useState<string | null>(null);
  const [agentLogoUploading, setAgentLogoUploading] = useState(false);
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentFormError, setAgentFormError] = useState<string | null>(null);
  const agentLogoInputRef = useRef<HTMLInputElement>(null);
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyContact, setCompanyContact] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWeb, setCompanyWeb] = useState('');
  const [companyIco, setCompanyIco] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyDesc, setCompanyDesc] = useState('');
  const [companyServices, setCompanyServices] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [agencyFormOpen, setAgencyFormOpen] = useState(false);
  const [agencySubmitting, setAgencySubmitting] = useState(false);
  const [agencyFormError, setAgencyFormError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [agencyContact, setAgencyContact] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [agencyWeb, setAgencyWeb] = useState('');
  const [agencyIco, setAgencyIco] = useState('');
  const [agencyCity, setAgencyCity] = useState('');
  const [agencyDesc, setAgencyDesc] = useState('');
  const [agencyAgentCount, setAgencyAgentCount] = useState('');
  const [agencyBranches, setAgencyBranches] = useState('');
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [advisorFormOpen, setAdvisorFormOpen] = useState(false);
  const [advisorSubmitting, setAdvisorSubmitting] = useState(false);
  const [advisorFormError, setAdvisorFormError] = useState<string | null>(null);
  const [advisorFullName, setAdvisorFullName] = useState('');
  const [advisorBrandName, setAdvisorBrandName] = useState('');
  const [advisorPhone, setAdvisorPhone] = useState('');
  const [advisorEmail, setAdvisorEmail] = useState('');
  const [advisorWeb, setAdvisorWeb] = useState('');
  const [advisorIco, setAdvisorIco] = useState('');
  const [advisorCity, setAdvisorCity] = useState('');
  const [advisorBio, setAdvisorBio] = useState('');
  const [advisorSpecializations, setAdvisorSpecializations] = useState('');
  const [advisorAvatarUrl, setAdvisorAvatarUrl] = useState('');
  const [advisorLogoUrl, setAdvisorLogoUrl] = useState('');
  const [investorFormOpen, setInvestorFormOpen] = useState(false);
  const [investorSubmitting, setInvestorSubmitting] = useState(false);
  const [investorFormError, setInvestorFormError] = useState<string | null>(null);
  const [investorFullName, setInvestorFullName] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [investorType, setInvestorType] = useState('');
  const [investorPhone, setInvestorPhone] = useState('');
  const [investorEmail, setInvestorEmail] = useState('');
  const [investorWeb, setInvestorWeb] = useState('');
  const [investorCity, setInvestorCity] = useState('');
  const [investorBio, setInvestorBio] = useState('');
  const [investorFocus, setInvestorFocus] = useState('');
  const [investorAvatarUrl, setInvestorAvatarUrl] = useState('');
  const [investorLogoUrl, setInvestorLogoUrl] = useState('');
  /** Staré lokální `/uploads/…` na Railway po deployi vrací 404 — zobrazí se placeholder. */
  const [avatarRemoteFailed, setAvatarRemoteFailed] = useState(false);
  const [coverRemoteFailed, setCoverRemoteFailed] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const previousCoverCropRef = useRef<ImageCrop | null>(null);
  const uctNavHandledRef = useRef(false);
  const [professionalListingDialogOpen, setProfessionalListingDialogOpen] = useState(false);
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [profileVisibilitySaving, setProfileVisibilitySaving] = useState(false);
  const [isProfilePublic, setIsProfilePublic] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [profileActionsOpen, setProfileActionsOpen] = useState<null | 'avatar' | 'cover'>(null);
  const [wallEditPostId, setWallEditPostId] = useState<string | null>(null);
  const [wallEditText, setWallEditText] = useState('');
  const [wallBusyPostId, setWallBusyPostId] = useState<string | null>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 4000);
  }, []);

  async function onCreateStory(file: File) {
    if (!apiAccessToken) return;
    setStoryError(null);
    setStoryUploading(true);
    const res = await nestCreateStory(apiAccessToken, file);
    setStoryUploading(false);
    if (!res.ok) {
      setStoryError(res.error ?? 'Přidání příběhu selhalo.');
      return;
    }
    showSuccess('Příběh byl publikován na 24 hodin.');
  }

  const loadNestProfile = useCallback(async () => {
    const me = await nestFetchMe(apiAccessToken);
    /** Při chybě GET /users/me nesmazat už načtené URL — držíme stav z auth / posledního uploadu. */
    if (!me) return;
    setNestMe(me);
    setNestAvatar(me.avatarUrl ?? null);
    setNestCover(me.coverImageUrl ?? null);
    setAvatarCrop(me.avatarCrop ?? null);
    setCoverCrop(me.coverCrop ?? null);
    setNestBio(me.bio ?? null);
    setBioDraft(me.bio ?? '');
    setProfileNameDraft((me.name ?? '').trim());
    setProfilePhoneDraft((me.phone ?? '').trim());
    setProfilePhonePublicDraft(Boolean(me.phonePublic));
    const visibility =
      me.role === 'AGENT'
        ? Boolean(me.isPublicBrokerProfile)
        : me.role === 'COMPANY'
          ? Boolean(me.companyProfile?.isPublic)
          : me.role === 'AGENCY'
            ? Boolean(me.agencyProfile?.isPublic)
            : me.role === 'FINANCIAL_ADVISOR'
              ? Boolean(me.financialAdvisorProfile?.isPublic)
              : me.role === 'INVESTOR'
                ? Boolean(me.investorProfile?.isPublic)
            : false;
    setProfessionalVisibility(visibility);
    setIsProfilePublic(
      typeof me.isPublicBrokerProfile === 'boolean'
        ? me.isPublicBrokerProfile
        : visibility,
    );
  }, [apiAccessToken]);

  const loadNotifications = useCallback(async () => {
    if (!apiAccessToken || user?.role !== 'AGENT') return;
    setNotifLoading(true);
    const rows = await nestListNotifications(apiAccessToken);
    setNotifLoading(false);
    setNotifications(rows ?? []);
  }, [apiAccessToken, user?.role]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const loadFavorites = useCallback(async () => {
    if (!apiAccessToken) {
      setFavorites([]);
      return;
    }
    setFavLoading(true);
    setFavError(null);
    const raw = await nestFetchFavorites(apiAccessToken);
    setFavLoading(false);
    if (!raw) {
      setFavError('Oblíbené se nepodařilo načíst (zkontroluj Nest API a JWT).');
      setFavorites([]);
      return;
    }
    const items: PropertyFeedItem[] = [];
    for (const row of raw) {
      const n = safeNormalizePropertyFromApi(row);
      if (n) items.push({ ...n, liked: true });
    }
    setFavorites(items);
  }, [apiAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadNestProfile();
  }, [loadNestProfile, isAuthenticated]);

  useEffect(() => {
    if (!nestMe || user?.role !== 'AGENT') return;
    setBrokerOffice(nestMe.brokerOfficeName ?? '');
    setBrokerSpec(nestMe.brokerSpecialization ?? '');
    setBrokerRegion(nestMe.brokerRegionLabel ?? '');
    setBrokerWeb(nestMe.brokerWeb ?? '');
    setBrokerPhone(nestMe.brokerPhonePublic ?? '');
    setBrokerEmailPub(nestMe.brokerEmailPublic ?? '');
  }, [nestMe, user?.role]);

  useEffect(() => {
    if (
      !user?.id ||
      !['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user.role)
    ) {
      setWallPosts([]);
      setWallVideos([]);
      return;
    }
    setWallLoading(true);
    void nestFetchProfileWall(user.id, apiAccessToken).then((rows) => {
      setWallLoading(false);
      setWallPosts(rows?.posts ?? []);
      setWallVideos(rows?.videos ?? []);
    });
  }, [user?.id, user?.role, apiAccessToken]);

  /** Po návratu na stránku: pokud Nest /users/me nestihl, použij avatar z auth session. */
  useEffect(() => {
    if (user?.avatar) {
      setNestAvatar((prev) => prev ?? user.avatar ?? null);
    }
  }, [user?.avatar]);

  useEffect(() => {
    const c = user?.coverImage;
    if (typeof c === 'string' && c.trim()) {
      setNestCover((prev) => prev ?? c);
    }
  }, [user?.coverImage]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'COMPANY') {
      setCompanyAds([]);
      return;
    }
    void nestListMyCompanyAds(apiAccessToken).then((rows) => {
      setCompanyAds(rows ?? []);
    });
  }, [apiAccessToken, user?.role]);

  const avatarUrl = nestAvatar ?? user?.avatar ?? null;
  const coverUrl = nestCover ?? (user as { coverImage?: string | null })?.coverImage ?? null;
  const bioText = nestBio ?? (user as { bio?: string | null })?.bio ?? null;
  const activeCompanyAds = companyAds.filter((ad) => ad.isActive).length;
  const inactiveCompanyAds = Math.max(0, companyAds.length - activeCompanyAds);

  const imgSrc = useMemo(() => {
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    if (avatarUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(avatarUrl) || avatarUrl;
    }
    return avatarUrl;
  }, [avatarUrl]);

  const coverSrc = useMemo(() => {
    if (!coverUrl) return null;
    if (/^https?:\/\//i.test(coverUrl)) return coverUrl;
    if (coverUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(coverUrl) || coverUrl;
    }
    return coverUrl;
  }, [coverUrl]);

  useEffect(() => {
    setAvatarRemoteFailed(false);
  }, [imgSrc]);

  useEffect(() => {
    setCoverRemoteFailed(false);
  }, [coverSrc]);

  const displayAvatarSrc = avatarPreview ?? (avatarRemoteFailed ? null : imgSrc);
  const displayCoverSrc = coverPreview ?? (coverRemoteFailed ? null : coverSrc);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    setAvatarError(null);
    const local = URL.createObjectURL(file);
    setAvatarPreview(local);
    setPendingAvatarFile(file);
    setAvatarCropImageUrl(local);
    setAvatarCropOpen(true);
  }

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setCoverError(err);
      return;
    }
    setCoverError(null);
    const local = URL.createObjectURL(file);
    previousCoverCropRef.current = coverCrop;
    setCoverCrop(null);
    setCoverPreview(local);
    setPendingCoverFile(file);
    setCoverCropImageUrl(local);
    setCoverCropOpen(true);
  }

  async function onDeleteCover() {
    if (!apiAccessToken) return;
    setCoverError(null);
    setCoverUploading(true);
    const res = await nestDeleteCover(apiAccessToken);
    setCoverUploading(false);
    if (!res.ok) {
      setCoverError(res.error ?? 'Smazání cover se nezdařilo.');
      return;
    }
    setNestCover(null);
    await refresh();
    setUser((prev) => (prev ? { ...prev, coverImage: null } : prev));
    showSuccess('Cover byl odstraněn.');
  }

  function isTouchLikeDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  function openAvatarEditorFromImage() {
    if (!displayAvatarSrc) {
      avatarInputRef.current?.click();
      return;
    }
    setPendingAvatarFile(null);
    setAvatarCropImageUrl(displayAvatarSrc);
    setAvatarCropOpen(true);
  }

  function openCoverEditorFromImage() {
    if (!displayCoverSrc) {
      coverInputRef.current?.click();
      return;
    }
    setPendingCoverFile(null);
    setCoverCropImageUrl(displayCoverSrc);
    setCoverCropOpen(true);
  }

  async function onSaveAvatarCrop(crop: ImageCrop) {
    if (!apiAccessToken) return;
    if (pendingAvatarFile) {
      setAvatarUploading(true);
      const upload = await nestUploadAvatar(apiAccessToken, pendingAvatarFile, crop);
      setAvatarUploading(false);
      if (upload.error) {
        setAvatarError(upload.error);
        return;
      }
      if (upload.avatarUrl) {
        setNestAvatar(upload.avatarUrl);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                avatar: upload.avatarUrl ?? prev.avatar ?? null,
              }
            : prev,
        );
      }
      await refresh();
      setPendingAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarCrop(crop);
      setAvatarCropOpen(false);
      setAvatarCropImageUrl(null);
      showSuccess('Profilová fotka byla uložena.');
      return;
    }
    if (!nestAvatar) return;
    const res = await nestPatchAvatarCrop(apiAccessToken, nestAvatar, crop);
    if (!res.ok) {
      setAvatarError(res.error ?? 'Uložení výřezu profilové fotky selhalo.');
      return;
    }
    setAvatarCrop(crop);
    setAvatarCropOpen(false);
    setAvatarCropImageUrl(null);
    await loadNestProfile();
    await refresh();
    showSuccess('Výřez profilové fotky byl uložen.');
  }

  async function onSaveCoverCrop(crop: ImageCrop) {
    if (!apiAccessToken) return;
    if (pendingCoverFile) {
      setCoverUploading(true);
      const upload = await nestUploadCover(apiAccessToken, pendingCoverFile, crop);
      setCoverUploading(false);
      if (upload.error) {
        setCoverError(upload.error);
        return;
      }
      if (upload.coverImageUrl) {
        setNestCover(upload.coverImageUrl);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                coverImage: upload.coverImageUrl ?? prev.coverImage ?? null,
              }
            : prev,
        );
      }
      await refresh();
      setPendingCoverFile(null);
      previousCoverCropRef.current = null;
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverPreview(null);
      setCoverCrop(crop);
      setCoverCropOpen(false);
      setCoverCropImageUrl(null);
      showSuccess('Cover obrázek byl uložen.');
      return;
    }
    if (!nestCover) return;
    const res = await nestPatchCoverCrop(apiAccessToken, nestCover, crop);
    if (!res.ok) {
      setCoverError(res.error ?? 'Uložení výřezu cover fotky selhalo.');
      return;
    }
    setCoverCrop(crop);
    setCoverCropOpen(false);
    setCoverCropImageUrl(null);
    await loadNestProfile();
    await refresh();
    showSuccess('Výřez cover fotky byl uložen.');
  }

  async function onSaveBio() {
    if (!apiAccessToken) return;
    if (bioDraft.length > BIO_MAX) {
      setBioError(`Bio může mít maximálně ${BIO_MAX} znaků.`);
      return;
    }
    setBioError(null);
    setBioSaving(true);
    const res = await nestPatchProfileBio(apiAccessToken, {
      bio: bioDraft.trim() || null,
      name: profileNameDraft.trim(),
      phone: profilePhoneDraft.trim(),
      phonePublic: profilePhonePublicDraft,
    });
    setBioSaving(false);
    if (!res.ok) {
      setBioError(res.error ?? 'Uložení bio se nezdařilo.');
      return;
    }
    setNestBio(res.bio ?? null);
    setBioEditing(false);
    await refresh();
    setUser((prev) =>
      prev
        ? {
            ...prev,
            name: res.name ?? (profileNameDraft.trim() || prev.name),
            phone: res.phone ?? profilePhoneDraft.trim(),
            phonePublic: res.phonePublic ?? profilePhonePublicDraft,
            bio: res.bio ?? null,
          }
        : prev,
    );
    showSuccess('Popis „O mně“ byl uložen.');
  }

  async function onToggleProfessionalVisibility(next: boolean) {
    if (!apiAccessToken) return;
    if (!['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user?.role ?? '')) return;
    setVisibilitySaving(true);
    const res = await nestPatchProfessionalVisibility(apiAccessToken, next);
    setVisibilitySaving(false);
    if (!res.ok) {
      showSuccess(res.error ?? 'Uložení veřejnosti profilu se nezdařilo.');
      return;
    }
    setProfessionalVisibility(next);
    await loadNestProfile();
    showSuccess(next ? 'Profil je nyní veřejný.' : 'Profil je nyní neveřejný.');
  }

  async function onToggleProfileVisibility(next: boolean) {
    if (!apiAccessToken) return;
    setProfileVisibilitySaving(true);
    const res = await nestPatchProfileVisibility(apiAccessToken, next);
    setProfileVisibilitySaving(false);
    if (!res.ok) {
      showSuccess(res.error ?? 'Uložení veřejnosti profilu se nezdařilo.');
      return;
    }
    setIsProfilePublic(next);
    showSuccess(next ? 'Profil je nyní veřejný.' : 'Profil je nyní neveřejný.');
  }

  async function onChangePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken) return;
    if (newPassword.length < 8) {
      setPasswordError('Nové heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Nové heslo a potvrzení se neshodují.');
      return;
    }
    setPasswordError(null);
    setPasswordSaving(true);
    const res = await nestChangeMyPassword(apiAccessToken, {
      currentPassword,
      newPassword,
      confirmPassword: newPasswordConfirm,
    });
    setPasswordSaving(false);
    if (!res.ok) {
      setPasswordError(res.error ?? 'Změna hesla se nezdařila.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    showSuccess('Heslo bylo úspěšně změněno.');
  }

  async function onDeleteAvatar() {
    if (!apiAccessToken) return;
    if (!window.confirm('Opravdu odstranit profilovou fotku?')) return;
    setAvatarError(null);
    setAvatarUploading(true);
    const res = await nestDeleteAvatar(apiAccessToken);
    setAvatarUploading(false);
    if (!res.ok) {
      setAvatarError(res.error ?? 'Smazání profilové fotky se nezdařilo.');
      return;
    }
    setNestAvatar(null);
    setAvatarCrop(null);
    await refresh();
    setUser((prev) => (prev ? { ...prev, avatar: null, avatarCrop: null } : prev));
    showSuccess('Profilová fotka byla odstraněna.');
  }

  function onStartWallPostEdit(post: NestProfileWallPost) {
    setWallEditPostId(post.id);
    setWallEditText((post.content || post.description || '').trim());
  }

  async function onSaveWallPostEdit(postId: string) {
    if (!apiAccessToken) return;
    const text = wallEditText.trim();
    setWallBusyPostId(postId);
    const res = await nestUpdateMyPost(apiAccessToken, postId, text);
    setWallBusyPostId(null);
    if (!res.ok) {
      window.alert(res.error ?? 'Úprava příspěvku se nezdařila.');
      return;
    }
    setWallPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, content: text || null, description: text } : p)),
    );
    setWallEditPostId(null);
    setWallEditText('');
  }

  async function onDeleteWallPost(postId: string) {
    if (!apiAccessToken) return;
    if (!window.confirm('Opravdu chcete tento příspěvek smazat?')) return;
    setWallBusyPostId(postId);
    const res = await nestDeleteMyPost(apiAccessToken, postId);
    setWallBusyPostId(null);
    if (!res.ok) {
      window.alert(res.error ?? 'Smazání příspěvku se nezdařilo.');
      return;
    }
    setWallPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function prefillAgentFormFromProfile() {
    const ap = nestMe?.agentProfile;
    if (ap) {
      setAgentFullName(ap.fullName);
      setAgentCompany(ap.companyName);
      setAgentPhone(ap.phone);
      setAgentWeb(ap.website || '');
      setAgentIco(ap.ico || '');
      setAgentCity(ap.city);
      setAgentBio(ap.bio);
      setAgentLogoUrl(ap.avatarUrl);
    } else {
      setAgentFullName(
        (nestMe?.name ?? user?.name ?? '').trim() || '',
      );
      setAgentCompany('');
      setAgentPhone('');
      setAgentWeb('');
      setAgentIco('');
      setAgentCity('');
      setAgentBio('');
      setAgentLogoUrl(null);
    }
  }

  function onOpenAgentForm() {
    setAgentFormError(null);
    prefillAgentFormFromProfile();
    setAgentFormOpen(true);
  }

  useEffect(() => {
    if (typeof window === 'undefined' || uctNavHandledRef.current || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const uct = params.get('uct');
    if (!uct) return;

    if (!canRequestProfessionalProfileUpgrade(user?.role)) {
      uctNavHandledRef.current = true;
      router.replace('/profil', { scroll: false });
      return;
    }

    uctNavHandledRef.current = true;
    if (uct === 'agent') {
      onOpenAgentForm();
    } else if (uct === 'company') {
      setCompanyFormOpen(true);
    } else if (uct === 'agency') {
      setAgencyFormOpen(true);
    } else if (uct === 'financial_advisor') {
      setAdvisorFormOpen(true);
    } else if (uct === 'investor') {
      setInvestorFormOpen(true);
    }

    router.replace('/profil', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorázová navigace z ?uct= po načtení profilu
  }, [isAuthenticated, user?.role, router]);

  async function onAgentLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = assertImageFile(file);
    if (err) {
      setAgentFormError(err);
      return;
    }
    setAgentFormError(null);
    setAgentLogoUploading(true);
    const res = await nestUploadAgentProfileLogo(apiAccessToken, file);
    setAgentLogoUploading(false);
    if (res.error) {
      setAgentFormError(res.error);
      return;
    }
    if (res.url) setAgentLogoUrl(res.url);
  }

  async function onSubmitAgentRequest(e: React.FormEvent) {
    e.preventDefault();
    setAgentFormError(null);
    const icoT = agentIco.trim();
    if (icoT && !/^\d{8}$/.test(icoT)) {
      setAgentFormError('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
      return;
    }
    if (agentBio.trim().length < 10) {
      setAgentFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    setAgentSubmitting(true);
    const res = await nestSubmitAgentProfileRequest(apiAccessToken, {
      fullName: agentFullName.trim(),
      companyName: agentCompany.trim(),
      phone: agentPhone.trim(),
      website: agentWeb.trim() || undefined,
      ico: icoT || undefined,
      city: agentCity.trim(),
      bio: agentBio.trim(),
      avatarUrl: agentLogoUrl?.trim() || undefined,
    });
    setAgentSubmitting(false);
    if (!res.ok) {
      setAgentFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAgentFormOpen(false);
    showSuccess(
      typeof res.data?.message === 'string'
        ? res.data.message
        : 'Žádost byla odeslána. Čeká na schválení administrátorem.',
    );
    await loadNestProfile();
  }

  async function onSubmitCompanyRequest(e: React.FormEvent) {
    e.preventDefault();
    setCompanyFormError(null);
    if (companyDesc.trim().length < 10 || companyServices.trim().length < 2) {
      setCompanyFormError('Vyplňte popis firmy a činnosti.');
      return;
    }
    setCompanySubmitting(true);
    const res = await nestSubmitCompanyProfileRequest(apiAccessToken, {
      companyName: companyName.trim(),
      contactFullName: companyContact.trim(),
      phone: companyPhone.trim(),
      email: companyEmail.trim(),
      website: companyWeb.trim() || undefined,
      ico: companyIco.trim() || undefined,
      city: companyCity.trim(),
      description: companyDesc.trim(),
      services: companyServices.trim(),
      logoUrl: companyLogoUrl?.trim() || undefined,
    });
    setCompanySubmitting(false);
    if (!res.ok) {
      setCompanyFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setCompanyFormOpen(false);
    showSuccess('Žádost stavební firmy byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitAgencyRequest(e: React.FormEvent) {
    e.preventDefault();
    setAgencyFormError(null);
    if (agencyDesc.trim().length < 10) {
      setAgencyFormError('Vyplňte popis kanceláře.');
      return;
    }
    setAgencySubmitting(true);
    const res = await nestSubmitAgencyProfileRequest(apiAccessToken, {
      agencyName: agencyName.trim(),
      contactFullName: agencyContact.trim(),
      phone: agencyPhone.trim(),
      email: agencyEmail.trim(),
      website: agencyWeb.trim() || undefined,
      ico: agencyIco.trim() || undefined,
      city: agencyCity.trim(),
      description: agencyDesc.trim(),
      agentCount: agencyAgentCount.trim() ? Number(agencyAgentCount) : undefined,
      branchCities: agencyBranches
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      logoUrl: agencyLogoUrl?.trim() || undefined,
    });
    setAgencySubmitting(false);
    if (!res.ok) {
      setAgencyFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAgencyFormOpen(false);
    showSuccess('Žádost realitní kanceláře byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitAdvisorRequest(e: React.FormEvent) {
    e.preventDefault();
    setAdvisorFormError(null);
    if (advisorBio.trim().length < 10) {
      setAdvisorFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    const specializations = advisorSpecializations
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (specializations.length === 0) {
      setAdvisorFormError('Vyplňte alespoň jednu oblast specializace.');
      return;
    }
    setAdvisorSubmitting(true);
    const res = await nestSubmitFinancialAdvisorProfileRequest(apiAccessToken, {
      fullName: advisorFullName.trim(),
      brandName: advisorBrandName.trim() || undefined,
      phone: advisorPhone.trim(),
      email: advisorEmail.trim(),
      website: advisorWeb.trim() || undefined,
      ico: advisorIco.trim() || undefined,
      city: advisorCity.trim(),
      bio: advisorBio.trim(),
      specializations,
      avatarUrl: advisorAvatarUrl.trim() || undefined,
      logoUrl: advisorLogoUrl.trim() || undefined,
    });
    setAdvisorSubmitting(false);
    if (!res.ok) {
      setAdvisorFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAdvisorFormOpen(false);
    showSuccess('Žádost finančního poradce byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitInvestorRequest(e: React.FormEvent) {
    e.preventDefault();
    setInvestorFormError(null);
    if (investorBio.trim().length < 10) {
      setInvestorFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    const investmentFocus = investorFocus
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (investmentFocus.length === 0) {
      setInvestorFormError('Vyplňte alespoň jedno investiční zaměření.');
      return;
    }
    setInvestorSubmitting(true);
    const res = await nestSubmitInvestorProfileRequest(apiAccessToken, {
      fullName: investorFullName.trim(),
      investorName: investorName.trim() || undefined,
      investorType: investorType.trim(),
      phone: investorPhone.trim(),
      email: investorEmail.trim(),
      website: investorWeb.trim() || undefined,
      city: investorCity.trim(),
      bio: investorBio.trim(),
      investmentFocus,
      avatarUrl: investorAvatarUrl.trim() || undefined,
      logoUrl: investorLogoUrl.trim() || undefined,
    });
    setInvestorSubmitting(false);
    if (!res.ok) {
      setInvestorFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setInvestorFormOpen(false);
    showSuccess('Žádost investora byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center overflow-y-auto bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto h-[100dvh] max-w-lg overflow-y-auto px-4 py-16 text-center">
        <p className="text-lg font-medium text-zinc-800">Nejste přihlášeni</p>
        <Link
          href="/login"
          className="mt-4 inline-block w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white md:w-auto md:px-8"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col px-4 pt-6 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
      </div>

      {successMsg ? (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          >
            {successMsg}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
          {/* Cover */}
          <div
            className={`group relative aspect-[21/9] min-h-[140px] w-full sm:min-h-[168px] md:aspect-[3/1] md:min-h-[200px] ${
              'cursor-pointer'
            }`}
            onDoubleClick={(e) => {
              if (!displayCoverSrc) return;
              e.preventDefault();
              e.stopPropagation();
              setProfileActionsOpen('cover');
            }}
            onClick={(e) => {
              if (!isTouchLikeDevice()) {
                if (displayCoverSrc) return;
              }
              e.preventDefault();
              e.stopPropagation();
              openCoverEditorFromImage();
            }}
          >
            {displayCoverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayCoverSrc}
                alt=""
                className={`absolute inset-0 size-full ${coverCrop ? 'object-cover' : 'object-contain'}`}
                style={coverCrop ? imageCropToStyle(coverCrop) : undefined}
                onError={() => setCoverRemoteFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-600 opacity-95" />
            )}
            {coverUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-medium text-white backdrop-blur-[2px]">
                Nahrávám cover…
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/35 text-xs font-semibold text-white opacity-0 transition group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100 md:text-sm">
              {displayCoverSrc ? 'Chcete upravit obrázek?' : 'Nahrát titulní fotku'}
            </div>
          </div>

          <div className="relative px-4 pb-8 pt-4 sm:px-8 sm:pt-6">
            <div className="-mt-6 flex flex-col gap-6 sm:-mt-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
                  <div
                  className="group relative shrink-0 cursor-pointer"
                  onDoubleClick={(e) => {
                    if (!displayAvatarSrc) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setProfileActionsOpen('avatar');
                  }}
                  onClick={(e) => {
                    if (!isTouchLikeDevice()) {
                      if (displayAvatarSrc) return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    openAvatarEditorFromImage();
                  }}
                >
                  <div className="rounded-full bg-white p-1 shadow-md ring-2 ring-white">
                    {displayAvatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayAvatarSrc}
                        alt=""
                        className="size-28 rounded-full object-cover sm:size-32"
                        style={imageCropToStyle(avatarCrop)}
                        onError={() => setAvatarRemoteFailed(true)}
                      />
                    ) : (
                      <div className="flex size-28 items-center justify-center rounded-full bg-zinc-100 text-3xl font-semibold text-zinc-500 sm:size-32">
                        {(user.name?.trim().charAt(0) || 'U').toUpperCase()}
                      </div>
                    )}
                    {avatarUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white">
                        Nahrávám…
                      </div>
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 px-3 text-center text-[10px] font-semibold text-white opacity-0 transition group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100 sm:text-xs">
                      {displayAvatarSrc
                        ? 'Dvojklik: změna / odstranění'
                        : 'Nahrát profilovou fotku'}
                    </div>
                  </div>
                  </div>
                </div>
                <div className="min-w-0 max-w-xl rounded-2xl bg-white/95 p-3 text-center shadow-sm ring-1 ring-zinc-100 sm:pb-2 sm:text-left">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {user.name?.trim() || 'Uživatel'}
                    </h1>
                    {user.role === 'AGENT' ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        Ověřený makléř
                      </span>
                    ) : null}
                    {canRequestProfessionalProfileUpgrade(user.role) &&
                    nestMe?.agentProfile?.verificationStatus === 'pending' ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        Čeká na ověření
                      </span>
                    ) : null}
                    {canRequestProfessionalProfileUpgrade(user.role) &&
                    nestMe?.agentProfile?.verificationStatus === 'rejected' ? (
                      <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
                        Žádost zamítnuta
                      </span>
                    ) : null}
                  </div>
                  {user.role === 'AGENT' ? (
                    <p className="mt-2 text-sm">
                      <Link
                        href={`/agent/${encodeURIComponent(user.id)}`}
                        className="font-semibold text-[#e85d00] hover:underline"
                      >
                        Veřejný profil makléře
                      </Link>
                    </p>
                  ) : null}
                  {bioText && !bioEditing ? (
                    <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {bioText}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm font-semibold text-zinc-800">
                    Kredit:{' '}
                    <span className="text-[#e85d00]">
                      {(nestMe?.creditBalance ?? 0).toLocaleString('cs-CZ')} Kč
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={avatarUploading || !apiAccessToken}
                  onChange={(ev) => void onAvatarChange(ev)}
                />
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={coverUploading || !apiAccessToken}
                  onChange={(ev) => void onCoverChange(ev)}
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Hlavní akce profilu</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Správa inzerátů, reklamy, nastavení profilu, zprávy a notifikace jsou soustředěné v
                jednom dashboardu.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/profil/dashboard?tab=listings"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                >
                  Správa inzerátů
                </Link>
                <Link
                  href="/profil/dashboard?tab=ads"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                >
                  Nastavení reklam
                </Link>
                <Link
                  href="/profil/dashboard?tab=settings"
                  className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-100"
                >
                  Nastavení profilu
                </Link>
                <Link
                  href="/profil/dashboard?tab=messages"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                >
                  Zprávy
                </Link>
                <Link
                  href="/profil/dashboard?tab=notifications"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                >
                  Notifikace
                </Link>
              </div>
            </div>

            {['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user.role) ? (
              <div className="mt-4">
                <label className="inline-flex cursor-pointer rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  {storyUploading ? 'Nahrávám…' : 'Přidej příběh'}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    disabled={storyUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void onCreateStory(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {storyError ? <p className="mt-2 text-sm text-red-600">{storyError}</p> : null}
              </div>
            ) : null}

            {avatarError ? (
              <p className="mt-4 text-sm text-red-600">{avatarError}</p>
            ) : null}
            {coverError ? (
              <p className="mt-2 text-sm text-red-600">{coverError}</p>
            ) : null}

            {bioEditing ? (
              <div id="upravit-bio" className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-zinc-800">
                    Veřejné jméno
                    <input
                      value={profileNameDraft}
                      onChange={(e) => setProfileNameDraft(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                      placeholder="Vaše jméno"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Telefon
                    <input
                      value={profilePhoneDraft}
                      onChange={(e) => setProfilePhoneDraft(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                      placeholder="+420123456789"
                    />
                  </label>
                </div>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={profilePhonePublicDraft}
                    onChange={(e) => setProfilePhonePublicDraft(e.target.checked)}
                    className="size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/50"
                  />
                  Zobrazit telefon veřejně
                </label>
                <label className="block text-sm font-semibold text-zinc-800">
                  O mně (max. {BIO_MAX} znaků)
                </label>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={5}
                  maxLength={BIO_MAX}
                  className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                  placeholder="Krátký popis o sobě…"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {bioDraft.length}/{BIO_MAX}
                  </span>
                  <button
                    type="button"
                    disabled={bioSaving || !apiAccessToken}
                    onClick={() => void onSaveBio()}
                    className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {bioSaving ? 'Ukládám…' : 'Uložit bio'}
                  </button>
                </div>
                {bioError ? <p className="mt-2 text-sm text-red-600">{bioError}</p> : null}
              </div>
            ) : null}

            {!apiAccessToken ? (
              <p className="mt-6 text-xs text-amber-800">
                Pro změny profilu přes Nest API nastavte{' '}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> a přihlaste se
                (JWT v cookie).
              </p>
            ) : null}
          </div>
        </section>

        {canRequestProfessionalProfileUpgrade(user.role) ? (
          <section
            id="rozsirovani-uctu"
            className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-zinc-900">Rozšířit účet</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Vyberte typ profesionálního účtu. Role se přepne až po schválení administrátorem.
            </p>
            {nestMe?.agentProfile?.verificationStatus === 'pending' ? (
              <p className="mt-3 text-sm font-medium text-amber-800">
                Vaše žádost čeká na schválení. Můžete ji upravit a znovu odeslat.
              </p>
            ) : null}
            {nestMe?.agentProfile?.verificationStatus === 'rejected' ? (
              <p className="mt-3 text-sm font-medium text-zinc-700">
                Předchozí žádost byla zamítnuta. Upravte údaje a pošlete novou žádost.
              </p>
            ) : null}
            {!agentFormOpen &&
            !companyFormOpen &&
            !agencyFormOpen &&
            !advisorFormOpen &&
            !investorFormOpen ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAgentForm()}
                  className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                >
                  Jsem makléř
                </button>
                <button
                  type="button"
                  onClick={() => setCompanyFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Mám stavební firmu
                </button>
                <button
                  type="button"
                  onClick={() => setAgencyFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem realitní kancelář
                </button>
                <button
                  type="button"
                  onClick={() => setAdvisorFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem finanční poradce
                </button>
                <button
                  type="button"
                  onClick={() => setInvestorFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem investor
                </button>
              </div>
            ) : null}
            {agentFormOpen ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(ev) => void onSubmitAgentRequest(ev)}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-zinc-800">
                    Jméno a příjmení
                    <input
                      required
                      value={agentFullName}
                      onChange={(e) => setAgentFullName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Název kanceláře nebo značky
                    <input
                      required
                      value={agentCompany}
                      onChange={(e) => setAgentCompany(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Telefonní číslo
                    <input
                      required
                      value={agentPhone}
                      onChange={(e) => setAgentPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <div className="block text-sm font-semibold text-zinc-800">
                    <span>Stav telefonu</span>
                    <p className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-normal text-zinc-700">
                      {nestMe?.agentProfile?.phoneVerified
                        ? 'Telefon ověřen'
                        : 'Telefon neověřen (SMS ověření připravujeme)'}
                    </p>
                  </div>
                  <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
                    Webová stránka (volitelné)
                    <input
                      value={agentWeb}
                      onChange={(e) => setAgentWeb(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    IČO (volitelné, 8 číslic)
                    <input
                      value={agentIco}
                      onChange={(e) => setAgentIco(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Město / lokalita působnosti
                    <input
                      required
                      value={agentCity}
                      onChange={(e) => setAgentCity(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                </div>
                <label className="block text-sm font-semibold text-zinc-800">
                  Krátké bio (min. 10 znaků)
                  <textarea
                    required
                    value={agentBio}
                    onChange={(e) => setAgentBio(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                  />
                </label>
                <div>
                  <p className="text-sm font-semibold text-zinc-800">Profilová fotka nebo logo</p>
                  <input
                    ref={agentLogoInputRef}
                    type="file"
                    accept={ACCEPT_IMAGES}
                    className="hidden"
                    disabled={agentLogoUploading}
                    onChange={(ev) => void onAgentLogoChange(ev)}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={agentLogoUploading}
                      onClick={() => agentLogoInputRef.current?.click()}
                      className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {agentLogoUploading ? 'Nahrávám…' : 'Nahrát obrázek'}
                    </button>
                    {agentLogoUrl ? (
                      <span className="text-xs text-zinc-600">Nahráno</span>
                    ) : (
                      <span className="text-xs text-zinc-500">Volitelné</span>
                    )}
                  </div>
                </div>
                {agentFormError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {agentFormError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={agentSubmitting}
                    className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
                  >
                    {agentSubmitting ? 'Odesílám…' : 'Odeslat žádost'}
                  </button>
                  <button
                    type="button"
                    disabled={agentSubmitting}
                    onClick={() => {
                      setAgentFormOpen(false);
                      setAgentFormError(null);
                    }}
                    className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Zrušit
                  </button>
                </div>
              </form>
            ) : null}
            {companyFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitCompanyRequest(e)}>
                <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Název firmy" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} placeholder="Kontaktní osoba" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyWeb} onChange={(e) => setCompanyWeb(e.target.value)} placeholder="Web" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyIco} onChange={(e) => setCompanyIco(e.target.value)} placeholder="IČO" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="Město / lokalita" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyLogoUrl ?? ''} onChange={(e) => setCompanyLogoUrl(e.target.value)} placeholder="Logo URL" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <textarea required value={companyDesc} onChange={(e) => setCompanyDesc(e.target.value)} placeholder="Krátký popis firmy" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={companyServices} onChange={(e) => setCompanyServices(e.target.value)} placeholder="Co firma provádí" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                {companyFormError ? <p className="text-sm text-red-600 sm:col-span-2">{companyFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={companySubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{companySubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setCompanyFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {agencyFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitAgencyRequest(e)}>
                <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Název kanceláře" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={agencyContact} onChange={(e) => setAgencyContact(e.target.value)} placeholder="Odpovědná osoba" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={agencyPhone} onChange={(e) => setAgencyPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={agencyEmail} onChange={(e) => setAgencyEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyWeb} onChange={(e) => setAgencyWeb(e.target.value)} placeholder="Web" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyIco} onChange={(e) => setAgencyIco(e.target.value)} placeholder="IČO" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={agencyCity} onChange={(e) => setAgencyCity(e.target.value)} placeholder="Město / působnost" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyLogoUrl ?? ''} onChange={(e) => setAgencyLogoUrl(e.target.value)} placeholder="Logo URL" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyAgentCount} onChange={(e) => setAgencyAgentCount(e.target.value)} placeholder="Počet makléřů (volitelně)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyBranches} onChange={(e) => setAgencyBranches(e.target.value)} placeholder="Pobočky / města (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <textarea required value={agencyDesc} onChange={(e) => setAgencyDesc(e.target.value)} placeholder="Popis kanceláře" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                {agencyFormError ? <p className="text-sm text-red-600 sm:col-span-2">{agencyFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={agencySubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{agencySubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setAgencyFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {advisorFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitAdvisorRequest(e)}>
                <input required value={advisorFullName} onChange={(e) => setAdvisorFullName(e.target.value)} placeholder="Jméno a příjmení" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorBrandName} onChange={(e) => setAdvisorBrandName(e.target.value)} placeholder="Název značky / firmy (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={advisorPhone} onChange={(e) => setAdvisorPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={advisorEmail} onChange={(e) => setAdvisorEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorWeb} onChange={(e) => setAdvisorWeb(e.target.value)} placeholder="Web (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorIco} onChange={(e) => setAdvisorIco(e.target.value)} placeholder="IČO (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={advisorCity} onChange={(e) => setAdvisorCity(e.target.value)} placeholder="Město / oblast působnosti" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={advisorBio} onChange={(e) => setAdvisorBio(e.target.value)} placeholder="Krátké bio" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={advisorSpecializations} onChange={(e) => setAdvisorSpecializations(e.target.value)} placeholder="Oblasti specializace (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input value={advisorAvatarUrl} onChange={(e) => setAdvisorAvatarUrl(e.target.value)} placeholder="Profilová fotka URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorLogoUrl} onChange={(e) => setAdvisorLogoUrl(e.target.value)} placeholder="Logo URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                {advisorFormError ? <p className="text-sm text-red-600 sm:col-span-2">{advisorFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={advisorSubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{advisorSubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setAdvisorFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {investorFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitInvestorRequest(e)}>
                <input required value={investorFullName} onChange={(e) => setInvestorFullName(e.target.value)} placeholder="Jméno a příjmení / název investora" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Název investora (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorType} onChange={(e) => setInvestorType(e.target.value)} placeholder="Typ investora" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorPhone} onChange={(e) => setInvestorPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={investorEmail} onChange={(e) => setInvestorEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorWeb} onChange={(e) => setInvestorWeb(e.target.value)} placeholder="Web (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorCity} onChange={(e) => setInvestorCity(e.target.value)} placeholder="Město / lokalita" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={investorBio} onChange={(e) => setInvestorBio(e.target.value)} placeholder="Bio" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={investorFocus} onChange={(e) => setInvestorFocus(e.target.value)} placeholder="Investiční zaměření (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input value={investorAvatarUrl} onChange={(e) => setInvestorAvatarUrl(e.target.value)} placeholder="Profilová fotka URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorLogoUrl} onChange={(e) => setInvestorLogoUrl(e.target.value)} placeholder="Logo URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                {investorFormError ? <p className="text-sm text-red-600 sm:col-span-2">{investorFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={investorSubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{investorSubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setInvestorFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        

        <section className="order-20 mt-10 -mx-4 rounded-none border-y border-zinc-200 bg-white p-1 shadow-sm sm:mx-0 sm:rounded-2xl sm:border sm:p-5">
          <h2 className="text-lg font-semibold text-zinc-900">Příspěvky</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Veřejná zeď publikovaných příspěvků, videí a promo obsahu profilu.
          </p>
          {wallLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám příspěvky…</p>
          ) : wallPosts.length === 0 && wallVideos.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím nejsou k dispozici žádné publikované příspěvky.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {wallPosts.map((post) => {
                const medias = Array.isArray(post.media)
                  ? post.media.filter((m) => typeof m?.url === 'string' && m.url.trim())
                  : [];
                return (
                  <article
                    key={`post-${post.id}`}
                    className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl"
                  >
                    <div className="flex items-start justify-between gap-2 px-3 pt-3 md:px-4 md:pt-4">
                      <div>
                        <p className="text-xs font-medium text-zinc-500">Autor</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">
                          {post.title?.trim() || 'Příspěvek'}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={wallBusyPostId === post.id}
                          onClick={() => onStartWallPostEdit(post)}
                          className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Upravit
                        </button>
                        <button
                          type="button"
                          disabled={wallBusyPostId === post.id}
                          onClick={() => void onDeleteWallPost(post.id)}
                          className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
                        >
                          Smazat
                        </button>
                      </div>
                    </div>
                    <p className="px-3 pt-1 text-xs text-zinc-500 md:px-4">
                      {post.createdAt ? new Date(post.createdAt).toLocaleString('cs-CZ') : ''}
                    </p>
                    {wallEditPostId === post.id ? (
                      <div className="mt-2 space-y-2 px-3 pb-3 md:px-4 md:pb-4">
                        <textarea
                          value={wallEditText}
                          onChange={(e) => setWallEditText(e.target.value)}
                          rows={4}
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={wallBusyPostId === post.id}
                            onClick={() => void onSaveWallPostEdit(post.id)}
                            className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Uložit
                          </button>
                          <button
                            type="button"
                            disabled={wallBusyPostId === post.id}
                            onClick={() => {
                              setWallEditPostId(null);
                              setWallEditText('');
                            }}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-50"
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    ) : (post.content || post.description) && (
                      <p className="px-3 py-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 md:px-4">
                        {post.content || post.description}
                      </p>
                    )}
                    {medias.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {medias.map((media, idx) => {
                          const mediaUrl =
                            media.url && /^https?:\/\//i.test(media.url)
                              ? media.url
                              : nestAbsoluteAssetUrl(media.url ?? '') || (media.url ?? '');
                          const mediaType =
                            typeof media.type === 'string' ? media.type.toLowerCase() : '';
                          if (mediaType === 'video') {
                            return (
                              <video
                                key={`${post.id}-video-${idx}`}
                                src={mediaUrl}
                                className="h-auto w-full rounded-2xl bg-black object-contain"
                                controls
                                preload="metadata"
                              />
                            );
                          }
                          return (
                            <img
                              key={`${post.id}-image-${idx}`}
                              src={mediaUrl}
                              alt=""
                              className="h-auto w-full rounded-2xl object-contain"
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {wallVideos.map((video) => {
                const vurl =
                  video.url && /^https?:\/\//i.test(video.url)
                    ? video.url
                    : video.url
                      ? nestAbsoluteAssetUrl(video.url) || video.url
                      : null;
                return (
                  <article
                    key={`video-${video.id}`}
                    className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl"
                  >
                    <p className="px-3 pt-3 text-xs font-medium text-zinc-500 md:px-4 md:pt-4">
                      Video
                    </p>
                    <p className="px-3 pt-1 text-sm font-semibold text-zinc-900 md:px-4">Video příspěvek</p>
                    <p className="px-3 pt-1 text-xs text-zinc-500 md:px-4">
                      {video.createdAt ? new Date(video.createdAt).toLocaleString('cs-CZ') : ''}
                    </p>
                    {video.description ? (
                      <p className="px-3 py-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 md:px-4">
                        {video.description}
                      </p>
                    ) : null}
                    {vurl ? (
                      <video
                        src={vurl}
                        className="mt-3 h-auto w-full rounded-2xl bg-black object-contain"
                        controls
                        preload="metadata"
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">Oblíbené nemovitosti</h2>
          {favLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám oblíbené…</p>
          ) : favError ? (
            <p className="mt-4 text-sm text-red-600">{favError}</p>
          ) : favorites.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím žádné — přidejte ❤️ u nemovitosti na hlavní stránce.
            </p>
          ) : (
            <div className="mt-4">
              <PropertyGrid properties={favorites} />
            </div>
          )}
        </section>

        

      </div>

      

      {profileActionsOpen ? (
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Zavřít"
            onClick={() => setProfileActionsOpen(null)}
          />
          <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900">
              {profileActionsOpen === 'avatar' ? 'Profilová fotka' : 'Titulní fotka'}
            </h3>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setProfileActionsOpen(null);
                  if (profileActionsOpen === 'avatar') avatarInputRef.current?.click();
                  else coverInputRef.current?.click();
                }}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Nahrát novou fotku
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileActionsOpen(null);
                  if (profileActionsOpen === 'avatar') {
                    void onDeleteAvatar();
                  } else if (coverSrc) {
                    void onDeleteCover();
                  }
                }}
                className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Odstranit fotku
              </button>
              <button
                type="button"
                onClick={() => setProfileActionsOpen(null)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              >
                Zrušit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProfessionalOnlyDialog
        open={professionalListingDialogOpen}
        onClose={() => setProfessionalListingDialogOpen(false)}
      />
      <ImageCropEditorModal
        open={avatarCropOpen}
        title="Upravit profilovou fotku"
        imageUrl={avatarCropImageUrl}
        aspect="square"
        initialCrop={avatarCrop}
        onCancel={() => {
          if (pendingAvatarFile && avatarPreview) {
            URL.revokeObjectURL(avatarPreview);
            setAvatarPreview(null);
          }
          setPendingAvatarFile(null);
          setAvatarCropOpen(false);
          setAvatarCropImageUrl(null);
        }}
        onSave={(crop) => void onSaveAvatarCrop(crop)}
      />
      <ImageCropEditorModal
        open={coverCropOpen}
        title="Upravit cover fotku"
        imageUrl={coverCropImageUrl}
        aspect="cover"
        initialCrop={pendingCoverFile ? null : coverCrop}
        fitWholeOnOpen={Boolean(pendingCoverFile)}
        onCancel={() => {
          if (pendingCoverFile && coverPreview) {
            URL.revokeObjectURL(coverPreview);
            setCoverPreview(null);
          }
          if (pendingCoverFile) {
            setCoverCrop(previousCoverCropRef.current ?? null);
            previousCoverCropRef.current = null;
          }
          setPendingCoverFile(null);
          setCoverCropOpen(false);
          setCoverCropImageUrl(null);
        }}
        onSave={(crop) => void onSaveCoverCrop(crop)}
      />
    </div>
  );
}
